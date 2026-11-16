import { CAREER_RULES, type CareerRules } from "@void-frontier/content";
import type { EntityId } from "./types.ts";
import type { World } from "./world.ts";

/**
 * The goal ladder between the first module and the next hull: merit earned by doing
 * the work raises the pilot's rank; rank opens licences (better pay on one kind of job)
 * and stakes in stations (cheaper service, a fuller board, dividends).
 *
 * The career lives on the contract board, like standing, so it survives jumps and saves;
 * the world holds the same object.
 */
export interface Career {
  merit: number;
  /** Index into the rank table. */
  rank: number;
  licences: string[];
  /** Stake level (1-based; 0 or missing is none) by station key. */
  stakes: Record<string, number>;
  /** Tick the dividends of each station were last settled. */
  paidTick: Record<string, number>;
  /** Sale credits not yet turned into merit. */
  sales: number;
}

export const createCareer = (): Career => ({
  merit: 0,
  rank: 0,
  licences: [],
  stakes: {},
  paidTick: {},
  sales: 0,
});

const TICKS_PER_HOUR = 60 * 3600;

/** The rank a pilot holds with `merit`. */
export function rankFor(
  merit: number,
  rules: CareerRules = CAREER_RULES,
): number {
  let rank = 0;
  for (let i = 0; i < rules.ranks.length; i++)
    if (merit >= rules.ranks[i].merit) rank = i;
  return rank;
}

/** Adds merit; each rank reached pays its bonus once and is announced. */
export function earnMerit(
  world: World,
  amount: number,
  rules: CareerRules = CAREER_RULES,
): void {
  if (amount <= 0) return;
  const career = world.career;
  career.merit += amount;
  const reached = rankFor(career.merit, rules);
  while (career.rank < reached) {
    career.rank++;
    const rank = rules.ranks[career.rank];
    world.credits += rank.credits;
    world.events.push({
      type: "rank",
      rank: career.rank,
      id: rank.id,
      credits: rank.credits,
    });
  }
}

/** Sales count toward merit by the thousand credits. */
export function noteSale(
  world: World,
  credits: number,
  rules: CareerRules = CAREER_RULES,
): void {
  const career = world.career;
  career.sales += credits;
  const thousands = Math.floor(career.sales / 1000);
  if (thousands <= 0) return;
  career.sales -= thousands * 1000;
  earnMerit(world, thousands * rules.merit.salesPer1000, rules);
}

/** Share added to the pay of a contract of `kind` by the licences held. */
export function licenceBonus(
  career: Career,
  kind: string,
  rules: CareerRules = CAREER_RULES,
): number {
  let bonus = 0;
  for (const licence of rules.licences)
    if (
      career.licences.includes(licence.id) &&
      (licence.kinds as string[]).includes(kind)
    )
      bonus += licence.rewardBonus;
  return bonus;
}

/** Credits paid for each pirate the player's ships destroy. */
export function killBounty(
  career: Career,
  rules: CareerRules = CAREER_RULES,
): number {
  let credits = 0;
  for (const licence of rules.licences)
    if (career.licences.includes(licence.id)) credits += licence.killBounty;
  return credits;
}

/** A pirate destroyed by the player's side: merit, and the combat licence's bounty. */
export function notePirateKill(
  world: World,
  rules: CareerRules = CAREER_RULES,
): void {
  const bounty = killBounty(world.career, rules);
  if (bounty > 0) world.credits += bounty;
  earnMerit(world, rules.merit.kill, rules);
}

const stakeLevel = (career: Career, key: string, rules: CareerRules) => {
  const level = career.stakes[key] ?? 0;
  return level > 0 ? rules.investment.levels[level - 1] : null;
};

/** Contracts the pilot may hold at once, on top of the board's own limit. */
export const activeBonus = (
  career: Career,
  rules: CareerRules = CAREER_RULES,
): number => rules.ranks[career.rank].activeBonus;

