import type { Vec2 } from '@void-frontier/kernel';
import { readTelemetry, type EntityId, type Simulation } from '@void-frontier/simulation';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  HemisphereLight,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CameraRig } from './camera.ts';
import { fromScene, toScene } from './coords.ts';
import { DustField, PlaneGrid, createBeacon, createPlanet, createStarfield } from './environment.ts';
import { FlightOverlay } from './overlay.ts';
import { PALETTE } from './palette.ts';
import { buildShipModel, type ShipModel } from './shipModel.ts';

export interface RenderOptions {
  /** World point the player is steering toward, if mouse steering is on. */
  aim: Vec2 | null;
}

export interface RenderStats {
  drawCalls: number;
  triangles: number;
}

/** Reads the simulation and draws it. It never writes to the simulation. */
export class SpaceRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly scene = new Scene();
  readonly rig = new CameraRig();
  private readonly ships = new Map<EntityId, ShipModel>();
  private readonly beacons: { update(time: number): void }[] = [];
  private readonly starfield;
  private readonly dust;
  private readonly grid = new PlaneGrid();
  private readonly overlay = new FlightOverlay();
  private readonly raycaster = new Raycaster();
  private readonly plane = new Plane(new Vector3(0, 1, 0), 0);
  private time = 0;

  constructor(canvas: HTMLCanvasElement, sim: Simulation, seed: number) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // The composer renders several passes per frame; count them all, then reset per frame.
    this.renderer.info.autoReset = false;
    this.scene.background = new Color(PALETTE.space);

    const sun = new DirectionalLight(0xfff1dc, 2.6);
    sun.position.set(-600, 900, 400);
    this.scene.add(sun, new HemisphereLight(0x8fb4d9, 0x1a1410, 0.55), new AmbientLight(0x404858, 0.4));

    this.starfield = createStarfield(seed);
    this.dust = new DustField(seed + 1);
    this.scene.add(this.starfield, this.dust.points, this.grid.lines, createPlanet(seed + 2), this.overlay.root);

    for (const beacon of sim.world.beacons.values()) {
      const model = createBeacon();
      toScene(beacon.position, 0, model.root.position);
      this.scene.add(model.root);
      this.beacons.push(model);
    }

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.rig.camera));
    this.bloom = new UnrealBloomPass(new Vector2(1, 1), 0.75, 0.45, 0.55);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  resize(width: number, height: number, pixelRatio: number): void {
    const ratio = Math.min(pixelRatio, 2);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(width, height);
    this.rig.setAspect(width / Math.max(1, height));
  }

  /** `alpha` blends the previous and current simulation states for smooth motion. */
  render(sim: Simulation, alpha: number, frameDt: number, options: RenderOptions): RenderStats {
    this.time += frameDt;
    this.renderer.info.reset();
    this.syncShips(sim, alpha);

    const body = sim.world.bodies.get(sim.playerId);
    const ship = sim.world.ships.get(sim.playerId);
    if (body && ship) {
      const position = toScene(lerp2(body.previousPosition, body.position, alpha));
      const velocity = toScene(body.velocity);
      const focus = this.rig.update(position, velocity, frameDt);
      this.dust.setFocus(focus);
      this.grid.setFocus(focus);
      this.starfield.position.copy(this.rig.camera.position);
      const angle = lerpAngle(body.previousAngle, body.angle, alpha);
      const telemetry = readTelemetry(sim.world, sim.playerId);
      this.overlay.update({
        position,
        forward: { x: Math.cos(angle), z: -Math.sin(angle) },
        velocity,
        stoppingDistance: telemetry?.stoppingDistance ?? 0,
        shipLength: ship.definition.hull.length,
        aim: options.aim ? toScene(options.aim) : null,
        scale: this.rig.zoomLevel * (1 + Math.min(0.9, Math.hypot(velocity.x, velocity.z) / 250)),
      });
    }
    for (const beacon of this.beacons) beacon.update(this.time);

    this.composer.render(frameDt);
    const info = this.renderer.info.render;
    return { drawCalls: info.calls, triangles: info.triangles };
  }

  /** Where a point on the canvas (normalised device coordinates) meets the flight plane. */
  screenToWorld(ndcX: number, ndcY: number): Vec2 | null {
    this.raycaster.setFromCamera(new Vector2(ndcX, ndcY), this.rig.camera);
    const hit = new Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, hit) ? fromScene(hit) : null;
  }

  dispose(): void {
    for (const model of this.ships.values()) model.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }

  private syncShips(sim: Simulation, alpha: number): void {
    for (const [id, ship] of sim.world.ships) {
      const body = sim.world.bodies.get(id);
      if (!body) continue;
      let model = this.ships.get(id);
      if (!model) {
        model = buildShipModel(ship.definition);
        this.ships.set(id, model);
        this.scene.add(model.root);
      }
      toScene(lerp2(body.previousPosition, body.position, alpha), 0, model.root.position);
      model.root.rotation.y = lerpAngle(body.previousAngle, body.angle, alpha);
      model.update(ship.output, this.time);
    }
    for (const [id, model] of this.ships) {
      if (!sim.world.ships.has(id)) {
        this.scene.remove(model.root);
        model.dispose();
        this.ships.delete(id);
      }
    }
  }
}

const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function lerpAngle(a: number, b: number, t: number): number {
  let delta = b - a;
  if (delta > Math.PI) delta -= Math.PI * 2;
  else if (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}
