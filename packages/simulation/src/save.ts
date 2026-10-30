import { getSector } from '@void-frontier/content';
import { createEconomy, detachTraders, reconcileEconomy, type Economy } from './economy.ts';
import { createCampaign, type Campaign } from './campaign.ts';
import { createFleet, type Fleet } from './fleet.ts';
import { captureOwned } from './orders.ts';
import { createBoard, type MissionBoard } from './missions.ts';
import { applyPlayer, applySectorSnapshot, captureSector, capturePlayer, markDiscovered, type PlayerState, type SectorSnapshot } from './sector.ts';
import { Simulation } from './simulation.ts';

/** Bump when the save shape changes, and add a migration below. */
export const SAVE_VERSION = 7;

/** The parts of the contract board that change; drops and stations come from content. */
export type SavedBoard = Pick<MissionBoard, 'offers' | 'active' | 'history' | 'reputation' | 'nextId' | 'refreshTick'>;

export interface SaveData {
  version: number;
  /** Sector the player is in. */
  sector: string;
  /** Simulation clock; it runs on across jumps, so contract deadlines stay valid. */
  tick: number;
  credits: number;
  player: PlayerState;
  /** What every visited sector remembers, including the current one. */
  sectors: Record<string, SectorSnapshot>;
  missions: SavedBoard | null;
  /** Points of interest already found, in any sector. */
  discovered: string[];
  /** Markets, haulers, events and news of every sector; null in saves made before 0.4. */
  economy: Economy | null;
  /** Ships parked in hangars; null in saves made before 0.5. */
  fleet: Fleet | null;
  /** Story progress; null in saves made before 0.7. */
  campaign: Campaign | null;
}

export interface GameState {
  sim: Simulation;
  memory: Record<string, SectorSnapshot>;
  discovered: Set<string>;
}

/** A consistent snapshot of everything a player would miss. Pirates and rounds in flight are not kept. */
export function serialize(state: GameState): SaveData {
  const { sim } = state;
  const board = sim.missions;
  return {
    version: SAVE_VERSION,
    sector: sim.world.sectorId,
    tick: sim.world.tick,
    credits: sim.world.credits,
    player: capturePlayer(sim),
    sectors: { ...structuredClone(state.memory), [sim.world.sectorId]: captureSector(sim) },
    missions: board
      ? structuredClone({ offers: board.offers, active: board.active, history: board.history, reputation: board.reputation, nextId: board.nextId, refreshTick: board.refreshTick })
      : null,
    discovered: [...state.discovered].sort(),
    economy: sim.economy ? (() => {
      const copy = structuredClone(sim.economy);
      detachTraders(copy);
      return copy;
    })() : null,
    fleet: savedFleet(sim),
    campaign: sim.campaign ? { ...sim.campaign } : null,
  };
}

/** The fleet with every real ship folded back into its stored state; ships re-materialise on load. */
function savedFleet(sim: Simulation): Fleet {
  const copy = structuredClone(sim.fleet);
  copy.ships.forEach((owned, i) => {
    const live = sim.fleet.ships[i];
    if (live.run?.shipId !== null && live.run?.shipId !== undefined) {
      const probe = { ...live, state: structuredClone(live.state) };
      captureOwned(sim.world, probe);
      owned.state = probe.state;
    }
    if (owned.run) owned.run.shipId = null;
  });
  return copy;
}

/** Rebuilds the current sector from its seed, then applies the saved state on top. */
export function restore(data: SaveData): GameState {
  const sector = getSector(data.sector);
  const board = createBoard();
  if (data.missions) {
    const m = structuredClone(data.missions);
    Object.assign(board, { offers: m.offers, active: m.active, history: m.history, reputation: { ...board.reputation, ...m.reputation }, nextId: m.nextId, refreshTick: m.refreshTick });
  }
  let economy = data.economy ? structuredClone(data.economy) : null;
  if (!economy) {
    // Saves from before the shared economy kept stock per sector: carry it over.
    economy = createEconomy();
    for (const [sectorId, snapshot] of Object.entries(data.sectors)) {
      getSector(sectorId).stations.forEach((station, index) => {
        const items = economy!.markets[station.id];
        snapshot.markets?.[index]?.forEach((stock, i) => {
          if (items?.[i]) items[i].stock = stock;
        });
      });
    }
  }
  reconcileEconomy(economy, data.tick);
  const sim = Simulation.fromSector(sector, undefined, {
    board,
    economy,
    campaign: data.campaign ? { ...data.campaign } : createCampaign(),
    fleet: data.fleet ? structuredClone(data.fleet) : createFleet(),
    playerShip: data.player.ship,
    startDocked: false,
  });
  sim.world.tick = data.tick;
  sim.world.credits = data.credits;
  const memory = structuredClone(data.sectors);
  const current = memory[data.sector];
  if (current) applySectorSnapshot(sim, current);
  delete memory[data.sector];
  const discovered = new Set(data.discovered);
  markDiscovered(sim, discovered);
  applyPlayer(sim, data.player);
  sim.world.events.length = 0;
  return { sim, memory, discovered };
}

