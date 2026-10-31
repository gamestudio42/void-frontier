import { Rng } from '@void-frontier/kernel';
import { Group, InstancedMesh, BoxGeometry, Color, CylinderGeometry, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, TorusGeometry, Vector3, type Material } from 'three';
import type { Landmark } from './landmarks.ts';

/** How far below the flight plane giants float: close enough for parallax, too low to touch. */
const DEPTH = -420;

/** A grid of boxes as one mesh, so a structure the size of a sector costs one draw call. */
function plates(rng: Rng, material: Material, count: number, place: (i: number) => { x: number; y: number; z: number; sx: number; sy: number; sz: number }): InstancedMesh {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, count);
  const m = new Matrix4();
  const q = new Quaternion();
  for (let i = 0; i < count; i++) {
    const p = place(i);
    m.compose(new Vector3(p.x, p.y, p.z), q, new Vector3(p.sx, p.sy, p.sz));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, new Color().setScalar(rng.range(0.55, 1)));
  }
  return mesh;
}

/** Scattered lit windows, the cue that makes something huge read as huge. */
function lights(rng: Rng, color: number, count: number, length: number, width: number, height: number): InstancedMesh {
  const material = new MeshBasicMaterial({ color });
  const mesh = new InstancedMesh(new BoxGeometry(2.4, 0.8, 2.4), material, count);
  const m = new Matrix4();
  const q = new Quaternion();
  for (let i = 0; i < count; i++) {
    m.compose(new Vector3(rng.range(-length / 2, length / 2), height, rng.range(-width / 2, width / 2)), q, new Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
  }
  return mesh;
}

/** A dead capital ship: a long broken spine with plating missing along its back. */
function hulk(root: Group, rng: Rng, hull: Material): void {
  const length = 1100;
  root.add(plates(rng, hull, 46, (i) => {
    const t = i / 46;
    // Gaps in the plating: the hull has been stripped for decades.
    const broken = rng.next() < 0.22;
    return { x: (t - 0.5) * length, y: broken ? -40 : rng.range(0, 24), z: rng.range(-30, 30), sx: length / 46 - 2, sy: rng.range(20, 60), sz: rng.range(90, 180) * (broken ? 0.5 : 1) };
  }));
  root.add(plates(rng, hull, 18, () => ({ x: rng.range(-length / 2, length / 2), y: rng.range(30, 60), z: rng.range(-90, 90), sx: rng.range(30, 90), sy: rng.range(10, 30), sz: rng.range(12, 40) })));
  root.add(lights(rng, 0xff8a4a, 14, length * 0.8, 150, 62));
}

/** A habitat ring on spokes: slow, inhabited, and lit. */
function ring(root: Group, rng: Rng, hull: Material): void {
  const torus = new Mesh(new TorusGeometry(620, 42, 10, 64), hull);
  torus.rotation.x = Math.PI / 2;
  root.add(torus);
  root.add(new Mesh(new CylinderGeometry(120, 150, 90, 16), hull));
  root.add(plates(rng, hull, 6, (i) => {
    const a = (i / 6) * Math.PI;
    return { x: 0, y: 0, z: 0, sx: Math.abs(Math.cos(a)) * 1240 + 30, sy: 18, sz: Math.abs(Math.sin(a)) * 1240 + 30 };
  }));
  const windows = new InstancedMesh(new BoxGeometry(4, 1, 4), new MeshBasicMaterial({ color: 0xbfe6ff }), 90);
  const m = new Matrix4();
  const q = new Quaternion();
  for (let i = 0; i < 90; i++) {
    const a = rng.range(0, Math.PI * 2);
    m.compose(new Vector3(Math.cos(a) * 620, 44, Math.sin(a) * 620), q, new Vector3(1, 1, 1));
    windows.setMatrixAt(i, m);
  }
  root.add(windows);
}

/** A refinery spindle: stacked tanks and pipes, with furnace light between them. */
function spindle(root: Group, rng: Rng, hull: Material): void {
  for (let i = 0; i < 7; i++) {
    const tank = new Mesh(new CylinderGeometry(70 + (i % 2) * 34, 70 + (i % 2) * 34, 90, 14), hull);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(-480 + i * 160, 0, 0);
    root.add(tank);
  }
  root.add(plates(rng, hull, 24, () => ({ x: rng.range(-560, 560), y: rng.range(-20, 50), z: rng.range(-170, 170), sx: rng.range(50, 160), sy: rng.range(8, 24), sz: rng.range(8, 24) })));
  root.add(lights(rng, 0xffb347, 22, 1000, 200, 72));
}

const BUILDERS = { hulk, ring, spindle };

/** A structure far larger than any ship, below the flight plane: scenery, never an obstacle. */
export function createGiant(kind: keyof typeof BUILDERS, seed: number, scale: number, angle: number): Landmark {
  const root = new Group();
  const hull = new MeshStandardMaterial({ color: kind === 'hulk' ? 0x767c84 : 0x8a919a, metalness: 0.35, roughness: 0.7, emissive: 0x161b22 });
  BUILDERS[kind](root, new Rng(seed), hull);
  root.scale.setScalar(scale);
  root.rotation.y = angle;
  root.position.y = DEPTH;
  const spin = kind === 'ring' ? 0.01 : 0;
  return {
    root,
    update(time: number) {
      if (spin) root.rotation.y = angle + time * spin;
    },
    dispose() {
      root.traverse((o) => {
        if (o instanceof Mesh || o instanceof InstancedMesh) o.geometry.dispose();
      });
      hull.dispose();
    },
  };
}
