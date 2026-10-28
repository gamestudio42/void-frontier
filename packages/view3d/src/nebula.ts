import { BackSide, Mesh, ShaderMaterial, SphereGeometry } from 'three';

/**
 * Procedural nebula on an inside-out sphere that travels with the camera. Colours stay
 * dim so stars and ships remain the brightest things on screen.
 */
export function createNebula(seed: number): Mesh {
  const material = new ShaderMaterial({
    uniforms: { uSeed: { value: (seed % 1000) * 0.137 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uSeed;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7)) + uSeed) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 6; i++) { s += noise(p) * a; p *= 2.07; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float warp = fbm(d * 2.2 + vec3(uSeed));
        float cloud = fbm(d * 3.1 + warp * 1.6);
        float wisps = smoothstep(0.45, 0.85, fbm(d * 6.0 - warp));
        float band = exp(-pow(d.y + 0.15 + (warp - 0.5) * 0.6, 2.0) * 5.0);
        vec3 deep = vec3(0.010, 0.014, 0.032);
        vec3 teal = vec3(0.020, 0.075, 0.095);
        vec3 violet = vec3(0.060, 0.030, 0.090);
        vec3 amber = vec3(0.150, 0.070, 0.025);
        vec3 col = deep;
        col = mix(col, teal, smoothstep(0.35, 0.75, cloud) * band);
        col = mix(col, violet, smoothstep(0.5, 0.9, warp) * 0.8);
        col += amber * wisps * band * 0.9;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new Mesh(new SphereGeometry(9000, 48, 24), material);
  mesh.renderOrder = -20;
  mesh.frustumCulled = false;
  return mesh;
}
