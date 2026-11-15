import { getUpgrade, upgradeFamily, upgradeTier, type AbilityKind } from '@void-frontier/content';
import { Box3, BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, TorusGeometry, type Object3D } from 'three';

/**
 * Verb modules seen on the hull: afterburner nozzles at the stern, chaff launchers on
 * the back, an EMP coil on the spine. Each tier is bigger and carries its own colour
 * (Mk I blue, Mk II green, Mk III amber, as in the outfitting panel), and the glow is
 * bright while the verb is ready and dim while it recharges.
 *
 * Parts are placed against the hull's own bounds, so they sit on authored and boxed
 * ships alike. Model space: nose +X, right +Z, up +Y.
 */
export interface ModuleKit {
  root: Group;
  /** `ready` says which verbs can fire now. */
  update(ready: ReadonlySet<AbilityKind>, time: number): void;
  dispose(): void;
}

const TIER_COLORS = [0x6fd3ff, 0x7dffb2, 0xffb347];

/** The verb modules among `upgrades`, as the kit draws them. */
export function kitModules(upgrades: readonly string[]): { kind: AbilityKind; tier: number; family: string }[] {
  const out: { kind: AbilityKind; tier: number; family: string }[] = [];
  for (const id of upgrades) {
    const ability = getUpgrade(id).ability;
    if (ability) out.push({ kind: ability.kind, tier: upgradeTier(id), family: upgradeFamily(id) });
  }
  return out;
}

/** The hull's bounds in its own model space, whatever its current place in the scene. */
function localBounds(hull: Object3D): Box3 {
  const position = hull.position.clone();
  const rotation = hull.rotation.clone();
  hull.position.set(0, 0, 0);
  hull.rotation.set(0, 0, 0);
  hull.updateMatrixWorld(true);
  // Only lit hull surfaces count: plumes, the shield bubble and glows would swell it.
  const box = new Box3();
  hull.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh && mesh.material instanceof MeshStandardMaterial && object.name !== 'module-kit') box.expandByObject(mesh);
  });
  if (box.isEmpty()) box.setFromObject(hull);
  hull.position.copy(position);
  hull.rotation.copy(rotation);
  hull.updateMatrixWorld(true);
  return box;
}

export function buildModuleKit(hull: Object3D, length: number, upgrades: readonly string[]): ModuleKit {
  const root = new Group();
  root.name = 'module-kit';
  const modules = kitModules(upgrades);
  const box = localBounds(hull);
  const L = length;
  const halfWidth = Math.max(L * 0.12, Math.min(-box.min.z, box.max.z));
  const top = box.max.y;
  const stern = box.min.x;
  const metal = new MeshStandardMaterial({ color: 0x3a4148, metalness: 0.7, roughness: 0.45 });
  const glows: { kind: AbilityKind; material: MeshStandardMaterial }[] = [];
  const spinners: Mesh[] = [];
  const disposables: { dispose(): void }[] = [metal];

  const glowFor = (kind: AbilityKind, tier: number) => {
    const material = new MeshStandardMaterial({ color: 0x111418, emissive: TIER_COLORS[tier - 1], emissiveIntensity: 2 });
    glows.push({ kind, material });
    disposables.push(material);
    return material;
  };
  const add = (geometry: BoxGeometry | CylinderGeometry | TorusGeometry, material: MeshStandardMaterial, x: number, y: number, z: number) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    disposables.push(geometry);
    root.add(mesh);
    return mesh;
  };

  for (const m of modules) {
    const glow = glowFor(m.kind, m.tier);
    if (m.kind === 'dash') {
      // Burner cans either side of the main engine; Mk III adds a third under the keel.
      const radius = L * (0.035 + 0.01 * m.tier);
      const can = L * (0.1 + 0.02 * m.tier);
      const spots = m.tier === 3 ? [-0.55, 0.55, 0] : [-0.55, 0.55];
      for (const side of spots) {
        const y = side === 0 ? box.min.y + radius : (top + box.min.y) / 2;
        const shell = add(new CylinderGeometry(radius, radius * 1.25, can, 14), metal, stern + can * 0.35, y, side * halfWidth);
        shell.rotation.z = Math.PI / 2;
        const throat = add(new CylinderGeometry(radius * 0.8, radius * 0.8, can * 0.08, 14), glow, stern - can * 0.13, y, side * halfWidth);
        throat.rotation.z = Math.PI / 2;
      }
    } else if (m.kind === 'chaff') {
      // Rows of launch tubes on the back, two more per tier.
      const tubes = 2 * m.tier;
      const tube = L * 0.065;
      for (let i = 0; i < tubes; i++) {
        const side = i % 2 ? 1 : -1;
        const row = Math.floor(i / 2);
        const x = stern + L * (0.22 + row * 0.07);
        const z = side * halfWidth * 0.55;
        const body = add(new BoxGeometry(tube, tube * 0.5, tube * 0.5), metal, x, top + tube * 0.2, z);
        body.rotation.z = 0.5;
        add(new BoxGeometry(tube * 0.12, tube * 0.42, tube * 0.42), glow, x + tube * 0.45, top + tube * 0.42, z);
      }
    } else {
      // A coil on the spine; each tier adds a ring and widens the outer one.
      const radius = L * (0.07 + 0.025 * m.tier);
      const x = (box.min.x + box.max.x) / 2 - L * 0.05;
      add(new CylinderGeometry(L * 0.02, L * 0.03, L * 0.05, 10), metal, x, top + L * 0.02, 0);
      for (let r = 0; r < m.tier; r++) {
        const ring = add(new TorusGeometry(radius * (1 - r * 0.28), L * 0.006, 8, 32), glow, x, top + L * (0.05 + r * 0.025), 0);
        ring.rotation.x = Math.PI / 2;
        spinners.push(ring);
      }
    }
  }
  hull.add(root);

  return {
    root,
    update(ready, time) {
      for (const g of glows) {
        const on = ready.has(g.kind);
        // Ready: a slow breath at full glow. Charging: a dim ember.
        // The coil is a lot of glowing surface: kept softer so the bloom does not swallow the hull.
        const scale = g.kind === 'emp' ? 0.45 : 1;
        g.material.emissiveIntensity = (on ? 1.8 + 0.6 * Math.sin(time * 3) : 0.25) * scale;
      }
      for (let i = 0; i < spinners.length; i++) spinners[i].rotation.z = time * (0.6 + i * 0.4);
    },
    dispose() {
      hull.remove(root);
      for (const d of disposables) d.dispose();
    },
  };
}
