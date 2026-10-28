import type { ShipDefinition } from '@void-frontier/content';
import {
  AdditiveBlending,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  type Object3D,
} from 'three';
import type { ThrusterOutput } from '@void-frontier/simulation';
import { PALETTE } from './palette.ts';

/**
 * Procedural ships, built from boxes and cylinders so the look stays original and needs
 * no asset pipeline. The model's nose points along +X and its right side along +Z.
 */
export interface ShipModel {
  root: Group;
  update(output: ThrusterOutput, time: number): void;
  dispose(): void;
}

interface Plume {
  mesh: Mesh;
  length: number;
}

const hullMaterial = () => new MeshStandardMaterial({ color: PALETTE.hull, metalness: 0.55, roughness: 0.48 });
const darkMaterial = () => new MeshStandardMaterial({ color: PALETTE.hullDark, metalness: 0.6, roughness: 0.6 });
const accentMaterial = () => new MeshStandardMaterial({ color: PALETTE.hullAccent, metalness: 0.35, roughness: 0.55 });
const windowMaterial = () => new MeshStandardMaterial({ color: 0x0b1820, emissive: PALETTE.window, emissiveIntensity: 1.6 });

function box(w: number, h: number, d: number, material: MeshStandardMaterial, x = 0, y = 0, z = 0): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  return mesh;
}

/** A plume cone whose base sits at the nozzle and which grows in `direction` (unit axis). */
function plume(radius: number, length: number, color: number, axis: 'x' | 'z', sign: 1 | -1): Plume {
  const geometry = new ConeGeometry(radius, 1, 12, 1, true);
  // Base at the origin (the nozzle), apex one unit out along +Y; scale.y sets the length.
  geometry.translate(0, 0.5, 0);
  const material = new MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const mesh = new Mesh(geometry, material);
  if (axis === 'x') mesh.rotation.z = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
  else mesh.rotation.x = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
  mesh.visible = false;
  return { mesh, length };
}

function place(parent: Object3D, p: Plume, x: number, y: number, z: number): Plume {
  p.mesh.position.set(x, y, z);
  parent.add(p.mesh);
  return p;
}

