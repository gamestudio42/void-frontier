import {
  CONTRACT_RULES,
  EVENT_RULES,
  STATION_PLACEMENTS,
  TRADER_ROUTES,
  getShip,
  getStation,
  type EconomyEventDefinition,
  type TraderRoute,
} from '@void-frontier/content';
import type { Vec2 } from '@void-frontier/kernel';
import { spawnEncounter } from './ai.ts';
import { spawnPickup } from './mining.ts';
import type { MissionBoard } from './missions.ts';
import { distance, planRoute, spawnOnLeg, startLeg, type RouteRun } from './routes.ts';
import type { EntityId, MarketItem, NewsItem } from './types.ts';
import type { World } from './world.ts';

export interface TraderState extends RouteRun {
  route: string;
  /** Outbound legs carry cargo; the return trip runs empty. */
  outbound: boolean;
  phase: 'docked' | 'travel' | 'lost';
  /** Tick the hauler leaves its station (or is replaced after a loss). */
  departTick: number;
  units: number;
  /** The hauler's ship while it flies in the simulated sector, else null. */
  shipId: EntityId | null;
  /** Escort contract riding along with this run, if any. */
  escort: number | null;
}

export interface ActiveEvent {
  id: string;
  endsTick: number;
  /** Sectors where the raid's pirates have already appeared during this event. */
  spawnedIn: string[];
}

/** The economy of every sector: shared across jumps, simulated even where the player is not. */
export interface Economy {
  markets: Record<string, MarketItem[]>;
  traders: TraderState[];
  events: ActiveEvent[];
  nextEventTick: number;
  news: NewsItem[];
}

const routeOf = (id: string): TraderRoute => TRADER_ROUTES.find((r) => r.id === id)!;
const eventOf = (id: string): EconomyEventDefinition => EVENT_RULES.events.find((e) => e.id === id)!;

export function createEconomy(): Economy {
  const markets: Record<string, MarketItem[]> = {};
  for (const [key, placement] of STATION_PLACEMENTS) markets[key] = getStation(placement.definition).market.map((item) => ({ ...item }));
  const traders = TRADER_ROUTES.map((route, i) => ({
    route: route.id,
    outbound: true,
    phase: 'docked' as const,
    departTick: 60 * (20 + i * 45),
    legs: [],
    leg: 0,
    legStartTick: 0,
    legTicks: 0,
    units: 0,
    shipId: null,
    escort: null,
  }));
  return { markets, traders, events: [], nextEventTick: 60 * EVENT_RULES.minInterval, news: [] };
}

function news(world: World, economy: Economy, item: Omit<NewsItem, 'tick'>): void {
  const full = { tick: world.tick, ...item };
  economy.news.unshift(full);
  economy.news.length = Math.min(economy.news.length, 14);
  world.events.push({ type: 'news', item: full });
}

/** Multiplier from active events on a station's production or consumption of a resource. */
function eventFactor(economy: Economy, kind: 'shortage' | 'surplus', station: string, resource: string): number {
  let factor = 1;
  for (const active of economy.events) {
    const def = eventOf(active.id);
    if (def.kind === kind && def.station === station && def.resource === resource) factor *= def.factor;
  }
  return factor;
}

export function raidFactor(economy: Economy, sector: string): number {
  let factor = 1;
  for (const active of economy.events) {
    const def = eventOf(active.id);
    if (def.kind === 'raid' && def.sector === sector) factor *= def.factor;
  }
  return factor;
}

function startEvent(world: World, economy: Economy): void {
  const candidates = EVENT_RULES.events.filter((e) => !economy.events.some((a) => a.id === e.id));
  if (candidates.length === 0) return;
  const def = candidates[Math.floor(world.rng.next() * candidates.length)];
  economy.events.push({ id: def.id, endsTick: world.tick + Math.round(def.duration * 60), spawnedIn: [] });
  const item = def.station && def.resource ? economy.markets[def.station]?.find((m) => m.resource === def.resource) : undefined;
  if (def.kind === 'shortage' && item) item.stock *= 0.6;
  if (def.kind === 'boom' && item) item.priceFactor = (item.priceFactor ?? 1) * def.factor;
  news(world, economy, { kind: 'eventStarted', subject: def.id, station: def.station, sector: def.sector, resource: def.resource });
}

function endEvent(world: World, economy: Economy, active: ActiveEvent): void {
  const def = eventOf(active.id);
  const item = def.station && def.resource ? economy.markets[def.station]?.find((m) => m.resource === def.resource) : undefined;
  if (def.kind === 'boom' && item) item.priceFactor = (item.priceFactor ?? 1) / def.factor;
  economy.events = economy.events.filter((e) => e !== active);
  news(world, economy, { kind: 'eventEnded', subject: def.id, station: def.station, sector: def.sector, resource: def.resource });
}