/** Extra offers on the board of station `key`: the rank's and the stake's. */
export const offerBonus = (
  career: Career,
  key: string,
  rules: CareerRules = CAREER_RULES,
): number =>
  rules.ranks[career.rank].offerBonus +
  (stakeLevel(career, key, rules)?.offerSlots ?? 0);

/** Share off repairs and fuel at station `key`. */
export const serviceDiscount = (
  career: Career,
  key: string,
  rules: CareerRules = CAREER_RULES,
): number => stakeLevel(career, key, rules)?.serviceDiscount ?? 0;

/** Whether elite jobs turn up at station `key` whatever the standing. */
export const eliteOffersAt = (
  career: Career,
  key: string,
  rules: CareerRules = CAREER_RULES,
): boolean => stakeLevel(career, key, rules)?.eliteOffers ?? false;

const dockedKey = (world: World, shipId: EntityId): string | null => {
  const ship = world.ships.get(shipId);
  if (!ship || ship.docked === null) return null;
  return world.stations.get(ship.docked)?.name ?? null;
};

export type LicenceResult =
  | { ok: true }
  | {
      ok: false;
      reason: "notDocked" | "unknown" | "owned" | "rank" | "noCredits";
    };

/** Buys a licence at any station the ship is docked at. */
export function buyLicence(
  world: World,
  shipId: EntityId,
  licenceId: string,
  rules: CareerRules = CAREER_RULES,
): LicenceResult {
  if (dockedKey(world, shipId) === null)
    return { ok: false, reason: "notDocked" };
  const licence = rules.licences.find((l) => l.id === licenceId);
  if (!licence) return { ok: false, reason: "unknown" };
  const career = world.career;
  if (career.licences.includes(licence.id))
    return { ok: false, reason: "owned" };
  if (career.rank < licence.rank) return { ok: false, reason: "rank" };
  if (world.credits < licence.price) return { ok: false, reason: "noCredits" };
  world.credits -= licence.price;
  career.licences.push(licence.id);
  return { ok: true };
}

export type InvestResult =
  | { ok: true; level: number }
  | { ok: false; reason: "notDocked" | "maxed" | "rank" | "noCredits" };

/** Buys the next stake level in the station the ship is docked at. */
export function invest(
  world: World,
  shipId: EntityId,
  rules: CareerRules = CAREER_RULES,
): InvestResult {
  const key = dockedKey(world, shipId);
  if (key === null) return { ok: false, reason: "notDocked" };
  const career = world.career;
  const level = career.stakes[key] ?? 0;
  const next = rules.investment.levels[level];
  if (!next) return { ok: false, reason: "maxed" };
  if (career.rank < next.rank) return { ok: false, reason: "rank" };
  if (world.credits < next.cost) return { ok: false, reason: "noCredits" };
  // What the old level earned so far is paid before the new rate starts.
  collectDividend(world, key, rules);
  world.credits -= next.cost;
  career.stakes[key] = level + 1;
  career.paidTick[key] = world.tick;
  return { ok: true, level: level + 1 };
}

/** Dividends owed by station `key` now, capped at the hours a stake keeps accruing. */
export function dividendDue(
  world: World,
  key: string,
  rules: CareerRules = CAREER_RULES,
): number {
  const level = stakeLevel(world.career, key, rules);
  if (!level) return 0;
  const hours = Math.min(
    rules.investment.maxDividendHours,
    Math.max(0, world.tick - (world.career.paidTick[key] ?? world.tick)) /
      TICKS_PER_HOUR,
  );
  return Math.floor(hours * level.dividendPerHour);
}

/** Pays what station `key` owes; called on docking there. */
export function collectDividend(
  world: World,
  key: string,
  rules: CareerRules = CAREER_RULES,
): number {
  if (!stakeLevel(world.career, key, rules)) return 0;
  const credits = dividendDue(world, key, rules);
  world.career.paidTick[key] = world.tick;
  if (credits > 0) {
    world.credits += credits;
    world.events.push({ type: "dividend", station: key, credits });
  }
  return credits;
}
