import { describe, expect, it } from "vitest";
import { CAREER_RULES, OUTPOST_ALPHA } from "@void-frontier/content";
import {
  Simulation,
  activeLimit,
  buyLicence,
  destroyShip,
  dockShip,
  dividendDue,
  earnMerit,
  invest,
  payout,
  rankFor,
  restore,
  serialize,
  serviceCost,
  type Contract,
  type SimEvent,
} from "../src/index.ts";

const HOME = "outpost_alpha_station";
const rules = CAREER_RULES;
const HOUR = 60 * 3600;

function docked(credits = 100_000) {
  const sim = Simulation.fromSector(OUTPOST_ALPHA);
  sim.world.credits = credits;
  return sim;
}

const bounty = (id: number): Contract => ({
  id,
  kind: "bounty",
  issuer: HOME,
  faction: "outpost_authority",
  reward: 1000,
  repGain: 1,
  duration: 1000,
  deadlineTick: 1e9,
  elite: false,
  bounty: { count: 0, killsAtStart: 0 },
});

describe("pilot rank", () => {
  it("is reached by merit and pays its bonus once, with an event", () => {
    const sim = docked(0);
    expect(rankFor(0)).toBe(0);
    earnMerit(sim.world, rules.ranks[1].merit - 1);
    expect(sim.world.career.rank).toBe(0);
    earnMerit(sim.world, 1);
    expect(sim.world.career.rank).toBe(1);
    expect(sim.world.credits).toBe(rules.ranks[1].credits);
    const events = sim.drainEvents().filter((e) => e.type === "rank");
    expect(events).toEqual([
      {
        type: "rank",
        rank: 1,
        id: rules.ranks[1].id,
        credits: rules.ranks[1].credits,
      },
    ]);
    // A big jump climbs every rank in between and pays each.
    earnMerit(sim.world, rules.ranks[3].merit);
    expect(sim.world.career.rank).toBe(3);
    expect(sim.world.credits).toBe(
      rules.ranks[1].credits + rules.ranks[2].credits + rules.ranks[3].credits,
    );
  });

  it("is earned by completing contracts, discoveries and selling", () => {
    const sim = docked();
    const board = sim.missions!;
    board.active.push(bounty(900));
    expect(sim.handInContract(900)).toMatchObject({ ok: true });
    expect(sim.world.career.merit).toBe(rules.merit.contract);
    board.active.push({ ...bounty(901), elite: true });
    sim.handInContract(901);
    expect(sim.world.career.merit).toBe(
      rules.merit.contract + rules.merit.eliteContract,
    );

    const ship = sim.world.ships.get(sim.playerId)!;
    ship.cargo.set("iron_ore", 300);
    const before = sim.world.career.merit;
    const sale = sim.trade(sim.playerId, "iron_ore", 300, "sell");
    if (!sale.ok) throw new Error("the outpost should buy iron ore");
    expect(sim.world.career.merit - before).toBe(
      Math.floor(sale.credits / 1000) * rules.merit.salesPer1000,
    );
    expect(sim.world.career.sales).toBe(sale.credits % 1000);
  });

  it("a higher rank holds more contracts and fills the boards fuller", () => {
    const sim = docked();
    const board = sim.missions!;
    const slots = board.offers[HOME].filter((o) => !o.escort).length;
    expect(activeLimit(board)).toBe(board.rules.maxActive);
    earnMerit(sim.world, rules.ranks.at(-1)!.merit);
    expect(activeLimit(board)).toBe(
      board.rules.maxActive + rules.ranks.at(-1)!.activeBonus,
    );
    sim.step();
    board.refreshTick = 0;
    sim.step();
    expect(board.offers[HOME].filter((o) => !o.escort).length).toBe(
      slots + rules.ranks.at(-1)!.offerBonus,
    );
  });
});

describe("licences", () => {
  it("need the rank and the money, and are bought once", () => {
    const sim = docked(1000);
    const id = sim.playerId;
    const combat = rules.licences.find((l) => l.id === "combat")!;
    expect(buyLicence(sim.world, id, "combat")).toEqual({
      ok: false,
      reason: "rank",
    });
    earnMerit(sim.world, rules.ranks[combat.rank].merit);
    sim.world.credits = 10;
    expect(buyLicence(sim.world, id, "combat")).toEqual({
      ok: false,
      reason: "noCredits",
    });
    sim.world.credits = combat.price;
    expect(buyLicence(sim.world, id, "combat")).toEqual({ ok: true });
    expect(sim.world.credits).toBe(0);
    expect(buyLicence(sim.world, id, "combat")).toEqual({
      ok: false,
      reason: "owned",
    });
    sim.undock(id);
    expect(buyLicence(sim.world, id, "mining")).toEqual({
      ok: false,
      reason: "notDocked",
    });
  });

  it("pay more on their kinds of job only", () => {
    const sim = docked();
    const board = sim.missions!;
    const job = bounty(1);
    const delivery: Contract = {
      ...bounty(2),
      kind: "delivery",
      bounty: undefined,
    };
    const plain = payout(board, job);
    const plainDelivery = payout(board, delivery);
    earnMerit(sim.world, rules.ranks[2].merit);
    expect(buyLicence(sim.world, sim.playerId, "combat")).toEqual({ ok: true });
    const bonus = rules.licences.find((l) => l.id === "combat")!.rewardBonus;
    expect(payout(board, job)).toBe(Math.round(plain * (1 + bonus)));
    expect(payout(board, delivery)).toBe(plainDelivery);
  });

  it("the combat licence pays a bounty for each pirate destroyed", () => {
    const sim = docked();
    earnMerit(sim.world, rules.ranks[2].merit);
    buyLicence(sim.world, sim.playerId, "combat");
    sim.undock(sim.playerId);
    const pirate = [...sim.world.ships.entries()].find(
      ([, s]) => s.faction === "pirate",
    );
    if (!pirate) throw new Error("no pirate in the sector");
    const credits = sim.world.credits;
    const merit = sim.world.career.merit;
    sim.world.ships.get(pirate[0])!.hull = 1;
    sim.world.ships.get(pirate[0])!.shield = 0;
    destroyShip(sim.world, pirate[0], sim.playerId);
    expect(sim.world.credits).toBe(
      credits + rules.licences.find((l) => l.id === "combat")!.killBounty,
    );
    expect(sim.world.career.merit).toBe(merit + rules.merit.kill);
  });
});

