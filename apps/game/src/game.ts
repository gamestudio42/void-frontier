import { OUTPOST_ALPHA } from '@void-frontier/content';
import { FIXED_DT, FixedStepper, type Vec2 } from '@void-frontier/kernel';
import { getUpgrade } from '@void-frontier/content';
import { Simulation, decodeSave, encodeSave, restore, serialize, carryBoard, contractProgress, payout, dockingStatus, installUpgrades, hostilesNear, nearestObstacle, readTarget, readTelemetry, serviceCost, unitPrice, type DockRefusal } from '@void-frontier/simulation';
import { SpaceRenderer, type Quality } from '@void-frontier/view3d';
import { AudioEngine } from './audio.ts';
import { InputController } from './input.ts';
import { saveStore, type SlotId } from './saves.ts';
import type { Settings } from './settings.ts';
import { TUTORIAL } from './tutorial.ts';
import { drawRadar } from './radar.ts';
import { drawTargeting } from './targeting.ts';
import type { HudStore } from './store.ts';

const HUD_INTERVAL = 0.1;
const QUALITIES: Quality[] = ['high', 'medium', 'low'];

/** Owns the frame loop: input → fixed simulation steps → effects → interpolated render → HUD. */
export class Game {
  sim = Simulation.fromSector(OUTPOST_ALPHA);
  private renderer: SpaceRenderer;
  private readonly input: InputController;
  private readonly stepper = new FixedStepper({ dt: FIXED_DT, maxFrameTime: 0.25, maxStepsPerFrame: 8 });
  private readonly resizeObserver: ResizeObserver;
  private radar: HTMLCanvasElement | null = null;
  private overlay: HTMLCanvasElement | null = null;
  private target: number | null = null;
  private hitFlash = 0;
  private jettisonArmedAt = -10;
  private gains = new Map<string, { units: number; at: number }>();
  private notices: { text: string; kind: 'completed' | 'failed' | 'abandoned'; reward: number; at: number; id: number }[] = [];
  private dockRefused: { refusals: DockRefusal[]; at: number } | null = null;
  private frameHandle = 0;
  private lastTime = 0;
  private clock = 0;
  private hudTimer = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 0;
  private stepsThisWindow = 0;
  private droppedTotal = 0;
  private hits = 0;
  private aim: Vec2 | null = null;
  /** Automatic quality: step down after sustained low frame rate, unless the player chose one. */
  private autoQuality = true;
  private slowTime = 0;
  readonly audio = new AudioEngine();
  private shakeEnabled = true;
  private autosaveTimer = 0;
  /** The docking checklist stays hidden right after leaving the bay. */
  private undockedAt = -100;
  private frameErrorReported = false;
  /** Index into TUTORIAL, or null when no tutorial is running. */
  private tutorialStep: number | null = null;
  private tutorialStarted = 0;
  private tutorialStart = { heading: 0, credits: 0 };

