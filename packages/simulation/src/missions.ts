import { CONTRACT_RULES, getResource, type ContractRules, type SectorDefinition } from '@void-frontier/content';
import { holdSpaceFor } from './ship.ts';
import type { EntityId } from './types.ts';
import type { World } from './world.ts';

export type ContractKind = 'delivery' | 'mining' | 'bounty';

export interface DropPoint {
  id: string;
  position: { x: number; y: number };
  risk: number;
}

export interface Contract {
  id: number;
  kind: ContractKind;
  reward: number;
  repGain: number;
  /** Seconds allowed once accepted. */
  duration: number;
  /** Tick the contract expires, set on acceptance. */
  deadlineTick: number;
  elite: boolean;
  delivery?: { drop: string; units: number };
  mining?: { resource: string; units: number };
  bounty?: { count: number; killsAtStart: number };
}

export type ContractOutcome = 'completed' | 'failed' | 'abandoned';

export interface MissionBoard {
  rules: ContractRules;
  drops: DropPoint[];
  offers: Contract[];
  active: Contract[];
  history: { id: number; kind: ContractKind; outcome: ContractOutcome; reward: number }[];
  reputation: number;
  nextId: number;
  /** Tick of the next automatic board refresh. */
  refreshTick: number;
}

export function createBoard(sector: SectorDefinition, world: World, rules: ContractRules = CONTRACT_RULES): MissionBoard {
  const drops = sector.dropPoints.map((d) => {
    const beacon = sector.beacons.find((b) => b.id === d.beacon)!;
    return { id: d.id, position: { x: beacon.x, y: beacon.y }, risk: d.risk };
  });
  const board: MissionBoard = { rules, drops, offers: [], active: [], history: [], reputation: 0, nextId: 1, refreshTick: 0 };
  fillOffers(world, board);
  return board;
}

