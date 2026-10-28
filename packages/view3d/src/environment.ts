import { Rng } from '@void-frontier/kernel';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  type Vector3,
} from 'three';
import { PALETTE } from './palette.ts';

/** Far stars on a sphere that travels with the camera, so they never get closer. */
export function createStarfield(seed: number): Points {
  const rng = new Rng(seed);
  const count = 4000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const tint = new Color();
  for (let i = 0; i < count; i++) {
    const u = rng.range(-1, 1);
    const theta = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(1 - u * u);
    positions.set([r * Math.cos(theta) * 5000, u * 5000, r * Math.sin(theta) * 5000], i * 3);
    const warm = rng.next();
    tint.setHSL(warm < 0.2 ? 0.08 : 0.6, warm < 0.2 ? 0.6 : 0.3, rng.range(0.55, 0.95));
    colors.set([tint.r, tint.g, tint.b], i * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  const material = new PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -10;
  return points;
}

/**
 * Space dust around the ship. It is the main cue for speed: the points live in a box that
 * wraps around the focus point in the shader, so they look infinite at any distance.
 */
export class DustField {
  readonly points: Points;
  private readonly material: ShaderMaterial;
  static readonly SIZE = 900;

  constructor(seed: number) {
    const rng = new Rng(seed);
    const count = 2600;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions.set([rng.range(0, DustField.SIZE), rng.range(-90, 20), rng.range(0, DustField.SIZE)], i * 3);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    this.material = new ShaderMaterial({
      uniforms: { uFocus: { value: [0, 0, 0] }, uSize: { value: DustField.SIZE }, uFade: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform vec3 uFocus;
        uniform float uSize;
        varying float vFade;
        void main() {
          vec3 p = position;
          p.xz = mod(p.xz - uFocus.xz, uSize) - uSize * 0.5 + uFocus.xz;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float edge = 1.0 - smoothstep(uSize * 0.3, uSize * 0.5, length(p.xz - uFocus.xz));
          vFade = edge;
          gl_PointSize = clamp(420.0 / -mv.z, 1.5, 3.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vFade;
        uniform float uFade;
        void main() {
          if (uFade <= 0.0) discard;
          gl_FragColor = vec4(vec3(0.6, 0.68, 0.78) * vFade * uFade, 1.0);
        }`,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  /** Dust only reads up close; zoomed far out its box would show as a cloud, so it fades. */
  setFocus(focus: Vector3, cameraDistance = 0): void {
    this.material.uniforms.uFocus.value = [focus.x, focus.y, focus.z];
    this.material.uniforms.uFade.value = Math.max(0, Math.min(1, 1 - (cameraDistance - 260) / 220));
  }
}

/** Faint reference grid on the flight plane; it snaps to its own spacing to look endless. */
export class PlaneGrid {
  readonly lines: LineSegments;
  static readonly SPACING = 100;
  static readonly HALF = 15;

  constructor() {
    const span = PlaneGrid.SPACING * PlaneGrid.HALF;
    const vertices: number[] = [];
    for (let i = -PlaneGrid.HALF; i <= PlaneGrid.HALF; i++) {
      const o = i * PlaneGrid.SPACING;
      vertices.push(-span, 0, o, span, 0, o, o, 0, -span, o, 0, span);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
    const material = new LineBasicMaterial({ color: PALETTE.grid, transparent: true, opacity: 0.8, depthWrite: false });
    this.lines = new LineSegments(geometry, material);
    this.lines.position.y = -2;
  }

  setFocus(focus: Vector3): void {
    this.lines.position.x = Math.round(focus.x / PlaneGrid.SPACING) * PlaneGrid.SPACING;
    this.lines.position.z = Math.round(focus.z / PlaneGrid.SPACING) * PlaneGrid.SPACING;
  }
}

export interface PlanetLook {
  /** 0..1 hue of the main bands */
  hue: number;
  x: number;
  y: number;
  z: number;
  radius: number;
}

/** A banded gas giant far below the plane: a landmark that gives the scene depth and scale. */
export function createPlanet(seed: number, look: PlanetLook = { hue: 0.58, x: 9000, y: -12000, z: -9500, radius: 2300 }): Mesh {
  const rng = new Rng(seed);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  const h = Math.round(look.hue * 360);
  gradient.addColorStop(0, `hsl(${h}, 28%, 23%)`);
  gradient.addColorStop(1, `hsl(${h}, 30%, 14%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 70; i++) {
    const y = rng.range(0, 256);
    const h = rng.range(2, 14);
    const hue = rng.next() < 0.3 ? (h + 180) % 360 : h;
    ctx.fillStyle = `hsla(${hue}, ${rng.range(15, 40)}%, ${rng.range(25, 55)}%, ${rng.range(0.15, 0.45)})`;
    ctx.fillRect(0, y, 512, h);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const planet = new Mesh(new SphereGeometry(1, 64, 32), new MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 }));
  planet.scale.setScalar(look.radius);
  planet.position.set(look.x, look.y, look.z);
  // Tip the pole toward the camera so the bands read side-on instead of as rings.
  planet.rotation.set(-1.15, 0, 0.3);
  return planet;
}

/** Navigation beacon: a slim pylon with a pulsing ring, visible from far away. */
export function createBeacon(): { root: Group; update(time: number): void } {
  const root = new Group();
  const pylon = new Mesh(new CylinderGeometry(0.8, 1.6, 14, 8), new MeshStandardMaterial({ color: PALETTE.hullDark, metalness: 0.6, roughness: 0.5 }));
  root.add(pylon);
  const lamp = new Mesh(new SphereGeometry(1.8, 12, 8), new MeshBasicMaterial({ color: PALETTE.beacon }));
  lamp.position.y = 8;
  root.add(lamp);
  const ring = new Mesh(
    new TorusGeometry(10, 0.35, 6, 48),
    new MeshBasicMaterial({ color: PALETTE.beacon, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false }),
  );
  ring.rotation.x = Math.PI / 2;
  root.add(ring);
  return {
    root,
    update(time) {
      const pulse = (time * 0.6) % 1;
      ring.scale.setScalar(1 + pulse * 2.5);
      (ring.material as MeshBasicMaterial).opacity = 0.6 * (1 - pulse);
      (lamp.material as MeshBasicMaterial).color.setHex(Math.floor(time * 1.5) % 2 ? PALETTE.beacon : 0x2f6b4a);
    },
  };
}