/** Offers to escort haulers about to leave a station, posted on that station's board. */
function postEscorts(world: World, economy: Economy, board: MissionBoard | null): void {
  if (!board) return;
  const rules = board.rules.escort;
  for (const trader of economy.traders) {
    if (trader.phase !== 'docked' || !trader.outbound || trader.escort !== null) continue;
    const route = routeOf(trader.route);
    const offers = (board.offers[route.from] ??= []);
    if (trader.departTick - world.tick > 150 * 60 || offers.some((o) => o.escort?.route === route.id)) continue;
    const legs = planRoute(route.from, route.to);
    const seconds = legs.reduce((sum, l) => sum + distance(l.from, l.to), 0) / route.speed;
    offers.push({
      id: board.nextId++,
      kind: 'escort',
      issuer: route.from,
      faction: route.allegiance,
      reward: Math.round(rules.baseReward + (legs.length - 1) * rules.rewardPerHop),
      repGain: rules.repGain,
      duration: Math.round(seconds * 2 + 300),
      deadlineTick: 0,
      elite: false,
      escort: { route: route.id, to: route.to },
    });
  }
}

/** Once a second: every station produces and consumes, events come and go. */
function tickMarkets(world: World, economy: Economy): void {
  for (const [key, items] of Object.entries(economy.markets)) {
    const def = getStation(STATION_PLACEMENTS.get(key)!.definition);
    for (const item of items) {
      const made = (def.economy.produces[item.resource] ?? 0) * eventFactor(economy, 'surplus', key, item.resource);
      const used = (def.economy.consumes[item.resource] ?? 0) * eventFactor(economy, 'shortage', key, item.resource);
      item.stock = Math.max(0, item.stock + (made - used) / 60);
      // A faint pull back toward normal keeps a station from drifting forever.
      item.stock += (item.baseStock - item.stock) * 0.0002;
    }
  }
  for (const active of [...economy.events]) if (world.tick >= active.endsTick) endEvent(world, economy, active);
  if (world.tick >= economy.nextEventTick) {
    if (economy.events.length < EVENT_RULES.maxActive) startEvent(world, economy);
    economy.nextEventTick = world.tick + Math.round(world.rng.range(EVENT_RULES.minInterval, EVENT_RULES.maxInterval) * 60);
  }
}

function depart(world: World, economy: Economy, trader: TraderState): void {
  const route = routeOf(trader.route);
  const [from, to] = trader.outbound ? [route.from, route.to] : [route.to, route.from];
  let units = 0;
  if (trader.outbound) {
    const item = economy.markets[from]?.find((m) => m.resource === route.cargo);
    units = Math.min(route.units, Math.floor(item?.stock ?? 0));
    if (units <= 0) {
      // Nothing to carry yet: wait a minute and try again.
      trader.departTick = world.tick + 3600;
      return;
    }
    item!.stock -= units;
  }
  trader.units = units;
  trader.legs = planRoute(from, to);
  trader.leg = 0;
  trader.phase = 'travel';
  startTraderLeg(world, trader);
  if (trader.outbound) news(world, economy, { kind: 'traderDeparted', subject: route.id, station: from });
}

function startTraderLeg(world: World, trader: TraderState): void {
  startLeg(world, trader, routeOf(trader.route).speed);
}

function despawn(world: World, trader: TraderState): void {
  if (trader.shipId !== null) world.destroyEntity(trader.shipId);
  trader.shipId = null;
}

function finishLeg(world: World, economy: Economy, board: MissionBoard | null, trader: TraderState, playerId: EntityId): void {
  despawn(world, trader);
  if (trader.leg + 1 < trader.legs.length) {
    trader.leg++;
    startTraderLeg(world, trader);
    return;
  }
  // Arrived.
  const route = routeOf(trader.route);
  const station = trader.outbound ? route.to : route.from;
  if (trader.outbound && trader.units > 0) {
    const item = economy.markets[station]?.find((m) => m.resource === route.cargo);
    if (item) item.stock += trader.units;
    news(world, economy, { kind: 'traderArrived', subject: route.id, station });
  }
  settleEscort(world, board, trader, playerId, true);
  trader.phase = 'docked';
  trader.outbound = !trader.outbound;
  trader.departTick = world.tick + Math.round(route.interval * 60);
  trader.units = 0;
}

function lose(world: World, economy: Economy, board: MissionBoard | null, trader: TraderState, playerId: EntityId): void {
  const route = routeOf(trader.route);
  const sector = trader.legs[trader.leg]?.sector;
  despawn(world, trader);
  settleEscort(world, board, trader, playerId, false);
  news(world, economy, { kind: 'traderLost', subject: route.id, sector, resource: trader.units > 0 ? route.cargo : undefined });
  trader.phase = 'lost';
  trader.outbound = true;
  trader.units = 0;
  trader.departTick = world.tick + Math.round(route.interval * 1.5 * 60);
}

