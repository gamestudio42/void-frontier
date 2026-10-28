import { OUTPOST_ALPHA } from '@void-frontier/content';
import { FIXED_DT, FixedStepper, type Vec2 } from '@void-frontier/kernel';
import { Simulation, hostilesNear, nearestObstacle, readTarget, readTelemetry } from '@void-frontier/simulation';
import { SpaceRenderer, type Quality } from '@void-frontier/view3d';
import { InputController } from './input.ts';
import { drawRadar } from './radar.ts';
import { drawTargeting } from './targeting.ts';
import type { HudStore } from './store.ts';

const HUD_INTERVAL = 0.1;
const TEST_CARGO_KG = 5000;
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
      togglePause: () => this.store.update({ paused: !this.store.getSnapshot().paused }),
      toggleCargo: () => {
        const ship = this.sim.world.ships.get(this.sim.playerId);
        if (ship) this.sim.setCargoMass(this.sim.playerId, ship.cargoMass > 0 ? 0 : TEST_CARGO_KG);
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
      relaunch: () => {
        if (this.sim.world.ships.get(this.sim.playerId)?.destroyed) this.restart();
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

  attachOverlay(canvas: HTMLCanvasElement | null): void {
    this.overlay = canvas;
  }

  start(): void {
    this.lastTime = performance.now();
    const frame = (now: number) => {
      this.frame(now);
      this.frameHandle = requestAnimationFrame(frame);
    };
    this.frameHandle = requestAnimationFrame(frame);
  }

  /** New sector from the same seed: everything is back where it started. */
  restart(): void {
    const zoom = this.renderer.rig.zoomLevel;
    const quality = this.renderer.currentQuality;
    this.renderer.dispose();
    this.sim = Simulation.fromSector(OUTPOST_ALPHA);
    this.renderer = new SpaceRenderer(this.canvas, this.sim, OUTPOST_ALPHA.seed);
    this.renderer.rig.zoomBy(zoom);
    this.renderer.setQuality(quality);
    this.stepper.reset();
    this.target = null;
    this.resize();
    this.publish();
  }

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.renderer.dispose();
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.canvas;
    this.renderer.resize(clientWidth, clientHeight, window.devicePixelRatio);
  }

  private frame(now: number): void {
    const elapsed = Math.max(0, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.clock += elapsed;
    const { paused, help } = this.store.getSnapshot();

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
      if (events.length) {
        this.renderer.handleEvents(this.sim, events);
        for (const event of events) {
          const mine = event.type === 'collision' && (event.a === this.sim.playerId || event.b === this.sim.playerId);
          if (mine && event.type === 'collision' && event.damage > 0) this.hits++;
          if (event.type === 'shipDestroyed' && event.id === this.sim.playerId) this.hits++;
          if (event.type === 'hit' && event.attacker === this.sim.playerId && this.sim.world.ships.has(event.target)) this.hitFlash = 1;
        }
      }
    }

    const frameDt = paused || help ? 0 : Math.min(elapsed, 0.1);
    // Keep a nearby target in frame so dogfights stay on screen.
    const targetBody = this.target !== null ? this.sim.world.bodies.get(this.target) : undefined;
    const me = this.sim.world.bodies.get(this.sim.playerId);
    const frameTarget = targetBody && me && Math.hypot(targetBody.position.x - me.position.x, targetBody.position.y - me.position.y) < 900 ? targetBody.position : null;
    const stats = this.renderer.render(this.sim, alpha, frameDt, { aim: this.input.steering ? this.aim : null, frame: frameTarget });
    if (this.radar) drawRadar(this.radar, this.sim, this.clock, this.target);
    this.hitFlash = Math.max(0, this.hitFlash - elapsed * 6);
    if (this.overlay) drawTargeting(this.overlay, this.sim, this.renderer, this.target, this.hitFlash, this.input.pointer);

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

  /** Drop a dead or out-of-range target; auto-acquire the nearest hostile when there is none. */
  private updateTarget(): void {
    const me = this.sim.world.ships.get(this.sim.playerId);
    if (!me) return;
    const range = me.definition.sensors.range;
    const hostiles = hostilesNear(this.sim.world, this.sim.playerId, range * 1.2);
    if (this.target !== null && !hostiles.includes(this.target)) this.target = null;
    if (this.target === null) this.target = hostilesNear(this.sim.world, this.sim.playerId, range)[0] ?? null;
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

  private publish(frameStats?: { fps: number; frameMs: number; stepsPerFrame: number; drawCalls: number; triangles: number }): void {
    const telemetry = readTelemetry(this.sim.world, this.sim.playerId);
    let station: { name: string; distance: number } | null = null;
    if (telemetry) {
      for (const [id, candidate] of this.sim.world.stations) {
        const p = this.sim.world.bodies.get(id)!.position;
        const distance = Math.hypot(p.x - telemetry.position.x, p.y - telemetry.position.y);
        if (!station || distance < station.distance) station = { name: candidate.name, distance };
      }
    }
    const previous = this.store.getSnapshot().stats;
    this.store.update({
      telemetry,
      station,
      proximity: nearestObstacle(this.sim.world, this.sim.playerId),
      target: readTarget(this.sim.world, this.sim.playerId, this.target),
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
