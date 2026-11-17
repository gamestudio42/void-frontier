import { Rng } from "@void-frontier/kernel";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Texture,
} from "three";
import type { Landmark } from "./landmarks.ts";

export interface PlanetLook {
  /** 0..1 hue of the main bands */
  hue: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  /** Rim colour of the atmosphere (CSS colour); derived from the hue when absent. */
  atmosphere?: string;
  /** 0..1 share of the sky covered by the cloud deck. */
  clouds?: number;
  /** A ring system, in planet radii. */
  rings?: { inner: number; outer: number; color: string };
}

const DEFAULT_LOOK: PlanetLook = {
  hue: 0.58,
  x: 9000,
  y: -12000,
  z: -9500,
  radius: 2300,
};

/** Smooth value noise on a wrapping lattice, so the texture meets itself at the seam. */
class Noise {
  private readonly values: Float32Array;
  constructor(
    rng: Rng,
    private readonly w: number,
    private readonly h: number,
  ) {
    this.values = new Float32Array(w * h);
    for (let i = 0; i < this.values.length; i++) this.values[i] = rng.next();
  }

  private at(x: number, y: number): number {
    const xi = ((x % this.w) + this.w) % this.w;
    const yi = Math.min(this.h - 1, Math.max(0, y));
    return this.values[yi * this.w + xi];
  }

  sample(x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = this.at(x0, y0) + (this.at(x0 + 1, y0) - this.at(x0, y0)) * sx;
    const b =
      this.at(x0, y0 + 1) +
      (this.at(x0 + 1, y0 + 1) - this.at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  }

  /** Four octaves, 0..1, `scale` lattice cells across the texture's width at the first. */
  fbm(u: number, v: number, scale: number): number {
    let sum = 0;
    let amp = 0.5;
    let freq = scale;
    for (let o = 0; o < 4; o++) {
      sum += amp * this.sample(u * freq, v * freq * 0.5);
      amp *= 0.5;
      freq *= 2;
    }
    return sum / 0.9375;
  }
}

const W = 1024;
const H = 512;

function canvas(): {
  el: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  image: ImageData;
} {
  const el = document.createElement("canvas");
  el.width = W;
  el.height = H;
  const ctx = el.getContext("2d")!;
  return { el, ctx, image: ctx.createImageData(W, H) };
}

function texture(el: HTMLCanvasElement, srgb: boolean): Texture {
  const t = new CanvasTexture(el);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Gas-giant bands: a latitude profile of a dozen colours, bent by turbulence that is
 * strongest between bands, with a few storm ovals. All from the seed, so a sector's planet
 * looks the same on every visit.
 */
function surface(rng: Rng, hue: number): Texture {
  const { el, ctx, image } = canvas();
  const noise = new Noise(rng, 64, 64);
  const bands = Array.from({ length: 14 }, () => {
    const shift = rng.next() < 0.25 ? 0.5 : rng.range(-0.05, 0.05);
    return new Color().setHSL(
      (hue + shift + 1) % 1,
      rng.range(0.18, 0.45),
      rng.range(0.16, 0.5),
    );
  });
  const storms = Array.from({ length: 3 + Math.floor(rng.next() * 3) }, () => ({
    u: rng.next(),
    v: rng.range(0.2, 0.8),
    rx: rng.range(0.02, 0.06),
    ry: rng.range(0.012, 0.03),
    light: rng.next() < 0.5,
  }));
  const c = new Color();
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      // Bands drift with latitude; the noise bends them into eddies.
      const warp = (noise.fbm(u, v, 6) - 0.5) * 0.08;
      const t = (v + warp) * (bands.length - 1);
      const i = Math.max(0, Math.min(bands.length - 2, Math.floor(t)));
      c.copy(bands[i]).lerp(bands[i + 1], t - i);
      const grain = 0.85 + noise.fbm(u + 0.37, v, 24) * 0.3;
      let r = c.r * grain;
      let g = c.g * grain;
      let b = c.b * grain;
      for (const s of storms) {
        let du = Math.abs(u - s.u);
        du = Math.min(du, 1 - du);
        const d = (du / s.rx) ** 2 + ((v - s.v) / s.ry) ** 2;
        if (d < 1) {
          const k = (1 - d) * 0.6;
          const tone = s.light ? 1.6 : 0.55;
          r += (r * tone - r) * k;
          g += (g * tone - g) * k;
          b += (b * tone - b) * k;
        }
      }
      // Darken toward the poles, where the bands thin out.
      const pole = 1 - Math.abs(v - 0.5) ** 3 * 4;
      const o = (y * W + x) * 4;
      image.data[o] = Math.min(255, r * pole * 255);
      image.data[o + 1] = Math.min(255, g * pole * 255);
      image.data[o + 2] = Math.min(255, b * pole * 255);
      image.data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return texture(el, true);
}

/** A cloud deck as an alpha map: high streaks that drift faster than the bands below. */
function cloudDeck(rng: Rng, coverage: number): Texture {
  const { el, ctx, image } = canvas();
  const noise = new Noise(rng, 64, 64);
  const threshold = 1 - coverage;
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const n = noise.fbm(u, v * 3, 8);
      const a = Math.max(0, Math.min(1, (n - threshold) * 4));
      const o = (y * W + x) * 4;
      image.data[o] = image.data[o + 1] = image.data[o + 2] = a * 255;
      image.data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return texture(el, false);
}

/** The atmosphere's rim: bright where the view grazes it, on the lit side only. */
function atmosphere(color: Color, sun: Vector3): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { color: { value: color }, sun: { value: sun } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform vec3 sun;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 4.0);
        float lit = smoothstep(-0.2, 0.5, dot(vNormal, normalize(sun)));
        gl_FragColor = vec4(color * rim * (0.04 + lit * 0.75), rim * 0.6);
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: FrontSide,
    fog: false,
  });
}

