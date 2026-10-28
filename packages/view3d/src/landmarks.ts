import { getShip } from '@void-frontier/content';
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  type Material,
} from 'three';
import { buildShipModel } from './shipModel.ts';

export interface Landmark {
  root: Group;
  update(time: number): void;
  dispose(): void;
}

const disposeAll = (root: Group, materials: Material[]) => () => {
  root.traverse((o) => {
    if (o instanceof Mesh) o.geometry.dispose();
  });
  for (const m of materials) m.dispose();
};

/** Jump gate: a heavy ring with chasing lights and a shimmering field across the opening. */
export function createGate(): Landmark {
  const root = new Group();
  const frame = new MeshStandardMaterial({ color: 0x4d555e, metalness: 0.7, roughness: 0.4 });
  const field = new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        float swirl = sin(a * 6.0 + r * 18.0 - uTime * 3.0) * 0.5 + 0.5;
        float glow = smoothstep(1.0, 0.2, r);
        vec3 col = mix(vec3(0.1, 0.5, 1.2), vec3(0.6, 1.4, 1.6), swirl) * glow * (0.35 + 0.25 * swirl);
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const ring = new Mesh(new TorusGeometry(45, 5, 16, 96), frame);
  ring.rotation.x = Math.PI / 2;
  root.add(ring);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const pylon = new Mesh(new BoxGeometry(8, 14, 8), frame);
    pylon.position.set(Math.cos(a) * 45, 0, Math.sin(a) * 45);
    root.add(pylon);
  }
  const disc = new Mesh(new RingGeometry(0, 41, 64), field);
  disc.rotation.x = -Math.PI / 2;
  root.add(disc);
  const lights: Mesh[] = [];
  const lightMat = new MeshBasicMaterial({ color: new Color(0.6, 1.6, 2.2) });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const lamp = new Mesh(new SphereGeometry(1.4, 8, 6), lightMat.clone());
    lamp.position.set(Math.cos(a) * 45, 5.5, Math.sin(a) * 45);
    root.add(lamp);
    lights.push(lamp);
  }
  const glow = new PointLight(0x6fd3ff, 3000, 260, 2);
  glow.position.y = 30;
  root.add(glow);
  return {
    root,
    update(time) {
      field.uniforms.uTime.value = time;
      lights.forEach((lamp, i) => {
        const phase = ((time * 1.5 + i / 24) % 1) < 0.12 ? 1 : 0.15;
        (lamp.material as MeshBasicMaterial).color.setRGB(0.6 * phase, 1.6 * phase, 2.2 * phase);
      });
    },
    dispose: disposeAll(root, [frame, field, lightMat, ...lights.map((l) => l.material as Material)]),
  };
}

/** Gravity well: a dark core inside a slowly turning accretion swirl. */
export function createWell(radius: number): Landmark {
  const root = new Group();
  const material = new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float a = atan(p.y, p.x);
        float arms = sin(a * 3.0 - log(r + 0.02) * 6.0 + uTime * 0.6) * 0.5 + 0.5;
        float band = smoothstep(0.08, 0.25, r) * (1.0 - smoothstep(0.4, 1.0, r));
        vec3 col = mix(vec3(0.08, 0.02, 0.16), vec3(0.55, 0.22, 0.75), arms) * band * (0.12 + arms * 0.28);
        col += vec3(1.0, 0.7, 1.4) * smoothstep(0.03, 0.0, abs(r - 0.1)) * 0.7;
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const disc = new Mesh(new RingGeometry(0, radius, 128), material);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -8;
  root.add(disc);
  const core = new Mesh(new SphereGeometry(radius * 0.06, 32, 16), new MeshBasicMaterial({ color: 0x000000 }));
  root.add(core);
  const light = new PointLight(0xc77dff, 2500, radius * 1.2, 2);
  light.position.y = 60;
  root.add(light);
  return {
    root,
    update(time) {
      material.uniforms.uTime.value = time;
    },
    dispose: disposeAll(root, [material, core.material as Material]),
  };
}

/** Derelict: a dark, dead hull drifting at an angle, with one failing light. */
export function createDerelict(): Landmark {
  const model = buildShipModel(getShip('mule'), 'pirate');
  const root = new Group();
  model.root.scale.setScalar(1.6);
  model.root.rotation.set(0.25, 0.8, 0.4);
  root.add(model.root);
  const beacon = new Mesh(new SphereGeometry(1.6, 8, 6), new MeshBasicMaterial({ color: 0xffb347 }));
  beacon.position.set(6, 12, 0);
  root.add(beacon);
  return {
    root,
    update(time) {
      beacon.visible = Math.sin(time * 2.3) * Math.sin(time * 7.1) > 0.3;
    },
    dispose: () => {
      model.dispose();
      (beacon.material as Material).dispose();
      beacon.geometry.dispose();
    },
  };
}

/** Smugglers' cache: lashed-together containers. */
export function createCache(): Landmark {
  const root = new Group();
  const colours = [0x6b4d2a, 0x3d4a55, 0x7a2f22];
  const materials = colours.map((c) => new MeshStandardMaterial({ color: c, metalness: 0.4, roughness: 0.6 }));
  for (let i = 0; i < 7; i++) {
    const box = new Mesh(new BoxGeometry(9, 5, 4.5), materials[i % 3]);
    box.position.set((i % 3) * 9.5 - 9, Math.floor(i / 3) * 5.2 - 2, (i % 2) * 4 - 2);
    box.rotation.y = (i * 0.37) % 0.4;
    root.add(box);
  }
  return { root, update: () => undefined, dispose: disposeAll(root, materials) };
}