function rewardScale(board: MissionBoard): number {
  return 1 + board.reputation * board.rules.reputation.rewardPerPoint;
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

/** A new offer from the board's rules; elite contracts appear once reputation is high enough. */
export function generateOffer(world: World, board: MissionBoard, origin: { x: number; y: number }): Contract {
  const rules = board.rules;
  const elite = board.reputation >= rules.reputation.eliteThreshold && world.rng.next() < 0.5;
  const unitsScale = elite ? rules.elite.unitsMultiplier : 1;
  const rewardMultiplier = elite ? rules.elite.rewardMultiplier : 1;
  const roll = world.rng.next();
  const id = board.nextId++;
  const base = { id, elite, deadlineTick: 0 };

  if (roll < 0.4 && board.drops.length > 0) {
    const r = rules.delivery;
    const drop = board.drops[Math.floor(world.rng.next() * board.drops.length)];
    const units = Math.round(int(world, r.minUnits, r.maxUnits) * unitsScale);
    const dx = drop.position.x - origin.x;
    const dy = drop.position.y - origin.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const reward = Math.round((r.baseReward + distance * r.rewardPerMetre + units * r.rewardPerUnit) * drop.risk * rewardMultiplier);
    const duration = Math.max(r.minSeconds, Math.round((distance / 1000) * r.secondsPerKm * 2));
    return { ...base, kind: 'delivery', reward, repGain: r.repGain, duration, delivery: { drop: drop.id, units } };
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

function stationOrigin(world: World): { x: number; y: number } {
  const first = [...world.stations.keys()][0];
  return first !== undefined ? world.bodies.get(first)!.position : { x: 0, y: 0 };
}

function fillOffers(world: World, board: MissionBoard): void {
  while (board.offers.length < board.rules.offerSlots) board.offers.push(generateOffer(world, board, stationOrigin(world)));
}

/** Reward actually paid for a contract at the current reputation. */
export const payout = (board: MissionBoard, contract: Contract): number => Math.round(contract.reward * rewardScale(board));

function adjustReputation(board: MissionBoard, delta: number): void {
  board.reputation = Math.max(board.rules.reputation.min, Math.min(board.rules.reputation.max, board.reputation + delta));
}

function close(world: World, board: MissionBoard, contract: Contract, outcome: ContractOutcome): void {
  board.active = board.active.filter((c) => c.id !== contract.id);
  let reward = 0;
  if (outcome === 'completed') {
    reward = payout(board, contract);
    world.credits += reward;
    adjustReputation(board, contract.repGain);
  } else {
    adjustReputation(board, -(outcome === 'failed' ? board.rules.penalty.failed : board.rules.penalty.abandoned));
  }
  board.history.unshift({ id: contract.id, kind: contract.kind, outcome, reward });
  board.history.length = Math.min(board.history.length, 12);
  world.events.push({ type: 'contract', id: contract.id, kind: contract.kind, outcome, reward });
}

export type AcceptResult = { ok: true } | { ok: false; reason: 'notDocked' | 'unknown' | 'tooMany' | 'noSpace' };

/** Takes an offer from the board. Delivery cargo is loaded into the hold on acceptance. */
export function acceptContract(world: World, board: MissionBoard, shipId: EntityId, offerId: number): AcceptResult {
  const ship = world.ships.get(shipId);
  if (!ship || ship.docked === null) return { ok: false, reason: 'notDocked' };
  const offer = board.offers.find((o) => o.id === offerId);
  if (!offer) return { ok: false, reason: 'unknown' };
  if (board.active.length >= board.rules.maxActive) return { ok: false, reason: 'tooMany' };
  if (offer.delivery) {
    const cargo = board.rules.delivery.cargo;
    if (holdSpaceFor(ship, cargo) < offer.delivery.units) return { ok: false, reason: 'noSpace' };
    ship.cargo.set(cargo, (ship.cargo.get(cargo) ?? 0) + offer.delivery.units);
  }
  if (offer.bounty) offer.bounty.killsAtStart = ship.kills;
  offer.deadlineTick = world.tick + Math.round(offer.duration * 60);
  board.offers = board.offers.filter((o) => o.id !== offerId);
  board.active.push(offer);
  fillOffers(world, board);
  return { ok: true };
}

/** Progress toward a contract's goal, 0..1, with current and target counts. */
export function contractProgress(world: World, board: MissionBoard, shipId: EntityId, contract: Contract): { current: number; target: number } {
  const ship = world.ships.get(shipId);
  if (contract.mining) return { current: Math.min(contract.mining.units, ship?.cargo.get(contract.mining.resource) ?? 0), target: contract.mining.units };
  if (contract.bounty) return { current: Math.min(contract.bounty.count, (ship?.kills ?? 0) - contract.bounty.killsAtStart), target: contract.bounty.count };
  const cargo = board.rules.delivery.cargo;
  return { current: Math.min(contract.delivery!.units, ship?.cargo.get(cargo) ?? 0), target: contract.delivery!.units };
}

export type HandInResult = { ok: true; reward: number } | { ok: false; reason: 'notDocked' | 'unknown' | 'incomplete' | 'deliverInPerson' };

/** Turns in a mining or bounty contract at the station. */
export function handInContract(world: World, board: MissionBoard, shipId: EntityId, contractId: number): HandInResult {
  const ship = world.ships.get(shipId);
  if (!ship || ship.docked === null) return { ok: false, reason: 'notDocked' };
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

/** Deliveries complete at their drop point; every contract fails at its deadline; the board refreshes. */
export function missionSystem(world: World, board: MissionBoard, shipId: EntityId, dt: number): void {
  const ship = world.ships.get(shipId);
  const body = world.bodies.get(shipId);
  for (const contract of [...board.active]) {
    if (world.tick >= contract.deadlineTick) {
      close(world, board, contract, 'failed');
      continue;
    }
    if (!contract.delivery || !ship || !body || ship.destroyed) continue;
    const drop = board.drops.find((d) => d.id === contract.delivery!.drop)!;
    const dx = drop.position.x - body.position.x;
    const dy = drop.position.y - body.position.y;
    const speed = Math.sqrt(body.velocity.x * body.velocity.x + body.velocity.y * body.velocity.y);
    const rules = board.rules.delivery;
    if (dx * dx + dy * dy > rules.dropRadius * rules.dropRadius || speed > rules.maxDropSpeed) continue;
    const held = ship.cargo.get(rules.cargo) ?? 0;
    if (held < contract.delivery.units) continue;
    if (held - contract.delivery.units > 0) ship.cargo.set(rules.cargo, held - contract.delivery.units);
    else ship.cargo.delete(rules.cargo);
    close(world, board, contract, 'completed');
  }
  if (world.tick >= board.refreshTick) {
    // Replace the oldest offer so the board keeps changing while you fly.
    if (board.refreshTick > 0 && board.offers.length > 0) board.offers.shift();
    fillOffers(world, board);
    board.refreshTick = world.tick + Math.round(board.rules.refreshSeconds / dt);
  }
}

/**
 * The board after the player's ship is lost and a new world starts at tick 0:
 * deliveries fail (the crates went down with the ship), other contracts keep their
 * remaining time and progress, and reputation and history carry over.
 */
export function carryBoard(board: MissionBoard, oldTick: number, oldKills: number): MissionBoard {
  const next: MissionBoard = structuredClone(board);
  next.active = [];
  for (const contract of board.active) {
    if (contract.delivery) {
      next.reputation = Math.max(next.rules.reputation.min, next.reputation - next.rules.penalty.failed);
      next.history.unshift({ id: contract.id, kind: contract.kind, outcome: 'failed', reward: 0 });
      continue;
    }
    const kept = structuredClone(contract);
    kept.deadlineTick = contract.deadlineTick - oldTick;
    if (kept.bounty) kept.bounty.killsAtStart = -(oldKills - contract.bounty!.killsAtStart);
    next.active.push(kept);
  }
  next.history.length = Math.min(next.history.length, 12);
  next.refreshTick = Math.max(0, board.refreshTick - oldTick);
  return next;
}