/** A ring system: soft concentric lanes with a gap or two, seen almost edge-on. */
function ringBand(rng: Rng, color: Color): Texture {
  const el = document.createElement("canvas");
  el.width = 512;
  el.height = 4;
  const ctx = el.getContext("2d")!;
  const gaps = [rng.range(0.25, 0.4), rng.range(0.6, 0.8)];
  for (let x = 0; x < 512; x++) {
    const t = x / 511;
    let a = 0.25 + 0.55 * Math.abs(Math.sin(t * 40 + rng.next() * 0.6));
    for (const g of gaps) if (Math.abs(t - g) < 0.025) a *= 0.1;
    a *= Math.min(1, t * 8) * Math.min(1, (1 - t) * 8);
    ctx.fillStyle = `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${a.toFixed(3)})`;
    ctx.fillRect(x, 0, 1, 4);
  }
  return texture(el, true);
}

/**
 * A gas giant far below the flight plane: banded surface, a drifting cloud deck, an
 * atmosphere that glows on its sunlit rim and, for some, rings. It is scenery: the scene's
 * scale and depth, never an obstacle.
 */
export function createPlanet(
  seed: number,
  look: PlanetLook = DEFAULT_LOOK,
  sunDirection = new Vector3(0.4, 1, 0.3),
): Landmark {
  const rng = new Rng(seed);
  const root = new Group();
  root.position.set(look.x, look.y, look.z);
  const tilt = new Group();
  // Tip the pole toward the camera so the bands read side-on instead of as rings.
  tilt.rotation.set(-1.15, 0, 0.3);
  root.add(tilt);

  const sphere = new SphereGeometry(1, 96, 48);
  const body = new Mesh(
    sphere,
    new MeshStandardMaterial({
      map: surface(rng, look.hue),
      roughness: 1,
      metalness: 0,
    }),
  );
  body.scale.setScalar(look.radius);
  tilt.add(body);

  const coverage = look.clouds ?? 0.35;
  let deck: Mesh | null = null;
  if (coverage > 0) {
    const alpha = cloudDeck(rng, coverage);
    deck = new Mesh(
      sphere,
      new MeshStandardMaterial({
        color: new Color().setHSL(look.hue, 0.18, 0.68),
        opacity: 0.85,
        alphaMap: alpha,
        transparent: true,
        depthWrite: false,
        roughness: 1,
        metalness: 0,
      }),
    );
    deck.scale.setScalar(look.radius * 1.008);
    tilt.add(deck);
  }

  const rim = new Color(
    look.atmosphere ??
      new Color().setHSL((look.hue + 0.02) % 1, 0.7, 0.62).getStyle(),
  );
  const air = new Mesh(
    sphere,
    atmosphere(rim, sunDirection.clone().normalize()),
  );
  air.scale.setScalar(look.radius * 1.05);
  root.add(air);

  let ring: Mesh | null = null;
  if (look.rings) {
    const geometry = new RingGeometry(
      look.rings.inner,
      look.rings.outer,
      160,
      1,
    );
    // Map the band texture along the radius, not around it.
    const uv = geometry.attributes.uv;
    const pos = geometry.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      uv.setXY(
        i,
        (r - look.rings.inner) / (look.rings.outer - look.rings.inner),
        0.5,
      );
    }
    ring = new Mesh(
      geometry,
      new MeshStandardMaterial({
        map: ringBand(rng, new Color(look.rings.color)),
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
        roughness: 1,
        metalness: 0,
      }),
    );
    ring.scale.setScalar(look.radius);
    ring.rotation.x = -Math.PI / 2 + 0.35;
    tilt.add(ring);
  }

  return {
    root,
    update(time: number) {
      body.rotation.y = time * 0.004;
      if (deck) deck.rotation.y = time * 0.007;
    },
    dispose() {
      sphere.dispose();
      for (const mesh of [body, deck, air, ring]) {
        if (!mesh) continue;
        const material = mesh.material as MeshStandardMaterial | ShaderMaterial;
        if ("map" in material && material.map) material.map.dispose();
        if ("alphaMap" in material && material.alphaMap)
          material.alphaMap.dispose();
        material.dispose();
      }
      ring?.geometry.dispose();
    },
  };
}
