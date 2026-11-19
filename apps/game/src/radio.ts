import type { SimEvent, Simulation } from '@void-frontier/simulation';

/**
 * In-flight radio: short lines from the cast at the moments that matter, so the world talks
 * back. Pure presentation, read from the simulation's events and state; it never changes
 * the game.
 *
 * - Dispatch (Outpost Authority): the station's voice, incidents, the hull, promotions.
 * - Cmdr. Oyelaran (Frontier Guard): combat, bosses, the dangerous sectors.
 * - The Ferrum foreman: mining, a full hold, the Industrial Belt.
 * - Kess Varo (the pirates): taunts at elites, traps and in pirate space.
 * - Hired pilots, by name: what they remember of flying with the player.
 *
 * Each trigger has a few variants, played in turn. One line at a time, at least
 * `GAP` seconds apart, each trigger no more than once per `COOLDOWN`.
 */
export interface RadioLine {
  speaker: string;
  /** Message key of the line; `{pilot}` and `{sector}` are filled from `values`. */
  key: string;
  values: Record<string, string>;
  /** Hired pilot speaking, shown instead of a cast name. */
  name: string | null;
}

const GAP = 3;
const SHOW = 5.5;
const COOLDOWN = 40;
const VARIANTS = 3;

/** Who speaks when the player arrives in each sector. */
const ARRIVAL: Record<string, string> = {
  outpost_alpha: 'dispatcher',
  industrial_belt: 'foreman',
  pirate_territory: 'varo',
  anomaly_zone: 'oyelaran',
  graveyard: 'oyelaran',
  ember_reach: 'varo',
};

export class Radio {
  private queue: (RadioLine & { trigger: string })[] = [];
  private current: { line: RadioLine; at: number } | null = null;
  private lastAt = -100;
  private readonly heard = new Map<string, number>();
  private readonly turns = new Map<string, number>();
  private sector = '';
  private docked = true;
  private hunted = false;
  private hullWarned = -100;
  private readonly seenElites = new Set<number>();
  private readonly seenBosses = new Set<number>();

  /** The line on screen now, if any. */
  line(clock: number): RadioLine | null {
    if (this.current && clock - this.current.at > SHOW) this.current = null;
    if (!this.current && this.queue.length && clock - this.lastAt >= GAP) {
      const next = this.queue.shift()!;
      this.current = { line: next, at: clock };
      this.lastAt = clock;
    }
    return this.current?.line ?? null;
  }

  private say(trigger: string, speaker: string, clock: number, values: Record<string, string> = {}, name: string | null = null, variants = VARIANTS): void {
    if (clock - (this.heard.get(trigger) ?? -1e9) < COOLDOWN) return;
    if (this.queue.length >= 2) return;
    this.heard.set(trigger, clock);
    const turn = this.turns.get(trigger) ?? 0;
    this.turns.set(trigger, turn + 1);
    this.queue.push({ trigger, speaker, key: `radio.${trigger}.${turn % variants}`, values, name });
  }

  /** Reads this frame's events and the state that changed since the last one. */
  handle(sim: Simulation, events: SimEvent[], clock: number): void {
    const world = sim.world;
    const me = world.ships.get(sim.playerId);
    if (world.sectorId !== this.sector) {
      const first = this.sector === '';
      this.sector = world.sectorId;
      this.seenBosses.clear();
      this.seenElites.clear();
      if (!first) {
        const speaker = ARRIVAL[world.sectorId];
        if (speaker) this.say(`arrive.${world.sectorId}`, speaker, clock, {}, null, 2);
        this.recall(sim, clock);
      }
    }
    const docked = !me || me.docked !== null;
    if (this.docked && !docked) this.recall(sim, clock);
    this.docked = docked;

    if (me && !me.destroyed && !docked) {
      const share = me.hull / me.definition.hull.integrity;
      if (share < 0.25 && clock - this.hullWarned > 60) {
        this.hullWarned = clock;
        this.say('hull', 'dispatcher', clock);
      }
      let hunted = false;
      for (const pilot of world.pilots.values()) if (pilot.target === sim.playerId && pilot.morale !== undefined) hunted = true;
      if (hunted && !this.hunted) this.say('contact', 'oyelaran', clock);
      this.hunted = hunted;
      for (const [id, ship] of world.ships) {
        if (ship.destroyed) continue;
        if (ship.elite && !this.seenElites.has(id) && world.pilots.get(id)?.target === sim.playerId) {
          this.seenElites.add(id);
          this.say('elite', 'varo', clock);
        }
      }
      for (const state of world.bosses) {
        const p = world.bodies.get(state.ship)?.position;
        const at = world.bodies.get(sim.playerId)?.position;
        if (!p || !at || this.seenBosses.has(state.ship) || Math.hypot(p.x - at.x, p.y - at.y) > 2500) continue;
        this.seenBosses.add(state.ship);
        this.say(`boss.${state.id}`, 'varo', clock, {}, null, 1);
      }
    }

    for (const event of events) {
      if (event.type === 'incident' && (event.stage === 'warning' || (event.stage === 'started' && (event.kind === 'distress' || event.kind === 'unstableWreck')))) {
        this.say(`incident.${event.kind}`, 'dispatcher', clock, {}, null, 2);
      } else if (event.type === 'incident' && event.stage === 'ambush') {
        this.say('ambush', 'varo', clock);
      } else if (event.type === 'boss' && event.stage === 'open') {
        this.say('open', 'oyelaran', clock);
      } else if (event.type === 'boss' && event.stage === 'defeated' && event.credits > 0) {
        this.say('bossDown', 'oyelaran', clock);
      } else if (event.type === 'cargoFull' && event.ship === sim.playerId) {
        this.say('holdFull', 'foreman', clock);
      } else if (event.type === 'rank') {
        this.say('rank', 'dispatcher', clock);
      } else if (event.type === 'memory') {
        this.say(`memory.${event.kind}`, 'wing', clock, { pilot: event.pilot }, event.pilot);
      }
    }
  }

  /** A wingman flying out with the player brings up something they lived through together. */
  private recall(sim: Simulation, clock: number): void {
    for (const owned of sim.fleet.ships) {
      const pilot = owned.pilot;
      const memory = pilot?.memories?.at(-1);
      if (!pilot || !memory || owned.order?.kind !== 'wingman') continue;
      this.say(`recall.${memory.kind}`, 'wing', clock, { sector: memory.sector }, pilot.name);
      return;
    }
  }
}
