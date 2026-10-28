import { AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Points, ShaderMaterial } from 'three';

/**
 * One pooled additive particle system for exhaust, sparks and explosions. Particles are
 * cosmetic: they live in scene space and never touch the simulation.
 */
export class ParticleSystem {
  readonly points: Points;
  private readonly position: Float32Array;
  private readonly velocity: Float32Array;
  private readonly color: Float32Array;
  private readonly startColor: Float32Array;
  private readonly endColor: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly drag: Float32Array;
  private cursor = 0;

  constructor(private readonly capacity = 6000) {
    this.position = new Float32Array(capacity * 3);
    this.velocity = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 3);
    this.startColor = new Float32Array(capacity * 3);
    this.endColor = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    const geometry = new BufferGeometry();
    const attr = (array: Float32Array, size: number) => {
      const a = new BufferAttribute(array, size);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    geometry.setAttribute('position', attr(this.position, 3));
    geometry.setAttribute('color', attr(this.color, 3));
    geometry.setAttribute('size', attr(this.size, 1));
    geometry.setAttribute('alpha', attr(this.alpha, 1));
    const material = new ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float alpha;
        attribute vec3 color;
        uniform float uScale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = alpha > 0.0 ? size * uScale / -mv.z : 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float d = dot(p, p);
          if (d > 1.0) discard;
          float falloff = exp(-d * 3.0);
          gl_FragColor = vec4(vColor * falloff * vAlpha, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  /** Viewport height in pixels; keeps particle size consistent across resolutions. */
  setScale(viewportHeight: number): void {
    (this.points.material as ShaderMaterial).uniforms.uScale.value = viewportHeight * 0.9;
  }

  emit(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    start: { r: number; g: number; b: number },
    end: { r: number; g: number; b: number },
    size: number,
    life: number,
    drag = 0,
  ): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const i3 = i * 3;
    this.position[i3] = x;
    this.position[i3 + 1] = y;
    this.position[i3 + 2] = z;
    this.velocity[i3] = vx;
    this.velocity[i3 + 1] = vy;
    this.velocity[i3 + 2] = vz;
    this.startColor[i3] = start.r;
    this.startColor[i3 + 1] = start.g;
    this.startColor[i3 + 2] = start.b;
    this.endColor[i3] = end.r;
    this.endColor[i3 + 1] = end.g;
    this.endColor[i3 + 2] = end.b;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = drag;
  }

  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      const i3 = i * 3;
      const damping = this.drag[i] > 0 ? Math.exp(-this.drag[i] * dt) : 1;
      for (let k = 0; k < 3; k++) {
        this.velocity[i3 + k] *= damping;
        this.position[i3 + k] += this.velocity[i3 + k] * dt;
        this.color[i3 + k] = this.endColor[i3 + k] + (this.startColor[i3 + k] - this.endColor[i3 + k]) * t;
      }
      this.alpha[i] = t * t * (3 - 2 * t);
    }
    const geometry = this.points.geometry;
    for (const name of ['position', 'color', 'alpha', 'size']) (geometry.getAttribute(name) as BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as ShaderMaterial).dispose();
  }
}
