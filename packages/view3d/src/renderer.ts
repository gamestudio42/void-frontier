import type { SectorDefinition } from '@void-frontier/content';
import type { Vec2 } from '@void-frontier/kernel';
import { readTelemetry, type EntityId, type SimEvent, type Simulation, type ThrusterOutput } from '@void-frontier/simulation';
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PCFSoftShadowMap,
  Plane,
  PointLight,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { AsteroidRenderer } from './asteroids.ts';
import { createGiant } from './giants.ts';
import { createCache, createDerelict, createGate, createWell, type Landmark } from './landmarks.ts';
import { BeamRenderer, ShieldBubble, TracerRenderer } from './combatFx.ts';
import { PickupRenderer } from './mining.ts';
import { CameraRig } from './camera.ts';
import { fromScene, toScene } from './coords.ts';
import { DustField, PlaneGrid, createBeacon, createPlanet, createStarfield, type PlanetLook } from './environment.ts';
import { createNebula } from './nebula.ts';
import { FlightOverlay } from './overlay.ts';
import { PALETTE } from './palette.ts';
import { ParticleSystem } from './particles.ts';
import { buildShipModel, type ShipModel, type ThrusterGroup } from './shipModel.ts';
import { buildStationModel, type StationModel } from './station.ts';

export interface RenderOptions {
  /** World point the player is steering toward, if mouse steering is on. */
  aim: Vec2 | null;
  /** Combat target to keep in frame, if any. */
  frame?: Vec2 | null;
}

/** What a sector's own colour needs from its data. */
export type SectorLook = NonNullable<SectorDefinition['environment']['look']>;

export type Quality = 'high' | 'medium' | 'low';

export interface RenderStats {
  drawCalls: number;
  triangles: number;
}

interface Blast {
  ring: Mesh;
  light: PointLight | null;
  age: number;
  /** seconds the ring takes to expand */
  duration: number;
  /** final ring radius in metres */
  reach: number;
}

const SUN_DIRECTION = new Vector3(-0.55, 0.75, 0.38).normalize();
const EXHAUST = { r: 0.22, g: 0.36, b: 0.75 };
const EXHAUST_END = { r: 0.01, g: 0.03, b: 0.1 };
const BOOST = { r: 0.8, g: 0.36, b: 0.12 };
const BOOST_END = { r: 0.1, g: 0.02, b: 0.01 };
const RCS = { r: 0.35, g: 0.38, b: 0.42 };
const RCS_END = { r: 0.02, g: 0.02, b: 0.03 };
const SPARK = { r: 2.2, g: 1.3, b: 0.5 };
const SPARK_END = { r: 0.5, g: 0.06, b: 0.0 };
const MISSILE_SMOKE = { r: 0.9, g: 0.75, b: 0.6 };
const MISSILE_SMOKE_END = { r: 0.06, g: 0.06, b: 0.07 };
const DUST = { r: 0.28, g: 0.26, b: 0.24 };
const DUST_END = { r: 0.0, g: 0.0, b: 0.0 };
const FIRE = { r: 2.4, g: 1.4, b: 0.5 };
const FIRE_END = { r: 0.4, g: 0.05, b: 0.02 };
const MUZZLE = { r: 2.0, g: 1.5, b: 0.7 };
const MUZZLE_END = { r: 0.3, g: 0.1, b: 0.02 };
const SHIELD_SPARK = { r: 0.4, g: 1.1, b: 2.0 };
const SHIELD_SPARK_END = { r: 0.0, g: 0.05, b: 0.2 };
const BEAM_GLOW = { r: 0.8, g: 1.6, b: 2.2 };
const BEAM_GLOW_END = { r: 0.0, g: 0.1, b: 0.3 };

