import type { EntityId, World } from '@void-frontier/simulation';
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three';

const MAX_ROUNDS = 600;
const PLAYER_TRACER = new Color(2.2, 1.5, 0.55);
const PIRATE_TRACER = new Color(2.4, 0.45, 0.25);

/** Autocannon rounds as glowing streaks, one instanced draw call for all of them. */
export class TracerRenderer {
  private readonly mesh: InstancedMesh;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3();
  private readonly axis = new Vector3(1, 0, 0);
  private readonly dir = new Vector3();

  constructor(scene: Scene) {
    const geometry = new BoxGeometry(1, 0.35, 0.35);
    const material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false });
    this.mesh = new InstancedMesh(geometry, material, MAX_ROUNDS);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    for (let i = 0; i < MAX_ROUNDS; i++) this.mesh.setColorAt(i, PLAYER_TRACER);
    scene.add(this.mesh);
  }

  update(world: World, playerId: EntityId, alpha: number, dt: number): void {
    let i = 0;
    for (const round of world.projectiles.values()) {
      if (i >= MAX_ROUNDS) break;
      const speed = Math.hypot(round.velocity.x, round.velocity.y);
      if (speed < 1) continue;
      // Rounds are stepped at 60 Hz; draw them slightly back along their path for interpolation.
      const back = (1 - alpha) * dt;
      this.position.set(round.position.x - round.velocity.x * back, 1, -(round.position.y - round.velocity.y * back));
      this.dir.set(round.velocity.x / speed, 0, -round.velocity.y / speed);
      this.rotation.setFromUnitVectors(this.axis, this.dir);
      const length = Math.min(14, speed * 0.022);
      this.scale.set(length, 1, 1);
      this.position.addScaledVector(this.dir, -length / 2);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, round.owner === playerId ? PLAYER_TRACER : PIRATE_TRACER);
      i++;
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}

interface BeamMesh {
  group: Group;
  core: Mesh;
  glow: Mesh;
}

/** Laser beams: a hot core and a soft glow, stretched between muzzle and impact. */
export class BeamRenderer {
  private readonly beams = new Map<string, BeamMesh>();
  private readonly geometry = new PlaneGeometry(1, 1);

  constructor(private readonly scene: Scene) {
    this.geometry.rotateX(-Math.PI / 2);
    this.geometry.translate(0.5, 0, 0);
  }

  update(world: World, time: number): { x: number; y: number }[] {
    const impacts: { x: number; y: number }[] = [];
    const active = new Set<string>();
    for (const [id, ship] of world.ships) {
      ship.weapons.forEach((mount, index) => {
        if (!mount.beam) return;
        const key = `${id}:${index}`;
        active.add(key);
        let beam = this.beams.get(key);
        if (!beam) {
          const group = new Group();
          const color = ship.faction === 'pirate' ? new Color(2.4, 0.4, 0.3) : new Color(0.5, 1.6, 2.6);
          const core = new Mesh(this.geometry, new MeshBasicMaterial({ color: new Color(2.5, 2.5, 2.5), transparent: true, blending: AdditiveBlending, depthWrite: false }));
          const glow = new Mesh(this.geometry, new MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false }));
          core.position.y = 1.2;
          glow.position.y = 1.1;
          group.add(glow, core);
          group.renderOrder = 6;
          this.scene.add(group);
          beam = { group, core, glow };
          this.beams.set(key, beam);
        }
        const { from, to } = mount.beam;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        beam.group.visible = true;
        beam.group.position.set(from.x, 0, -from.y);
        beam.group.rotation.y = Math.atan2(dy, dx);
        const flicker = 0.85 + Math.sin(time * 90 + index) * 0.15;
        beam.core.scale.set(length, 1, 0.3 * flicker);
        beam.glow.scale.set(length, 1, 1.5 * flicker);
        if (mount.beam.hit !== null) impacts.push({ ...to });
      });
    }
    for (const [key, beam] of this.beams) if (!active.has(key)) beam.group.visible = false;
    return impacts;
  }

  dispose(): void {
    for (const beam of this.beams.values()) {
      (beam.core.material as MeshBasicMaterial).dispose();
      (beam.glow.material as MeshBasicMaterial).dispose();
    }
    this.geometry.dispose();
  }
}

/** Fresnel shield bubble that flares where it is hit and fades with the shield's charge. */
export class ShieldBubble {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private flash = 0;

  constructor(length: number, color: Color) {
    this.material = new ShaderMaterial({
      uniforms: {
        uColor: { value: color },
        uFlash: { value: 0 },
        uCharge: { value: 1 },
        uImpact: { value: new Vector3(1, 0, 0) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vLocal;
        void main() {
          vLocal = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uFlash;
        uniform float uCharge;
        uniform vec3 uImpact;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vLocal;
        void main() {
          float fresnel = pow(1.0 - abs(dot(vNormal, vView)), 3.0);
          float spot = pow(max(dot(vLocal, uImpact), 0.0), 6.0);
          float idle = fresnel * 0.12 * uCharge;
          float hit = (fresnel * 0.6 + spot * 1.4) * uFlash;
          gl_FragColor = vec4(uColor * (idle + hit), 1.0);
        }`,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.mesh = new Mesh(new SphereGeometry(1, 32, 16), this.material);
    this.mesh.scale.set(length * 0.68, length * 0.3, length * 0.42);
    this.mesh.renderOrder = 7;
  }

  /** `impact` is the hit direction in the ship's local frame. */
  hit(impact: Vector3): void {
    this.flash = 1;
    (this.material.uniforms.uImpact.value as Vector3).copy(impact).normalize();
  }

  update(charge: number, dt: number): void {
    this.flash = Math.max(0, this.flash - dt * 3.5);
    this.material.uniforms.uFlash.value = this.flash;
    this.material.uniforms.uCharge.value = charge;
    this.mesh.visible = charge > 0.01 || this.flash > 0.01;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