export function buildShipModel(definition: ShipDefinition): ShipModel {
  const L = definition.hull.length;
  const hauler = definition.class === 'hauler';
  const W = hauler ? L * 0.42 : L * 0.34;
  const root = new Group();
  const hull = hullMaterial();
  const dark = darkMaterial();
  const accent = accentMaterial();
  const glass = windowMaterial();

  // Spine and cockpit.
  root.add(box(L * 0.78, L * 0.12, W * 0.38, hull, -L * 0.04));
  root.add(box(L * 0.2, L * 0.1, W * 0.3, dark, L * 0.4, 0.01 * L));
  root.add(box(L * 0.05, L * 0.03, W * 0.24, glass, L * 0.47, L * 0.06));
  root.add(box(L * 0.18, L * 0.02, W * 0.4, accent, L * 0.15, L * 0.065));

  // Side pods with radiators.
  for (const side of [-1, 1]) {
    root.add(box(L * 0.5, L * 0.09, W * 0.16, dark, -L * 0.14, -0.01 * L, side * W * 0.38));
    root.add(box(L * 0.3, L * 0.01, W * 0.28, hull, -L * 0.05, 0.02 * L, side * W * 0.58));
    root.add(box(L * 0.04, L * 0.04, W * 0.06, glass, L * 0.08, 0, side * W * 0.47));
  }

  // Cargo racks make the hauler read as a working ship at a glance.
  if (hauler) {
    for (let i = 0; i < 3; i++) {
      const x = -L * 0.2 + i * L * 0.16;
      for (const side of [-1, 1]) root.add(box(L * 0.13, L * 0.1, W * 0.2, i % 2 ? accent : hull, x, L * 0.02, side * W * 0.2));
    }
  }

  // Antenna mast.
  const mast = new Mesh(new CylinderGeometry(L * 0.006, L * 0.006, L * 0.16, 6), dark);
  mast.position.set(L * 0.05, L * 0.12, -W * 0.12);
  root.add(mast);

  // Main engines at the tail.
  const tail = -L * 0.45;
  const nozzleRadius = L * 0.055;
  const mains: Plume[] = [];
  for (const side of [-1, 1]) {
    const nozzle = new Mesh(new CylinderGeometry(nozzleRadius * 0.8, nozzleRadius, L * 0.08, 12, 1, true), dark);
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(tail, 0, side * W * 0.2);
    root.add(nozzle);
    const core = new Mesh(new CylinderGeometry(nozzleRadius * 0.7, nozzleRadius * 0.7, L * 0.01, 12), new MeshBasicMaterial({ color: PALETTE.engineCore }));
    core.rotation.z = Math.PI / 2;
    core.position.set(tail + L * 0.03, 0, side * W * 0.2);
    root.add(core);
    mains.push(place(root, plume(nozzleRadius * 0.9, L * 0.9, PALETTE.enginePlume, 'x', -1), tail - L * 0.04, 0, side * W * 0.2));
  }
  const engineLight = new PointLight(PALETTE.enginePlume, 0, L * 4, 2);
  engineLight.position.set(tail - L * 0.3, L * 0.1, 0);
  root.add(engineLight);

  // Reaction-control thrusters: small plumes on the nose, tail and flanks.
  const rcs = L * 0.018;
  const rcsLen = L * 0.22;
  const reverse = [-1, 1].map((side) => place(root, plume(rcs, rcsLen, PALETTE.rcsPlume, 'x', 1), L * 0.32, 0, side * W * 0.22));
  const pushRight = [-0.25, 0.25].map((x) => place(root, plume(rcs, rcsLen, PALETTE.rcsPlume, 'z', -1), x * L, 0, -W * 0.48));
  const pushLeft = [-0.25, 0.25].map((x) => place(root, plume(rcs, rcsLen, PALETTE.rcsPlume, 'z', 1), x * L, 0, W * 0.48));
  // Counter-clockwise from above: nose pushed toward -Z, tail toward +Z.
  const ccw = [place(root, plume(rcs, rcsLen, PALETTE.rcsPlume, 'z', 1), L * 0.42, 0, W * 0.2), place(root, plume(rcs, rcsLen, PALETTE.rcsPlume, 'z', -1), -L * 0.38, 0, -W * 0.48)];
  const cw = [place(root, plume(rcs, rcsLen, PALETTE.rcsPlume, 'z', -1), L * 0.42, 0, -W * 0.2), place(root, plume(rcs, rcsLen, PALETTE.rcsPlume, 'z', 1), -L * 0.38, 0, W * 0.48)];

  const drive = (plumes: Plume[], throttle: number, flicker: number) => {
    for (const p of plumes) {
      const on = throttle > 0.02;
      p.mesh.visible = on;
      if (on) p.mesh.scale.set(1, p.length * throttle * flicker, 1);
    }
  };

  return {
    root,
    update(output, time) {
      const flicker = 0.9 + 0.1 * Math.sin(time * 61) * Math.sin(time * 23);
      const mainLength = output.main * (output.boosting ? 1.5 : 1);
      drive(mains, mainLength, flicker);
      for (const p of mains) (p.mesh.material as MeshBasicMaterial).color.setHex(output.boosting ? PALETTE.boostPlume : PALETTE.enginePlume);
      engineLight.intensity = output.main * (output.boosting ? 90 : 50) * flicker;
      engineLight.color.setHex(output.boosting ? PALETTE.boostPlume : PALETTE.enginePlume);
      drive(reverse, output.reverse, flicker);
      drive(pushRight, Math.max(0, output.lateral), flicker);
      drive(pushLeft, Math.max(0, -output.lateral), flicker);
      drive(ccw, Math.max(0, output.rotation), flicker);
      drive(cw, Math.max(0, -output.rotation), flicker);
    },
    dispose() {
      root.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          (object.material as MeshStandardMaterial).dispose();
        }
      });
    },
  };
}