describe("station stakes", () => {
  it("climb level by level, gated by rank, and cut the service bill", () => {
    const sim = docked();
    const id = sim.playerId;
    const ship = sim.world.ships.get(id)!;
    ship.hull -= 300;
    ship.fuel = 0;
    const repair = serviceCost(sim.world, id, "repair");
    const fuel = serviceCost(sim.world, id, "refuel");
    expect(invest(sim.world, id)).toEqual({ ok: false, reason: "rank" });
    earnMerit(sim.world, rules.ranks[rules.investment.levels[0].rank].merit);
    expect(invest(sim.world, id)).toEqual({ ok: true, level: 1 });
    const off = 1 - rules.investment.levels[0].serviceDiscount;
    expect(serviceCost(sim.world, id, "repair")).toBeCloseTo(repair * off, -1);
    expect(serviceCost(sim.world, id, "refuel")).toBeCloseTo(fuel * off, -1);
    expect(invest(sim.world, id)).toEqual({ ok: false, reason: "rank" });
    earnMerit(sim.world, rules.ranks.at(-1)!.merit);
    for (let i = 2; i <= rules.investment.levels.length; i++)
      expect(invest(sim.world, id)).toEqual({ ok: true, level: i });
    expect(invest(sim.world, id)).toEqual({ ok: false, reason: "maxed" });
  });

  it("a stake adds offers to that board and opens elite work there", () => {
    const sim = docked();
    const board = sim.missions!;
    earnMerit(sim.world, rules.ranks[2].merit);
    const jobs = () => board.offers[HOME].filter((o) => !o.escort).length;
    const before = jobs();
    expect(sim.invest()).toEqual({ ok: true, level: 1 });
    expect(jobs()).toBe(before + rules.investment.levels[0].offerSlots);
    expect(sim.invest()).toEqual({ ok: true, level: 2 });
    let elite = false;
    for (let i = 0; i < 40 && !elite; i++) {
      board.offers[HOME].shift();
      board.refreshTick = 0;
      sim.step();
      elite = board.offers[HOME].some((o) => o.elite);
    }
    expect(jobs()).toBe(before + rules.investment.levels[1].offerSlots);
    expect(sim.missions!.reputation.outpost_authority).toBeLessThan(
      board.rules.reputation.eliteThreshold,
    );
    expect(elite).toBe(true);
  });

  it("pays dividends on docking, capped at the hours a stake accrues", () => {
    const sim = docked();
    const id = sim.playerId;
    earnMerit(sim.world, rules.ranks[1].merit);
    invest(sim.world, id);
    const station = sim.world.ships.get(id)!.docked!;
    sim.undock(id);
    sim.world.tick += HOUR;
    const level = rules.investment.levels[0];
    expect(dividendDue(sim.world, HOME)).toBe(level.dividendPerHour);
    const credits = sim.world.credits;
    sim.world.tick += 100 * HOUR;
    sim.drainEvents();
    dockShip(sim.world, id, station);
    const events: SimEvent[] = sim.drainEvents();
    const paid = rules.investment.maxDividendHours * level.dividendPerHour;
    expect(sim.world.credits).toBe(credits + paid);
    expect(events.find((e) => e.type === "dividend")).toEqual({
      type: "dividend",
      station: HOME,
      credits: paid,
    });
    expect(dividendDue(sim.world, HOME)).toBe(0);
  });
});

describe("the career", () => {
  it("survives a save and a jump", () => {
    const sim = docked();
    earnMerit(sim.world, 150);
    buyLicence(sim.world, sim.playerId, "freight");
    invest(sim.world, sim.playerId);
    const back = restore(serialize({ sim, memory: {}, discovered: new Set() }));
    expect(back.sim.world.career).toEqual(sim.world.career);
    expect(back.sim.world.career).toBe(back.sim.missions!.career);
  });
});
