import { CONTRACT_RULES, FACTIONS, SECTORS, getFaction, getResource, getStation, type ContractRules } from '@void-frontier/content';
import { holdSpaceFor } from './ship.ts';
import type { EntityId } from './types.ts';
import type { World } from './world.ts';

export type ContractKind = 'delivery' | 'mining' | 'bounty';

export interface DropPoint {
  id: string;
  sector: string;
  position: { x: number; y: number };
  risk: number;
}

/** A friendly station that issues contracts and accepts station deliveries. */
export interface ContractStation {
  key: string;
  /** Faction that owns the station and pays its contracts. */
  faction: string;
  sector: string;
  position: { x: number; y: number };
}

export interface Contract {
  id: number;
  kind: ContractKind;
  /** Station that issued the contract, and its faction (whose reputation it moves). */
  issuer: string;
  faction: string;
  reward: number;
  repGain: number;
  /** Seconds allowed once accepted. */
  duration: number;
  /** Tick the contract expires, set on acceptance (ticks run on across sectors). */
  deadlineTick: number;
  elite: boolean;
  /** Deliver to a relay beacon (`drop`) or by docking at another station (`station`). */
  delivery?: { units: number; sector: string; drop?: string; station?: string };
  mining?: { resource: string; units: number };
  bounty?: { count: number; killsAtStart: number };
}

export type ContractOutcome = 'completed' | 'failed' | 'abandoned';

export interface MissionBoard {
  rules: ContractRules;
  drops: DropPoint[];
  stations: ContractStation[];
  /** Offers on each station's board, by station key. */
  offers: Record<string, Contract[]>;
  active: Contract[];
  history: { id: number; kind: ContractKind; outcome: ContractOutcome; reward: number }[];
  /** Player reputation by faction id, -100..100. */
  reputation: Record<string, number>;
  nextId: number;
  /** Tick of the next automatic board refresh. */
  refreshTick: number;
}

/** A board covering every sector: drops from all of them, and every friendly station. */
export function createBoard(rules: ContractRules = CONTRACT_RULES): MissionBoard {
  const drops: DropPoint[] = [];
  const stations: ContractStation[] = [];
  for (const sector of SECTORS.values()) {
    for (const d of sector.dropPoints) {
      const beacon = sector.beacons.find((b) => b.id === d.beacon)!;
      drops.push({ id: d.id, sector: sector.id, position: { x: beacon.x, y: beacon.y }, risk: d.risk });
    }
    for (const s of sector.stations) {
      const faction = getStation(s.definition).faction;
      if (!getFaction(faction).hostile) stations.push({ key: s.id, faction, sector: sector.id, position: { x: s.x, y: s.y } });
    }
  }
  const reputation = Object.fromEntries([...FACTIONS.values()].map((f) => [f.id, f.hostile ? rules.reputation.min : 0]));
  return { rules, drops, stations, offers: {}, active: [], history: [], reputation, nextId: 1, refreshTick: 0 };
}

/** Jumps between two sectors along the gate network (breadth-first). */
export function sectorHops(from: string, to: string): number {
  if (from === to) return 0;
  const seen = new Set([from]);
  let frontier = [from];
  for (let hops = 1; frontier.length > 0; hops++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const gate of SECTORS.get(id)?.gates ?? []) {
        if (gate.to === to) return hops;
        if (!seen.has(gate.to)) {
          seen.add(gate.to);
          next.push(gate.to);
        }
      }
    }
    frontier = next;
  }
  return 99;
}