/** Reads the simulation and draws it. It never writes to the simulation. */
export class SpaceRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly scene = new Scene();
  readonly rig = new CameraRig();
  private readonly ships = new Map<EntityId, ShipModel>();
  private readonly stations: StationModel[] = [];
  private readonly beacons: { update(time: number): void }[] = [];
  private readonly landmarks: Landmark[] = [];
  private readonly asteroids: AsteroidRenderer;
  private readonly particles = new ParticleSystem();
  private readonly blasts: Blast[] = [];
  private readonly tracers: TracerRenderer;
  private readonly pickups: PickupRenderer;
  private readonly beams: BeamRenderer;
  private readonly shields = new Map<EntityId, ShieldBubble>();
  private readonly projected = new Vector3();
  private readonly sun: DirectionalLight;
  private readonly starfield;
  private readonly nebula;
  private readonly dust;
  private readonly grid = new PlaneGrid();
  private readonly overlay = new FlightOverlay();
  private readonly raycaster = new Raycaster();
  private readonly plane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly emitPosition = new Vector3();
  private readonly emitDirection = new Vector3();
  private readonly emitCarry = new Map<string, number>();
  private time = 0;
  private bloom: UnrealBloomPass;
  private quality: Quality = 'high';
  private size = { width: 1, height: 1, pixelRatio: 1 };

  constructor(canvas: HTMLCanvasElement, sim: Simulation, seed: number, planet?: PlanetLook, look?: SectorLook) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    // The composer renders several passes per frame; count them all, then reset per frame.
    this.renderer.info.autoReset = false;
    this.scene.background = new Color(PALETTE.space);

    this.sun = new DirectionalLight(look?.sun ?? 0xfff1dc, look?.sunIntensity ?? 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = -360;
    shadowCamera.right = 360;
    shadowCamera.top = 360;
    shadowCamera.bottom = -360;
    shadowCamera.near = 10;
    shadowCamera.far = 3000;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new HemisphereLight(0x7f9fc8, 0x1a1410, 0.5), new AmbientLight(0x404858, 0.35));

    this.nebula = createNebula(seed, look?.tint, look?.tintStrength);
    this.starfield = createStarfield(seed);
    this.dust = new DustField(seed + 1);
    this.scene.add(this.nebula, this.starfield, this.dust.points, this.grid.lines, createPlanet(seed + 2, planet), this.overlay.root, this.particles.points);

    for (const beacon of sim.world.beacons.values()) {
      const model = createBeacon();
      toScene(beacon.position, 0, model.root.position);
      this.scene.add(model.root);
      this.beacons.push(model);
    }
    for (const [id, station] of sim.world.stations) {
      const body = sim.world.bodies.get(id)!;
      const model = buildStationModel(station.definition, seed + id);
      toScene(body.position, 0, model.root.position);
      model.root.rotation.y = body.angle;
      this.scene.add(model.root);
      this.stations.push(model);
    }
    this.asteroids = new AsteroidRenderer(this.scene, sim.world);
    const place = (landmark: Landmark, position: Vec2) => {
      toScene(position, 0, landmark.root.position);
      this.scene.add(landmark.root);
      this.landmarks.push(landmark);
    };
    for (const gate of sim.world.gates.values()) place(createGate(), gate.position);
    (look?.giants ?? []).forEach((giant, i) => {
      const landmark = createGiant(giant.kind, seed + i * 31, giant.scale, giant.angle);
      const depth = landmark.root.position.y;
      place(landmark, { x: giant.x, y: giant.y });
      landmark.root.position.y = depth;
    });
    if (look?.star) {
      const star = new Mesh(new SphereGeometry(look.star.radius, 40, 20), new MeshBasicMaterial({ color: new Color(look.star.color).multiplyScalar(3), fog: false }));
      star.position.set(look.star.x, look.star.y, look.star.z);
      this.scene.add(star);
    }
    for (const well of sim.world.anomalies) place(createWell(well.radius * 0.55), well.position);
    for (const poi of sim.world.pointsOfInterest.values()) {
      if (poi.kind === 'derelict') place(createDerelict(), poi.position);
      else if (poi.kind === 'cache') place(createCache(), poi.position);
    }
    this.tracers = new TracerRenderer(this.scene);
    this.pickups = new PickupRenderer(this.scene);
    this.beams = new BeamRenderer(this.scene);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.rig.camera));
    this.bloom = new UnrealBloomPass(new Vector2(1, 1), 0.6, 0.45, 0.72);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  get currentQuality(): Quality {
    return this.quality;
  }

  /**
   * Trade fidelity for frame rate: high = full resolution, 2048 shadows and bloom;
   * medium = slightly reduced resolution, 1024 shadows, half-resolution bloom;
   * low = reduced resolution, no shadows or bloom.
   */
  setQuality(quality: Quality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.sun.castShadow = quality !== 'low';
    const mapSize = quality === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== mapSize) {
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.bloom.enabled = quality !== 'low';
    // Materials compile differently with and without shadows.
    this.scene.traverse((object) => {
      const material = (object as Mesh).material;
      if (material && !Array.isArray(material)) material.needsUpdate = true;
    });
    this.resize(this.size.width, this.size.height, this.size.pixelRatio);
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.size = { width, height, pixelRatio };
    const cap = this.quality === 'high' ? 2 : this.quality === 'medium' ? 0.85 : 0.75;
    const ratio = Math.min(pixelRatio, cap);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(width, height);
    // On a 1x screen shadows alone made medium no faster than high: its bloom runs at half size.
    if (this.quality === 'medium') this.bloom.setSize(Math.round((width * ratio) / 2), Math.round((height * ratio) / 2));
    this.rig.setAspect(width / Math.max(1, height));
    this.particles.setScale(height * ratio);
  }

  /** Turn simulation events into effects: sparks and shake on impact, a blast on destruction. */
  handleEvents(sim: Simulation, events: SimEvent[]): void {
    for (const event of events) {
      if (event.type === 'collision') {
        const involvesPlayer = event.a === sim.playerId || event.b === sim.playerId;
        this.sparks(event.point, event.normal, event.speed);
        if (involvesPlayer) this.rig.shake(Math.min(0.9, 0.12 + event.speed / 40 + event.damage / 400));
      } else if (event.type === 'scan') {
        this.ring(toScene(event.position, 0.6), event.range, 1.3, 0x6fd3ff, null);
      } else if (event.type === 'asteroidDepleted') {
        const p = toScene(event.position, 0);
        for (let i = 0; i < 80 + event.radius * 10; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 2 + Math.random() * 14;
          this.particles.emit(p.x, (Math.random() - 0.5) * event.radius, p.z, Math.cos(a) * s, (Math.random() - 0.5) * 4, Math.sin(a) * s, DUST, DUST_END, 2 + Math.random() * event.radius, 1.5 + Math.random() * 2, 0.4);
        }
        for (let i = 0; i < 30; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 6 + Math.random() * 20;
          this.particles.emit(p.x, 0, p.z, Math.cos(a) * s, Math.random() * 4, Math.sin(a) * s, SPARK, SPARK_END, 0.8, 0.4 + Math.random() * 0.5, 1);
        }
      } else if (event.type === 'shot') {
        const p = toScene(event.position, 1);
        for (let i = 0; i < 6; i++) {
          const s = 30 + Math.random() * 60;
          this.particles.emit(p.x, p.y, p.z, event.direction.x * s + (Math.random() - 0.5) * 12, 0, -event.direction.y * s + (Math.random() - 0.5) * 12, MUZZLE, MUZZLE_END, 1.4 + Math.random(), 0.06 + Math.random() * 0.06, 6);
        }
      } else if (event.type === 'hit') {
        const p = toScene(event.point, 1);
        const count = event.beam ? 1 : 10;
        if (event.shieldDamage > 0) {
          const model = this.ships.get(event.target);
          const bubble = this.shields.get(event.target);
          if (model && bubble) bubble.hit(model.root.worldToLocal(p.clone()));
          for (let i = 0; i < count; i++) this.particles.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 40, SHIELD_SPARK, SHIELD_SPARK_END, 1 + Math.random(), 0.2 + Math.random() * 0.3, 2);
        } else if (event.hullDamage > 0) {
          for (let i = 0; i < count * 1.5; i++) this.particles.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 50, Math.random() * 15, (Math.random() - 0.5) * 50, SPARK, SPARK_END, 0.7 + Math.random() * 0.8, 0.25 + Math.random() * 0.5, 1.5);
          if (event.target === sim.playerId) this.rig.shake(event.beam ? 0.01 : 0.06);
        } else {
          for (let i = 0; i < count / 2; i++) this.particles.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 12, Math.random() * 4, (Math.random() - 0.5) * 12, DUST, DUST_END, 3 + Math.random() * 3, 0.6 + Math.random(), 1);
        }
      } else if (event.type === 'shipDestroyed') {
        this.explode(event.position);
        // Big ships go up in stages.
        const size = sim.world.ships.get(event.id)?.definition.hull.length ?? 0;
        if (size > 18) {
          for (let i = 0; i < 3; i++) this.explode({ x: event.position.x + (Math.random() - 0.5) * size * 1.4, y: event.position.y + (Math.random() - 0.5) * size * 1.4 });
          this.rig.shake(0.5);
        }
        if (event.id === sim.playerId) this.rig.shake(1);
      }
    }
  }

  /** `alpha` blends the previous and current simulation states for smooth motion. */
  render(sim: Simulation, alpha: number, frameDt: number, options: RenderOptions): RenderStats {
    this.time += frameDt;
    this.renderer.info.reset();
    this.syncShips(sim, alpha, frameDt);
    this.asteroids.update(sim.world, alpha);
    for (const station of this.stations) station.update(this.time);
    for (const beacon of this.beacons) beacon.update(this.time);
    for (const landmark of this.landmarks) landmark.update(this.time);

    const body = sim.world.bodies.get(sim.playerId);
    const ship = sim.world.ships.get(sim.playerId);
    if (body && ship) {
      const position = toScene(lerp2(body.previousPosition, body.position, alpha));
      const velocity = toScene(body.velocity);
      const focus = this.rig.update(position, velocity, frameDt, options.frame ? toScene(options.frame) : null);
      this.dust.setFocus(focus, this.rig.camera.position.distanceTo(focus));
      this.grid.setFocus(focus);
      this.starfield.position.copy(this.rig.camera.position);
      this.nebula.position.copy(this.rig.camera.position);
      // Keep the shadow frustum centred on the action.
      this.sun.target.position.copy(focus);
      this.sun.position.copy(focus).addScaledVector(SUN_DIRECTION, 1500);
      const angle = lerpAngle(body.previousAngle, body.angle, alpha);
      const telemetry = readTelemetry(sim.world, sim.playerId);
      this.overlay.root.visible = !ship.destroyed;
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

    this.tracers.update(sim.world, sim.playerId, alpha, sim.dt);
    // Missiles leave a smoke trail that lingers after them.
    for (const round of sim.world.projectiles.values()) {
      if (round.homing) this.particles.emit(round.position.x, 1, -round.position.y, (Math.random() - 0.5) * 3, Math.random(), (Math.random() - 0.5) * 3, MISSILE_SMOKE, MISSILE_SMOKE_END, 2.4, 1.3, 0.3);
    }
    this.pickups.update(sim.world, sim.playerId, this.time);
    for (const impact of this.beams.update(sim.world, this.time)) {
      const p = toScene(impact, 1);
      if (impact.mining) {
        // Cutting rock: hot sparks and a haze of dust.
        this.particles.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 24, Math.random() * 8, (Math.random() - 0.5) * 24, SPARK, SPARK_END, 0.7, 0.3 + Math.random() * 0.3, 1.5);
        if (Math.random() < 0.5) this.particles.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 6, Math.random() * 2, (Math.random() - 0.5) * 6, DUST, DUST_END, 3 + Math.random() * 3, 0.8 + Math.random(), 0.6);
      } else {
        for (let i = 0; i < 2; i++) this.particles.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 30, Math.random() * 6, (Math.random() - 0.5) * 30, BEAM_GLOW, BEAM_GLOW_END, 2 + Math.random() * 2, 0.15 + Math.random() * 0.2, 3);
      }
    }
    this.updateBlasts(frameDt);
    this.particles.update(frameDt);
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

  /** Project a world point to canvas pixels; `onScreen` is false behind the camera or outside the view. */
  worldToScreen(point: Vec2, width: number, height: number): { x: number; y: number; onScreen: boolean; behind: boolean } {
    toScene(point, 0, this.projected).project(this.rig.camera);
    const behind = this.projected.z > 1;
    const x = (this.projected.x * 0.5 + 0.5) * width;
    const y = (-this.projected.y * 0.5 + 0.5) * height;
    return { x, y, behind, onScreen: !behind && x >= 0 && x <= width && y >= 0 && y <= height };
  }

  /** Docked, the scene slides right so the ship stays in view beside the station panel. */
  setSceneShift(share: number): void {
    const { width, height } = this.size;
    if (share === 0) this.rig.camera.clearViewOffset();
    else this.rig.camera.setViewOffset(width, height, -width * share, 0, width, height);
  }

  dispose(): void {
    for (const model of this.ships.values()) model.dispose();
    for (const bubble of this.shields.values()) bubble.dispose();
    this.tracers.dispose();
    this.pickups.dispose();
    this.beams.dispose();
    for (const station of this.stations) station.dispose();
    for (const landmark of this.landmarks) landmark.dispose();
    this.asteroids.dispose();
    this.particles.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }

  private syncShips(sim: Simulation, alpha: number, frameDt: number): void {
    for (const [id, ship] of sim.world.ships) {
      const body = sim.world.bodies.get(id);
      if (!body) continue;
      let model = this.ships.get(id);
      if (!model) {
        model = buildShipModel(ship.definition, ship.faction);
        this.ships.set(id, model);
        this.scene.add(model.root);
        if (ship.definition.shield.capacity > 0) {
          const bubble = new ShieldBubble(ship.definition.hull.length, ship.faction === 'pirate' ? new Color(1.6, 0.5, 0.35) : new Color(0.35, 0.9, 1.6));
          model.root.add(bubble.mesh);
          this.shields.set(id, bubble);
        }
      }
      model.root.visible = !ship.destroyed;
      if (ship.destroyed) continue;
      toScene(lerp2(body.previousPosition, body.position, alpha), 0, model.root.position);
      model.root.rotation.y = lerpAngle(body.previousAngle, body.angle, alpha);
      model.update(ship.output, this.time);
      this.damageSmoke(model, ship.subsystems, toScene(body.velocity), frameDt);
      this.shields.get(id)?.update(ship.shield / Math.max(1, ship.definition.shield.capacity), frameDt);
      model.root.updateMatrixWorld();
      this.exhaust(id, model, ship.output, toScene(body.velocity), frameDt);
    }
    for (const [id, model] of this.ships) {
      if (!sim.world.ships.has(id)) {
        this.scene.remove(model.root);
        model.dispose();
        this.ships.delete(id);
        this.shields.get(id)?.dispose();
        this.shields.delete(id);
      }
    }
  }

  /** Smoke from damaged sections and sparks from wrecked ones, emitted where the system sits. */
  private damageSmoke(model: ShipModel, systems: Record<string, number>, velocity: Vector3, dt: number): void {
    const half = model.length / 2;
    const zones: [string, number][] = [['engines', -0.7], ['reactor', -0.1], ['shieldGenerator', 0], ['cargoHold', 0.2], ['sensors', 0.7]];
    for (const [id, along] of zones) {
      const health = systems[id];
      if (health >= 0.5) continue;
      const rate = (0.5 - health) * 40;
      if (Math.random() > rate * dt) continue;
      this.emitPosition.set(along * half, 1.5, (Math.random() - 0.5) * 3).applyMatrix4(model.root.matrixWorld);
      const p = this.emitPosition;
      this.particles.emit(p.x, p.y, p.z, velocity.x + (Math.random() - 0.5) * 3, 2 + Math.random() * 2, velocity.z + (Math.random() - 0.5) * 3, DUST, DUST_END, 3 + Math.random() * 4, 1.2 + Math.random(), 0.3);
      if (health === 0 && Math.random() < 0.5) this.particles.emit(p.x, p.y, p.z, velocity.x + (Math.random() - 0.5) * 20, Math.random() * 6, velocity.z + (Math.random() - 0.5) * 20, SPARK, SPARK_END, 0.7, 0.3 + Math.random() * 0.3, 1);
    }
  }

  private exhaust(id: EntityId, model: ShipModel, output: ThrusterOutput, velocity: Vector3, dt: number): void {
    const throttle: Record<ThrusterGroup, number> = {
      main: output.main,
      reverse: output.reverse,
      pushRight: Math.max(0, output.lateral),
      pushLeft: Math.max(0, -output.lateral),
      ccw: Math.max(0, output.rotation),
      cw: Math.max(0, -output.rotation),
    };
    model.emitters.forEach((emitter, index) => {
      const level = throttle[emitter.group];
      const key = `${id}:${index}`;
      if (level < 0.02) {
        this.emitCarry.set(key, 0);
        return;
      }
      const main = emitter.group === 'main';
      const rate = (main ? 180 : 50) * level * (output.boosting && main ? 1.6 : 1);
      let carry = (this.emitCarry.get(key) ?? 0) + rate * dt;
      this.emitPosition.copy(emitter.position).applyMatrix4(model.root.matrixWorld);
      this.emitDirection.copy(emitter.direction).transformDirection(model.root.matrixWorld);
      while (carry >= 1) {
        carry -= 1;
        const speed = main ? 70 + Math.random() * 40 : 18 + Math.random() * 10;
        const spread = main ? 7 : 5;
        const t = Math.random() * dt;
        this.particles.emit(
          this.emitPosition.x + velocity.x * t,
          this.emitPosition.y,
          this.emitPosition.z + velocity.z * t,
          velocity.x + this.emitDirection.x * speed + (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * spread * 0.5,
          velocity.z + this.emitDirection.z * speed + (Math.random() - 0.5) * spread,
          main ? (output.boosting ? BOOST : EXHAUST) : RCS,
          main ? (output.boosting ? BOOST_END : EXHAUST_END) : RCS_END,
          main ? 1.4 + level * 0.9 : 0.9,
          main ? 0.35 + Math.random() * 0.25 : 0.25 + Math.random() * 0.15,
          main ? 0.6 : 2.5,
        );
      }
      this.emitCarry.set(key, carry);
    });
  }

  private sparks(point: Vec2, normal: Vec2, speed: number): void {
    const p = toScene(point, 1);
    const n = toScene(normal);
    const count = Math.min(90, 8 + Math.floor(speed * 4));
    for (let i = 0; i < count; i++) {
      const s = 4 + Math.random() * (6 + speed * 1.5);
      const tx = -n.z;
      const tz = n.x;
      const side = (Math.random() - 0.5) * 2;
      this.particles.emit(
        p.x, p.y, p.z,
        (n.x * 0.6 + tx * side) * s, (Math.random() - 0.2) * s * 0.6, (n.z * 0.6 + tz * side) * s,
        SPARK, SPARK_END, 0.8 + Math.random() * 0.8, 0.3 + Math.random() * 0.7, 1.2,
      );
    }
    for (let i = 0; i < count / 3; i++) {
      this.particles.emit(
        p.x, p.y, p.z,
        (n.x + (Math.random() - 0.5)) * 6, (Math.random() - 0.5) * 3, (n.z + (Math.random() - 0.5)) * 6,
        DUST, DUST_END, 5 + Math.random() * 6, 1 + Math.random(), 0.8,
      );
    }
  }

  private explode(position: Vec2): void {
    const p = toScene(position, 2);
    for (let i = 0; i < 700; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const s = Math.pow(Math.random(), 0.6) * 75;
      const fire = Math.random() < 0.75;
      this.particles.emit(
        p.x, p.y, p.z,
        Math.sin(phi) * Math.cos(theta) * s, Math.cos(phi) * s * 0.4, Math.sin(phi) * Math.sin(theta) * s,
        fire ? FIRE : SPARK, fire ? FIRE_END : SPARK_END,
        fire ? 3 + Math.random() * 6 : 1 + Math.random(),
        0.6 + Math.random() * 1.6, fire ? 1.4 : 0.5,
      );
    }
    const light = new PointLight(0xffa860, 40000, 600, 2);
    light.position.copy(p).setY(30);
    this.scene.add(light);
    this.ring(p, 165, 1.4, 0xffc27a, light);
  }

  /** Expanding flat ring: explosion shockwave or scanner pulse. */
  private ring(position: Vector3, reach: number, duration: number, color: number, light: PointLight | null): void {
    const ring = new Mesh(
      new RingGeometry(0.97, 1, 96),
      new MeshBasicMaterial({ color, transparent: true, blending: AdditiveBlending, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(position);
    this.scene.add(ring);
    this.blasts.push({ ring, light, age: 0, duration, reach });
  }

  private updateBlasts(dt: number): void {
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const blast = this.blasts[i];
      blast.age += dt;
      const t = blast.age / blast.duration;
      // Ease out: fast at first, slowing as it spreads.
      blast.ring.scale.setScalar(4 + (1 - (1 - Math.min(1, t)) ** 2) * blast.reach);
      (blast.ring.material as MeshBasicMaterial).opacity = Math.max(0, 1 - t);
      if (blast.light) blast.light.intensity = 40000 * Math.max(0, 1 - blast.age / 0.8) ** 2;
      if (t >= 1) {
        this.scene.remove(blast.ring);
        blast.ring.geometry.dispose();
        (blast.ring.material as MeshBasicMaterial).dispose();
        if (blast.light) {
          this.scene.remove(blast.light);
          blast.light.dispose();
        }
        this.blasts.splice(i, 1);
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
