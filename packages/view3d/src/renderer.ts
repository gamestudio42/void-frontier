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
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { AsteroidRenderer } from './asteroids.ts';
import { CameraRig } from './camera.ts';
import { fromScene, toScene } from './coords.ts';
import { DustField, PlaneGrid, createBeacon, createPlanet, createStarfield } from './environment.ts';
import { createNebula } from './nebula.ts';
import { FlightOverlay } from './overlay.ts';
import { PALETTE } from './palette.ts';
import { ParticleSystem } from './particles.ts';
import { buildShipModel, type ShipModel, type ThrusterGroup } from './shipModel.ts';
import { buildStationModel, type StationModel } from './station.ts';

export interface RenderOptions {
  /** World point the player is steering toward, if mouse steering is on. */
  aim: Vec2 | null;
}

export type Quality = 'high' | 'medium' | 'low';

export interface RenderStats {
  drawCalls: number;
  triangles: number;
}

interface Blast {
  ring: Mesh;
  light: PointLight;
  age: number;
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
const DUST = { r: 0.28, g: 0.26, b: 0.24 };
const DUST_END = { r: 0.0, g: 0.0, b: 0.0 };
const FIRE = { r: 2.4, g: 1.4, b: 0.5 };
const FIRE_END = { r: 0.4, g: 0.05, b: 0.02 };

/** Reads the simulation and draws it. It never writes to the simulation. */
export class SpaceRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly scene = new Scene();
  readonly rig = new CameraRig();
  private readonly ships = new Map<EntityId, ShipModel>();
  private readonly stations: StationModel[] = [];
  private readonly beacons: { update(time: number): void }[] = [];
  private readonly asteroids: AsteroidRenderer;
  private readonly particles = new ParticleSystem();
  private readonly blasts: Blast[] = [];
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

  constructor(canvas: HTMLCanvasElement, sim: Simulation, seed: number) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    // The composer renders several passes per frame; count them all, then reset per frame.
    this.renderer.info.autoReset = false;
    this.scene.background = new Color(PALETTE.space);

    this.sun = new DirectionalLight(0xfff1dc, 3.2);
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

    this.nebula = createNebula(seed);
    this.starfield = createStarfield(seed);
    this.dust = new DustField(seed + 1);
    this.scene.add(this.nebula, this.starfield, this.dust.points, this.grid.lines, createPlanet(seed + 2), this.overlay.root, this.particles.points);

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
   * medium = 1x resolution, 1024 shadows; low = reduced resolution, no shadows or bloom.
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
    const cap = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1 : 0.75;
    const ratio = Math.min(pixelRatio, cap);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(width, height);
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
      } else if (event.type === 'shipDestroyed') {
        this.explode(event.position);
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

    const body = sim.world.bodies.get(sim.playerId);
    const ship = sim.world.ships.get(sim.playerId);
    if (body && ship) {
      const position = toScene(lerp2(body.previousPosition, body.position, alpha));
      const velocity = toScene(body.velocity);
      const focus = this.rig.update(position, velocity, frameDt);
      this.dust.setFocus(focus);
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

  dispose(): void {
    for (const model of this.ships.values()) model.dispose();
    for (const station of this.stations) station.dispose();
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
        model = buildShipModel(ship.definition);
        this.ships.set(id, model);
        this.scene.add(model.root);
      }
      model.root.visible = !ship.destroyed;
      if (ship.destroyed) continue;
      toScene(lerp2(body.previousPosition, body.position, alpha), 0, model.root.position);
      model.root.rotation.y = lerpAngle(body.previousAngle, body.angle, alpha);
      model.update(ship.output, this.time);
      model.root.updateMatrixWorld();
      this.exhaust(id, model, ship.output, toScene(body.velocity), frameDt);
    }
    for (const [id, model] of this.ships) {
      if (!sim.world.ships.has(id)) {
        this.scene.remove(model.root);
        model.dispose();
        this.ships.delete(id);
      }
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
    const ring = new Mesh(
      new RingGeometry(0.8, 1, 64),
      new MeshBasicMaterial({ color: 0xffc27a, transparent: true, blending: AdditiveBlending, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(p);
    const light = new PointLight(0xffa860, 40000, 600, 2);
    light.position.copy(p).setY(30);
    this.scene.add(ring, light);
    this.blasts.push({ ring, light, age: 0 });
  }

  private updateBlasts(dt: number): void {
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const blast = this.blasts[i];
      blast.age += dt;
      const t = blast.age / 1.4;
      blast.ring.scale.setScalar(4 + t * 160);
      (blast.ring.material as MeshBasicMaterial).opacity = Math.max(0, 1 - t);
      blast.light.intensity = 40000 * Math.max(0, 1 - blast.age / 0.8) ** 2;
      if (t >= 1) {
        this.scene.remove(blast.ring, blast.light);
        blast.ring.geometry.dispose();
        (blast.ring.material as MeshBasicMaterial).dispose();
        blast.light.dispose();
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