/** Escort contracts riding with a hauler pay when it arrives with the player close by. */
function settleEscort(world: World, board: MissionBoard | null, trader: TraderState, playerId: EntityId, arrived: boolean): void {
  if (!board || trader.escort === null) return;
  const contract = board.active.find((c) => c.id === trader.escort);
  trader.escort = null;
  if (!contract) return;
  let ok = arrived;
  if (arrived) {
    const end = trader.legs[trader.legs.length - 1];
    const me = world.bodies.get(playerId);
    ok = world.sectorId === end.sector && !!me && distance(me.position, end.to) <= CONTRACT_RULES.escort.range;
  }
  closeExternal(world, board, contract.id, ok ? 'completed' : 'failed');
}

/** Hook set by missions.ts so this module does not import it (and loop the dependency graph). */
let closeExternal: (world: World, board: MissionBoard, id: number, outcome: 'completed' | 'failed') => void = () => undefined;
export function setContractCloser(fn: typeof closeExternal): void {
  closeExternal = fn;
}

/** Puts a hauler that is flying through the simulated sector into the world as a real ship. */
function materialise(world: World, trader: TraderState): void {
  const route = routeOf(trader.route);
  const id = spawnOnLeg(world, trader, getShip(route.ship), route.speed, 'trader', route.allegiance);
  if (trader.units > 0) world.ships.get(id)!.cargo.set(route.cargo, trader.units);
  trader.shipId = id;
}

/** Spawns a raid's pirates once on the busiest lane of the simulated sector. */
function raidHere(world: World, economy: Economy): void {
  for (const active of economy.events) {
    const def = eventOf(active.id);
    if (def.kind !== 'raid' || def.sector !== world.sectorId || active.spawnedIn.includes(world.sectorId)) continue;
    active.spawnedIn.push(world.sectorId);
    const lane = economy.traders.flatMap((t) => planRoute(routeOf(t.route).from, routeOf(t.route).to)).find((l) => l.sector === world.sectorId);
    const at = lane ? { x: (lane.from.x + lane.to.x) / 2, y: (lane.from.y + lane.to.y) / 2 } : { x: 0, y: 0 };
    spawnEncounter(world, {
      id: `raid_${active.id}`,
      ship: 'jackal',
      faction: 'pirate',
      count: 2,
      spawn: { x: at.x + 250, y: at.y - 250 },
      patrol: lane ? [[lane.from.x, lane.from.y], [lane.to.x, lane.to.y]] : [[at.x, at.y]],
      respawnDelay: 1e6,
    });
  }
}

/**
 * The living economy, every step: markets and events once a second; haulers depart,
 * fly (for real in the simulated sector, by the clock elsewhere), arrive or are lost.
 */
export function economySystem(world: World, economy: Economy, board: MissionBoard | null, playerId: EntityId, dt: number): void {
  if (world.tick % Math.round(1 / dt) === 0) {
    tickMarkets(world, economy);
    raidHere(world, economy);
    postEscorts(world, economy, board);
  }
  for (const trader of economy.traders) {
    if (trader.phase !== 'travel') {
      if (world.tick >= trader.departTick) depart(world, economy, trader);
      continue;
    }
    const leg = trader.legs[trader.leg];
    if (leg.sector === world.sectorId) {
      if (trader.shipId === null) materialise(world, trader);
      const ship = world.ships.get(trader.shipId!);
      const body = world.bodies.get(trader.shipId!);
      if (!ship || !body || ship.destroyed) {
        if (ship && body) dropCargo(world, trader, body.position);
        trader.shipId = null;
        lose(world, economy, board, trader, playerId);
        continue;
      }
      if (distance(body.position, leg.to) < 70) finishLeg(world, economy, board, trader, playerId);
      continue;
    }
    if (world.tick < trader.legStartTick + trader.legTicks) continue;
    // Off-screen: pirates in this sector may take an unescorted hauler.
    const risk = (EVENT_RULES.sectorRisk[leg.sector] ?? 0) * raidFactor(economy, leg.sector);
    if (trader.escort === null && world.rng.next() < risk) lose(world, economy, board, trader, playerId);
    else finishLeg(world, economy, board, trader, playerId);
  }
}

function dropCargo(world: World, trader: TraderState, at: Vec2): void {
  const route = routeOf(trader.route);
  let left = Math.floor(trader.units / 2);
  while (left > 0) {
    const chunk = Math.min(8, left);
    left -= chunk;
    spawnPickup(world, route.cargo, chunk, at, { x: world.rng.range(-6, 6), y: world.rng.range(-6, 6) });
  }
}

/** Fresh worlds hold none of the haulers' old ships: forget them so they re-materialise. */
export function detachTraders(economy: Economy): void {
  for (const trader of economy.traders) trader.shipId = null;
}

export { routeOf };
export { bayApproach, planRoute, type Leg } from './routes.ts';