  constructor(private readonly canvas: HTMLCanvasElement, private readonly store: HudStore) {
    this.renderer = new SpaceRenderer(canvas, this.sim, OUTPOST_ALPHA.seed);
    // ?quality=low|medium|high pins the graphics level (handy on weak machines and in tests).
    const requested = new URLSearchParams(window.location.search).get('quality') as Quality | null;
    if (requested && QUALITIES.includes(requested)) {
      this.autoQuality = false;
      this.renderer.setQuality(requested);
    }
    this.input = new InputController(canvas, {
      toggleFlightMode: () => {
        const ship = this.sim.world.ships.get(this.sim.playerId);
        if (ship) this.sim.setFlightMode(this.sim.playerId, ship.mode === 'newtonian' ? 'assisted' : 'newtonian');
        this.publish();
      },
      toggleSteering: () => this.publish(),
      toggleHelp: () => this.store.update({ help: !this.store.getSnapshot().help }),
      toggleDebug: () => this.store.update({ debug: !this.store.getSnapshot().debug }),
      togglePause: () => {
        const { menu } = this.store.getSnapshot();
        if (menu === 'main') return;
        this.store.update({ menu: menu === 'pause' ? null : 'pause', paused: false });
      },
      jettison: () => {
        // Two presses within a second, so a stray key does not dump a full hold.
        const now = this.clock;
        if (now - this.jettisonArmedAt < 1) {
          this.sim.jettison(this.sim.playerId);
          this.jettisonArmedAt = -10;
        } else this.jettisonArmedAt = now;
        this.publish();
      },
      cycleQuality: () => {
        const next = QUALITIES[(QUALITIES.indexOf(this.renderer.currentQuality) + 1) % QUALITIES.length];
        this.autoQuality = false;
        this.renderer.setQuality(next);
        this.publish();
      },
      cycleTarget: () => {
        const me = this.sim.world.ships.get(this.sim.playerId);
        if (!me) return;
        const hostiles = hostilesNear(this.sim.world, this.sim.playerId, me.definition.sensors.range);
        if (hostiles.length === 0) this.target = null;
        else this.target = hostiles[(hostiles.indexOf(this.target ?? -1) + 1) % hostiles.length];
        this.publish();
      },
      dockOrUndock: () => {
        const ship = this.sim.world.ships.get(this.sim.playerId);
        if (!ship || ship.destroyed) return;
        if (ship.docked !== null) this.undock();
        else {
          const result = this.sim.requestDock(this.sim.playerId);
          this.dockRefused = result.ok ? null : { refusals: result.refusals, at: this.clock };
        }
        this.publish();
      },
      scanOrRelaunch: () => {
        if (this.sim.world.ships.get(this.sim.playerId)?.destroyed) this.restart();
        else this.sim.scan(this.sim.playerId);
      },
      zoom: (factor) => this.renderer.rig.zoomBy(factor),
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  attachRadar(canvas: HTMLCanvasElement | null): void {
    this.radar = canvas;
  }

  // Station actions, called from the docked station panel.
  undock(): void {
    this.sim.undock(this.sim.playerId);
    this.undockedAt = this.clock;
    this.publish();
  }

  trade(resource: string, units: number, side: 'buy' | 'sell'): void {
    this.sim.trade(this.sim.playerId, resource, units, side);
    this.publish();
  }

  service(kind: 'repair' | 'refuel'): void {
    this.sim.service(this.sim.playerId, kind);
    this.publish();
  }

  acceptContract(id: number): void {
    this.sim.acceptContract(id);
    this.publish();
  }

  handInContract(id: number): void {
    this.sim.handInContract(id);
    this.publish();
  }

  abandonContract(id: number): void {
    this.sim.abandonContract(id);
    this.publish();
  }

  buyUpgrade(id: string): void {
    this.sim.buyUpgrade(this.sim.playerId, id);
    this.publish();
  }

  attachOverlay(canvas: HTMLCanvasElement | null): void {
    this.overlay = canvas;
  }

  start(): void {
    this.lastTime = performance.now();
    const frame = (now: number) => {
      // Keep the loop alive even if one frame fails; report it once.
      try {
        this.frame(now);
      } catch (error) {
        if (!this.frameErrorReported) console.error('Frame failed', error);
        this.frameErrorReported = true;
      }
      this.frameHandle = requestAnimationFrame(frame);
    };
    this.frameHandle = requestAnimationFrame(frame);
  }

  /** Relaunch after losing the ship: a fresh sector with the insured parts of the old game. */
  restart(): void {
    // Insurance: the hold is lost, upgrades are refitted, and 10% of credits pay the premium.
    const oldShip = this.sim.world.ships.get(this.sim.playerId);
    const upgrades = oldShip ? [...oldShip.upgrades] : [];
    const credits = Math.floor(this.sim.world.credits * 0.9);
    const board = this.sim.missions ? carryBoard(this.sim.missions, this.sim.world.tick, oldShip?.kills ?? 0) : null;
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    sim.world.credits = credits;
    installUpgrades(sim.world, sim.playerId, upgrades);
    if (board) sim.missions = board;
    this.replaceSim(sim);
  }

  /** A brand-new game, optionally with the guided first flight. */
  newGame(tutorial: boolean): void {
    this.replaceSim(Simulation.fromSector(OUTPOST_ALPHA));
    this.tutorialStep = tutorial ? 0 : null;
    this.beginTutorialStep();
    this.store.update({ menu: null });
  }

  /** Saves the current game into a slot. Saves only happen between steps, so the state is consistent. */
  async saveTo(slot: SlotId): Promise<void> {
    const file = encodeSave(serialize(this.sim, OUTPOST_ALPHA));
    await saveStore.put({ slot, savedAt: Date.now(), playtime: this.sim.world.tick / 60, credits: this.sim.world.credits, file });
  }

  /** Loads a save file (from a slot or an imported file). Throws a readable error when it is damaged. */
  load(file: unknown): void {
    const data = decodeSave(file);
    this.replaceSim(restore(OUTPOST_ALPHA, data));
    this.tutorialStep = null;
    this.store.update({ menu: null });
  }

  exportCurrent() {
    return encodeSave(serialize(this.sim, OUTPOST_ALPHA));
  }

  applySettings(settings: Settings): void {
    this.audio.setVolumes(settings.masterVolume, settings.effectsVolume, settings.musicVolume);
    this.shakeEnabled = settings.cameraShake;
    this.renderer.rig.shakeEnabled = settings.cameraShake;
    this.input.steering = settings.mouseSteering;
    if (!new URLSearchParams(window.location.search).get('quality')) {
      this.autoQuality = settings.quality === 'auto';
      if (settings.quality !== 'auto') this.renderer.setQuality(settings.quality);
    }
    this.publish();
  }

  skipTutorial(): void {
    this.tutorialStep = null;
    this.publish();
  }

  private beginTutorialStep(): void {
    const t = readTelemetry(this.sim.world, this.sim.playerId);
    this.tutorialStarted = this.clock;
    this.tutorialStart = { heading: t?.heading ?? 0, credits: t?.credits ?? 0 };
  }

  private replaceSim(sim: Simulation): void {
    const zoom = this.renderer.rig.zoomLevel;
    const quality = this.renderer.currentQuality;
    this.renderer.dispose();
    this.sim = sim;
    this.renderer = new SpaceRenderer(this.canvas, this.sim, OUTPOST_ALPHA.seed);
    this.renderer.rig.zoomBy(zoom);
    this.renderer.rig.shakeEnabled = this.shakeEnabled;
    this.renderer.setQuality(quality);
    this.stepper.reset();
    this.autosaveTimer = 0;
    this.target = null;
    this.gains.clear();
    this.dockRefused = null;
    this.notices = [];
    this.resize();
    this.publish();
  }

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.renderer.dispose();
    this.audio.dispose();
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.canvas;
    this.renderer.resize(clientWidth, clientHeight, window.devicePixelRatio);
  }

  private frame(now: number): void {
    const elapsed = Math.max(0, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.clock += elapsed;
    const snapshot = this.store.getSnapshot();
    const help = snapshot.help;
    const paused = snapshot.paused || snapshot.menu !== null;

    // The camera from the last frame is close enough to turn the cursor into a world point.
    this.aim = this.input.pointer ? this.renderer.screenToWorld(this.input.pointer.x, this.input.pointer.y) : null;

    let alpha = 1;
    if (paused || help) {
      this.stepper.reset();
    } else {
      this.updateTarget();
      // One command per frame, applied to every fixed step the frame runs.
      this.sim.setCommand(this.sim.playerId, { ...this.input.command(this.aim), target: this.target });
      const result = this.stepper.advance(elapsed);
      for (let i = 0; i < result.steps; i++) this.sim.step();
      alpha = result.alpha;
      this.stepsThisWindow += result.steps;
      this.droppedTotal += result.droppedTime;
      const events = this.sim.drainEvents();
      this.audio.handle(this.sim, events);
      this.updateTutorial(events);
      this.autosave(elapsed, events);
      if (events.length) {
        this.renderer.handleEvents(this.sim, events);
        for (const event of events) {
          const mine = event.type === 'collision' && (event.a === this.sim.playerId || event.b === this.sim.playerId);
          if (mine && event.type === 'collision' && event.damage > 0) this.hits++;
          if (event.type === 'shipDestroyed' && event.id === this.sim.playerId) this.hits++;
          if (event.type === 'hit' && event.attacker === this.sim.playerId && this.sim.world.ships.has(event.target)) this.hitFlash = 1;
          if (event.type === 'contract') {
            this.notices.push({ text: event.kind, kind: event.outcome, reward: event.reward, at: this.clock, id: event.id });
          }
          if (event.type === 'collected' && event.ship === this.sim.playerId) {
            const gain = this.gains.get(event.resource);
            // Merge pickups into one line while they keep coming.
            this.gains.set(event.resource, { units: (gain && this.clock - gain.at < 2.5 ? gain.units : 0) + event.units, at: this.clock });
          }
        }
      }
    }

    const frameDt = paused || help ? 0 : Math.min(elapsed, 0.1);
    // Keep a nearby target in frame so dogfights stay on screen.
    const targetBody = this.target !== null ? this.sim.world.bodies.get(this.target) : undefined;
    const me = this.sim.world.bodies.get(this.sim.playerId);
    const frameTarget = targetBody && me && Math.hypot(targetBody.position.x - me.position.x, targetBody.position.y - me.position.y) < 650 ? targetBody.position : null;
    this.audio.update(this.sim, !paused && !help, elapsed);
    const stats = this.renderer.render(this.sim, alpha, frameDt, { aim: this.input.steering ? this.aim : null, frame: frameTarget });
    if (this.radar) drawRadar(this.radar, this.sim, this.clock, this.target);
    this.hitFlash = Math.max(0, this.hitFlash - elapsed * 6);
    if (this.overlay) drawTargeting(this.overlay, this.sim, this.renderer, this.target, this.hitFlash, this.input.pointer, this.waypoints());

    this.fpsFrames++;
    this.fpsTime += elapsed;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
      this.adaptQuality(document.visibilityState === 'visible' && !paused && !help);
    }
    this.hudTimer += elapsed;
    if (this.hudTimer >= HUD_INTERVAL) {
      const frames = Math.max(1, Math.round(this.hudTimer * Math.max(this.fps, 1)));
      this.publish({
        fps: this.fps,
        frameMs: elapsed * 1000,
        stepsPerFrame: this.stepsThisWindow / frames,
        drawCalls: stats.drawCalls,
        triangles: stats.triangles,
      });
      this.hudTimer = 0;
      this.stepsThisWindow = 0;
    }
  }

  private updateTutorial(events: ReturnType<Simulation['drainEvents']>): void {
    if (this.tutorialStep === null) return;
    const telemetry = readTelemetry(this.sim.world, this.sim.playerId);
    if (!telemetry) return;
    const step = TUTORIAL[this.tutorialStep];
    const done = step.done({ telemetry, events, playerId: this.sim.playerId, stepTime: this.clock - this.tutorialStarted, start: this.tutorialStart });
    if (!done) return;
    this.audio.click();
    this.tutorialStep = this.tutorialStep + 1 < TUTORIAL.length ? this.tutorialStep + 1 : null;
    if (this.tutorialStep === null) this.notices.push({ text: 'tutorial', kind: 'completed', reward: 0, at: this.clock, id: -1 });
    this.beginTutorialStep();
  }

  /** Autosave on docking and every two minutes in flight; never while destroyed. */
  private autosave(elapsed: number, events: ReturnType<Simulation['drainEvents']>): void {
    this.autosaveTimer += elapsed;
    const docked = events.some((e) => e.type === 'docked' && e.ship === this.sim.playerId);
    const ship = this.sim.world.ships.get(this.sim.playerId);
    if (!ship || ship.destroyed) return;
    if (docked || this.autosaveTimer >= 120) {
      this.autosaveTimer = 0;
      void this.saveTo('auto').catch(() => undefined);
    }
  }

  /** Drop a dead or out-of-range target; auto-acquire the nearest hostile when there is none. */
  private updateTarget(): void {
    const me = this.sim.world.ships.get(this.sim.playerId);
    if (!me) return;
    if (me.docked !== null) {
      this.target = null;
      return;
    }
    const range = me.definition.sensors.range;
    const hostiles = hostilesNear(this.sim.world, this.sim.playerId, range * 1.2);
    if (this.target !== null && !hostiles.includes(this.target)) this.target = null;
    if (this.target === null) this.target = hostilesNear(this.sim.world, this.sim.playerId, range)[0] ?? null;
  }

  private dockingView() {
    const ship = this.sim.world.ships.get(this.sim.playerId);
    if (!ship || ship.docked !== null || ship.destroyed || this.clock - this.undockedAt < 10) return null;
    const status = dockingStatus(this.sim.world, this.sim.playerId, 400);
    return status ? { distance: status.distance, speed: status.speed, angleError: status.angleError, refusals: status.refusals, limits: status.limits } : null;
  }

  /** Drop points of active deliveries, labelled for the overlay. */
  private waypoints(): { label: string; position: { x: number; y: number } }[] {
    const board = this.sim.missions;
    if (!board) return [];
    return board.active
      .filter((c) => c.delivery)
      .map((c) => ({ label: this.labels.drop(c.delivery!.drop), position: board.drops.find((d) => d.id === c.delivery!.drop)!.position }));
  }

  /** Set by the UI so canvas labels follow the chosen language. */
  labels = { drop: (id: string) => id };

  private contractsView() {
    const board = this.sim.missions;
    if (!board) return null;
    const world = this.sim.world;
    const id = this.sim.playerId;
    const docked = world.ships.get(id)?.docked !== null;
    const describe = (c: (typeof board.offers)[number]) => ({
      id: c.id,
      kind: c.kind,
      elite: c.elite,
      reward: payout(board, c),
      seconds: c.duration,
      units: c.delivery?.units ?? c.mining?.units ?? c.bounty?.count ?? 0,
      resource: c.mining?.resource ?? null,
      drop: c.delivery?.drop ?? null,
    });
    return {
      reputation: board.reputation,
      maxActive: board.rules.maxActive,
      offers: board.offers.map(describe),
      active: board.active.map((c) => {
        const progress = contractProgress(world, board, id, c);
        return {
          ...describe(c),
          timeLeft: Math.max(0, (c.deadlineTick - world.tick) / 60),
          current: progress.current,
          target: progress.target,
          canHandIn: docked && !c.delivery && progress.current >= progress.target,
          dropPosition: c.delivery ? board.drops.find((d) => d.id === c.delivery!.drop)!.position : null,
        };
      }),
      history: board.history.slice(0, 6),
    };
  }

  private stationView() {
    const world = this.sim.world;
    const ship = world.ships.get(this.sim.playerId);
    if (!ship || ship.docked === null) return null;
    const station = world.stations.get(ship.docked)!;
    return {
      name: station.name,
      credits: world.credits,
      market: station.market.map((item) => ({
        resource: item.resource,
        stock: Math.floor(item.stock),
        held: ship.cargo.get(item.resource) ?? 0,
        buy: item.sells ? unitPrice(item, 'buy') : null,
        sell: item.buys ? unitPrice(item, 'sell') : null,
      })),
      repairCost: serviceCost(world, this.sim.playerId, 'repair'),
      refuelCost: serviceCost(world, this.sim.playerId, 'refuel'),
      upgrades: station.definition.upgrades.map((id) => ({ id, cost: getUpgrade(id).cost, installed: ship.upgrades.includes(id) })),
    };
  }

  private adaptQuality(measuring: boolean): void {
    if (!this.autoQuality || !measuring) return;
    this.slowTime = this.fps < 45 ? this.slowTime + 0.5 : 0;
    const index = QUALITIES.indexOf(this.renderer.currentQuality);
    if (this.slowTime >= 3 && index < QUALITIES.length - 1) {
      this.renderer.setQuality(QUALITIES[index + 1]);
      this.slowTime = 0;
    }
  }

  publish(frameStats?: { fps: number; frameMs: number; stepsPerFrame: number; drawCalls: number; triangles: number }): void {
    const telemetry = readTelemetry(this.sim.world, this.sim.playerId);
    const previous = this.store.getSnapshot().stats;
    this.store.update({
      telemetry,
      proximity: nearestObstacle(this.sim.world, this.sim.playerId),
      target: readTarget(this.sim.world, this.sim.playerId, this.target),
      gains: [...this.gains.entries()].filter(([, g]) => this.clock - g.at < 2.5).map(([resource, g]) => ({ resource, units: g.units })),
      jettisonArmed: this.clock - this.jettisonArmedAt < 1,
      docking: this.dockingView(),
      dockRefused: this.dockRefused && this.clock - this.dockRefused.at < 3 ? this.dockRefused.refusals : null,
      station: this.stationView(),
      contracts: this.contractsView(),
      tutorial:
        this.tutorialStep === null
          ? null
          : { index: this.tutorialStep, total: TUTORIAL.length, title: TUTORIAL[this.tutorialStep].title, hint: TUTORIAL[this.tutorialStep].hint },
      notices: this.notices.filter((n) => this.clock - n.at < 4.5).map((n) => ({ id: n.id, kind: n.text, outcome: n.kind, reward: n.reward })),
      holdFull: (() => {
        const t = readTelemetry(this.sim.world, this.sim.playerId);
        return !!t && t.holdMass >= t.holdMaxMass - 60;
      })(),
      hits: this.hits,
      steering: this.input.steering,
      braking: this.input.isHeld('Space'),
      stats: {
        ...previous,
        ...frameStats,
        tick: this.sim.world.tick,
        droppedSeconds: this.droppedTotal,
        entities: this.sim.world.entityCount,
        zoom: this.renderer.rig.zoomLevel,
        quality: this.renderer.currentQuality,
        autoQuality: this.autoQuality,
      },
    });
  }
}