/** Upgrades older saves step by step. Each entry turns version n into n + 1. */
const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {
  // 3 → 4: markets moved into the shared economy; `restore` rebuilds it from the old
  // per-sector stock when `economy` is null.
  3: (v3) => ({ ...v3, economy: null }),
  // 4 → 5: hangars. Older games own only the ship being flown.
  4: (v4) => ({ ...v4, fleet: null }),
  5: (v5) => {
    const fleet = v5.fleet as { ships: Record<string, unknown>[] } | null;
    if (!fleet) return v5;
    return {
      ...v5,
      fleet: {
        ...fleet,
        ships: fleet.ships.map((s) => ({ ...s, pilot: null, order: null, run: null, earned: 0 })),
        crew: [],
        offers: {},
        offersTick: 0,
        nextPilotId: 1,
        payTick: 0,
        log: [],
      },
    };
  },
  // 6 → 7: the story begins; the Anomaly Zone gained a station, so its rocks are regenerated around it.
  6: (v6) => {
    const sectors = { ...(v6.sectors as Record<string, unknown>) };
    delete sectors.anomaly_zone;
    return { ...v6, sectors, campaign: null };
  },
  // 2 → 3: reputation splits by faction (the old single score was the outpost's), ships
  // gain subsystems and weapon-mount health, contracts learn their issuer's faction.
  2: (v2) => {
    const missions = v2.missions as (Record<string, unknown> & { reputation: number; offers: Record<string, Record<string, unknown>[]>; active: Record<string, unknown>[] }) | null;
    const factionOf = (issuer: unknown) => (issuer === 'ferrum_refinery' ? 'ferrum_combine' : 'outpost_authority');
    const tag = (c: Record<string, unknown>) => ({ ...c, faction: factionOf(c.issuer) });
    const player = v2.player as Record<string, unknown>;
    return {
      ...v2,
      player: { ...player, subsystems: { engines: 1, reactor: 1, sensors: 1, shieldGenerator: 1, cargoHold: 1 }, mounts: [] },
      missions: missions
        ? {
            ...missions,
            reputation: { outpost_authority: missions.reputation, ferrum_combine: 0, free_pirates: -100 },
            offers: Object.fromEntries(Object.entries(missions.offers).map(([k, list]) => [k, list.map(tag)])),
            active: missions.active.map(tag),
          }
        : null,
    };
  },
  // 1 → 2: one sector became many. The single sector's state moves under `sectors`,
  // contracts learn which station issued them and which sector they deliver to.
  1: (v1) => {
    const sector = v1.sector as string;
    const tag = (contract: Record<string, unknown>) => ({
      ...contract,
      issuer: 'outpost_alpha_station',
      ...(contract.delivery ? { delivery: { ...(contract.delivery as object), sector } } : {}),
    });
    const missions = v1.missions as { offers: Record<string, unknown>[]; active: Record<string, unknown>[] } | null;
    return {
      sector,
      tick: v1.tick,
      credits: v1.credits,
      player: v1.player,
      sectors: { [sector]: { rng: v1.rng, asteroids: v1.asteroids, markets: v1.markets, pickups: v1.pickups } },
      missions: missions
        ? { ...missions, offers: { outpost_alpha_station: missions.offers.map(tag) }, active: missions.active.map(tag) }
        : null,
      discovered: [],
    };
  },
};

export function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object' || typeof (raw as { version?: unknown }).version !== 'number') throw new Error('Not a Void Frontier save');
  let data = raw as Record<string, unknown>;
  let version = data.version as number;
  if (version > SAVE_VERSION) throw new Error(`Save is from a newer version (${version})`);
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`No migration from save version ${version}`);
    data = { ...step(data), version: version + 1 };
    version++;
  }
  return data as unknown as SaveData;
}

/** FNV-1a over the JSON text: catches truncated or hand-edited saves. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface SaveFile {
  format: 'void-frontier-save';
  checksum: string;
  payload: string;
}

export function encodeSave(data: SaveData): SaveFile {
  const payload = JSON.stringify(data);
  return { format: 'void-frontier-save', checksum: checksum(payload), payload };
}

/** Verifies integrity, then migrates. Throws with a readable reason on any problem. */
export function decodeSave(file: unknown): SaveData {
  const f = file as Partial<SaveFile>;
  if (!f || f.format !== 'void-frontier-save' || typeof f.payload !== 'string') throw new Error('Not a Void Frontier save');
  if (checksum(f.payload) !== f.checksum) throw new Error('Save is damaged (checksum mismatch)');
  return migrate(JSON.parse(f.payload));
}