/** Travel estimate in metres: straight line in-sector, about 3.5 km per jump otherwise. */
function travel(from: ContractStation, sector: string, position: { x: number; y: number }): number {
  const hops = sectorHops(from.sector, sector);
  if (hops === 0) {
    const dx = position.x - from.position.x;
    const dy = position.y - from.position.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  return hops * 3500;
}

const standing = (board: MissionBoard, faction: string): number => board.reputation[faction] ?? 0;

function rewardScale(board: MissionBoard, faction: string): number {
  return 1 + standing(board, faction) * board.rules.reputation.rewardPerPoint;
}

function pickWeighted(world: World, weights: Record<string, number>): string {
  const keys = Object.keys(weights).sort();
  const total = keys.reduce((sum, k) => sum + weights[k], 0);
  let roll = world.rng.next() * total;
  for (const key of keys) {
    roll -= weights[key];
    if (roll < 0) return key;
  }
  return keys[keys.length - 1];
}

const int = (world: World, min: number, max: number) => min + Math.floor(world.rng.next() * (max - min + 1));

/** A new offer for a station's board; elite contracts appear once reputation is high enough. */
export function generateOffer(world: World, board: MissionBoard, issuer: ContractStation): Contract {
  const rules = board.rules;
  const elite = standing(board, issuer.faction) >= rules.reputation.eliteThreshold && world.rng.next() < 0.5;
  const unitsScale = elite ? rules.elite.unitsMultiplier : 1;
  const rewardMultiplier = elite ? rules.elite.rewardMultiplier : 1;
  const roll = world.rng.next();
  const base = { id: board.nextId++, issuer: issuer.key, faction: issuer.faction, elite, deadlineTick: 0 };

  if (roll < 0.45) {
    const r = rules.delivery;
    const units = Math.round(int(world, r.minUnits, r.maxUnits) * unitsScale);
    const otherStations = board.stations.filter((s) => s.key !== issuer.key);
    // Half the deliveries go to another station once there is one: those are the trade runs.
    const toStation = otherStations.length > 0 && world.rng.next() < 0.5;
    let target: { sector: string; position: { x: number; y: number }; risk: number; drop?: string; station?: string };
    if (toStation) {
      const s = otherStations[Math.floor(world.rng.next() * otherStations.length)];
      target = { sector: s.sector, position: s.position, risk: 1.2, station: s.key };
    } else {
      const d = board.drops[Math.floor(world.rng.next() * board.drops.length)];
      target = { sector: d.sector, position: d.position, risk: d.risk, drop: d.id };
    }
    const distance = travel(issuer, target.sector, target.position);
    const reward = Math.round((r.baseReward + distance * r.rewardPerMetre + units * r.rewardPerUnit) * target.risk * rewardMultiplier);
    const duration = Math.max(r.minSeconds, Math.round((distance / 1000) * r.secondsPerKm * 2));
    const delivery = { units, sector: target.sector, ...(target.drop ? { drop: target.drop } : { station: target.station }) };
    return { ...base, kind: 'delivery', reward, repGain: r.repGain, duration, delivery };
  }
  if (roll < 0.75) {
    const r = rules.mining;
    const resource = pickWeighted(world, r.resources);
    const units = Math.round(int(world, r.minUnits, r.maxUnits) * unitsScale);
    const reward = Math.round(units * getResource(resource).basePrice * r.priceMultiplier * rewardMultiplier);
    return { ...base, kind: 'mining', reward, repGain: r.repGain, duration: r.seconds, mining: { resource, units } };
  }
  const r = rules.bounty;
  const count = Math.round(int(world, r.minCount, r.maxCount) * (elite ? 1.34 : 1));
  const reward = Math.round(count * r.rewardPerKill * rewardMultiplier);
  return { ...base, kind: 'bounty', reward, repGain: r.repGain, duration: r.seconds, bounty: { count, killsAtStart: 0 } };
}

/** Fills the boards of the friendly stations in the current sector. */
export function fillOffers(world: World, board: MissionBoard): void {
  for (const station of board.stations) {
    if (station.sector !== world.sectorId) continue;
    const offers = (board.offers[station.key] ??= []);
    while (offers.length < board.rules.offerSlots) offers.push(generateOffer(world, board, station));
  }
}

/** Reward actually paid for a contract at the current reputation. */
export const payout = (board: MissionBoard, contract: Contract): number => Math.round(contract.reward * rewardScale(board, contract.faction));

/** Changes reputation in place: the world's `standing` is the same object. */
function adjustReputation(board: MissionBoard, faction: string, delta: number): void {
  board.reputation[faction] = Math.max(board.rules.reputation.min, Math.min(board.rules.reputation.max, standing(board, faction) + delta));
}

function close(world: World, board: MissionBoard, contract: Contract, outcome: ContractOutcome): void {
  board.active = board.active.filter((c) => c.id !== contract.id);
  let reward = 0;
  if (outcome === 'completed') {
    reward = payout(board, contract);
    world.credits += reward;
    adjustReputation(board, contract.faction, contract.repGain);
  } else {
    adjustReputation(board, contract.faction, -(outcome === 'failed' ? board.rules.penalty.failed : board.rules.penalty.abandoned));
  }
  board.history.unshift({ id: contract.id, kind: contract.kind, outcome, reward });
  board.history.length = Math.min(board.history.length, 12);
  world.events.push({ type: 'contract', id: contract.id, kind: contract.kind, outcome, reward });
}

/** Key of the station a ship is docked at, or null. */
export function dockedStationKey(world: World, shipId: EntityId): string | null {
  const ship = world.ships.get(shipId);
  if (!ship || ship.docked === null) return null;
  return world.stations.get(ship.docked)?.name ?? null;
}

export type AcceptResult = { ok: true } | { ok: false; reason: 'notDocked' | 'unknown' | 'tooMany' | 'noSpace' };

/** Takes an offer from the board of the station the ship is docked at. */
export function acceptContract(world: World, board: MissionBoard, shipId: EntityId, offerId: number): AcceptResult {
  const ship = world.ships.get(shipId);
  const key = dockedStationKey(world, shipId);
  if (!ship || key === null) return { ok: false, reason: 'notDocked' };
  const offers = board.offers[key] ?? [];
  const offer = offers.find((o) => o.id === offerId);
  if (!offer) return { ok: false, reason: 'unknown' };
  if (board.active.length >= board.rules.maxActive) return { ok: false, reason: 'tooMany' };
  if (offer.delivery) {
    const cargo = board.rules.delivery.cargo;
    if (holdSpaceFor(ship, cargo) < offer.delivery.units) return { ok: false, reason: 'noSpace' };
    ship.cargo.set(cargo, (ship.cargo.get(cargo) ?? 0) + offer.delivery.units);
  }
  if (offer.bounty) offer.bounty.killsAtStart = ship.kills;
  offer.deadlineTick = world.tick + Math.round(offer.duration * 60);
  board.offers[key] = offers.filter((o) => o.id !== offerId);
  board.active.push(offer);
  fillOffers(world, board);
  return { ok: true };
}

/** Progress toward a contract's goal, with current and target counts. */
export function contractProgress(world: World, board: MissionBoard, shipId: EntityId, contract: Contract): { current: number; target: number } {
  const ship = world.ships.get(shipId);
  if (contract.mining) return { current: Math.min(contract.mining.units, ship?.cargo.get(contract.mining.resource) ?? 0), target: contract.mining.units };
  if (contract.bounty) return { current: Math.min(contract.bounty.count, (ship?.kills ?? 0) - contract.bounty.killsAtStart), target: contract.bounty.count };
  const cargo = board.rules.delivery.cargo;
  return { current: Math.min(contract.delivery!.units, ship?.cargo.get(cargo) ?? 0), target: contract.delivery!.units };
}

export type HandInResult = { ok: true; reward: number } | { ok: false; reason: 'notDocked' | 'unknown' | 'incomplete' | 'deliverInPerson' };

/** Turns in a mining or bounty contract at any friendly station. */
export function handInContract(world: World, board: MissionBoard, shipId: EntityId, contractId: number): HandInResult {
  const ship = world.ships.get(shipId);
  if (!ship || dockedStationKey(world, shipId) === null) return { ok: false, reason: 'notDocked' };
  const contract = board.active.find((c) => c.id === contractId);
  if (!contract) return { ok: false, reason: 'unknown' };
  if (contract.delivery) return { ok: false, reason: 'deliverInPerson' };
  const progress = contractProgress(world, board, shipId, contract);
  if (progress.current < progress.target) return { ok: false, reason: 'incomplete' };
  if (contract.mining) {
    const left = (ship.cargo.get(contract.mining.resource) ?? 0) - contract.mining.units;
    if (left > 0) ship.cargo.set(contract.mining.resource, left);
    else ship.cargo.delete(contract.mining.resource);
  }
  close(world, board, contract, 'completed');
  return { ok: true, reward: board.history[0].reward };
}

/** Gives up a contract; delivery cargo stays in the hold but is now worthless. */
export function abandonContract(world: World, board: MissionBoard, contractId: number): boolean {
  const contract = board.active.find((c) => c.id === contractId);
  if (!contract) return false;
  close(world, board, contract, 'abandoned');
  return true;
}

function takeCrates(world: World, board: MissionBoard, shipId: EntityId, units: number): boolean {
  const ship = world.ships.get(shipId)!;
  const cargo = board.rules.delivery.cargo;
  const held = ship.cargo.get(cargo) ?? 0;
  if (held < units) return false;
  if (held - units > 0) ship.cargo.set(cargo, held - units);
  else ship.cargo.delete(cargo);
  return true;
}

/** Deliveries complete at their drop or station; every contract fails at its deadline; boards refresh. */
export function missionSystem(world: World, board: MissionBoard, shipId: EntityId, dt: number): void {
  const ship = world.ships.get(shipId);
  const body = world.bodies.get(shipId);
  const dockedAt = dockedStationKey(world, shipId);
  for (const contract of [...board.active]) {
    if (world.tick >= contract.deadlineTick) {
      close(world, board, contract, 'failed');
      continue;
    }
    const d = contract.delivery;
    if (!d || !ship || !body || ship.destroyed || d.sector !== world.sectorId) continue;
    if (d.station) {
      if (dockedAt === d.station && takeCrates(world, board, shipId, d.units)) close(world, board, contract, 'completed');
      continue;
    }
    const drop = board.drops.find((p) => p.id === d.drop)!;
    const dx = drop.position.x - body.position.x;
    const dy = drop.position.y - body.position.y;
    const speed = Math.sqrt(body.velocity.x * body.velocity.x + body.velocity.y * body.velocity.y);
    const rules = board.rules.delivery;
    if (dx * dx + dy * dy > rules.dropRadius * rules.dropRadius || speed > rules.maxDropSpeed) continue;
    if (takeCrates(world, board, shipId, d.units)) close(world, board, contract, 'completed');
  }
  if (world.tick >= board.refreshTick) {
    // Replace the oldest offer on each local board so they keep changing while you fly.
    if (board.refreshTick > 0) {
      for (const station of board.stations) if (station.sector === world.sectorId) board.offers[station.key]?.shift();
    }
    fillOffers(world, board);
    board.refreshTick = world.tick + Math.round(board.rules.refreshSeconds / dt);
  }
}

/**
 * The board after the player's ship is lost: deliveries fail (the crates went down with
 * the ship), other contracts keep their time and progress. Ticks keep running, so only
 * the kill counter needs rebasing for the new ship.
 */
export function carryBoard(board: MissionBoard, oldKills: number): MissionBoard {
  const next: MissionBoard = structuredClone(board);
  next.active = [];
  for (const contract of board.active) {
    if (contract.delivery) {
      adjustReputation(next, contract.faction, -next.rules.penalty.failed);
      next.history.unshift({ id: contract.id, kind: contract.kind, outcome: 'failed', reward: 0 });
      continue;
    }
    const kept = structuredClone(contract);
    if (kept.bounty) kept.bounty.killsAtStart = -(oldKills - contract.bounty!.killsAtStart);
    next.active.push(kept);
  }
  next.history.length = Math.min(next.history.length, 12);
  return next;
}
