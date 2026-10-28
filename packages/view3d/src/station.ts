import type { StationDefinition, StationModule } from '@void-frontier/content';
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hazardTexture, platingTexture, solarTexture, windowsTexture } from './textures.ts';

/**
 * Builds a station from its data layout, so what you see is what you collide with.
 * Station-local (x, y) maps to (x, height, -y) in the group.
 */
export interface StationModel {
  root: Group;
  update(time: number): void;
  dispose(): void;
}

interface Blinker {
  mesh: Mesh;
  on: number;
  off: number;
  period: number;
  phase: number;
}

export function buildStationModel(definition: StationDefinition, seed: number): StationModel {
  const pirate = definition.faction === 'pirate';
  const root = new Group();
  const plating = platingTexture(seed);
  const darkPlating = platingTexture(seed + 1, '#4a5058');
  const hull = new MeshStandardMaterial({ color: pirate ? 0x6b6460 : 0xd2d6db, map: plating, metalness: 0.55, roughness: 0.5 });
  const dark = new MeshStandardMaterial({ color: 0xffffff, map: darkPlating, metalness: 0.65, roughness: 0.55 });
  const accent = new MeshStandardMaterial({ color: pirate ? 0xa2271e : 0xc8892c, metalness: 0.3, roughness: 0.55 });
  const strut = new MeshStandardMaterial({ color: 0x5b6168, metalness: 0.7, roughness: 0.45 });
  const solar = new MeshStandardMaterial({ map: solarTexture(), metalness: 0.7, roughness: 0.25, color: 0xffffff });
  const hazard = new MeshStandardMaterial({ map: hazardTexture(), metalness: 0.3, roughness: 0.6 });
  const materials: Material[] = [hull, dark, accent, strut, solar, hazard];
  const blinkers: Blinker[] = [];
  const chase: Mesh[] = [];

  const add = (geometry: BufferGeometry, material: Material, x: number, h: number, y: number): Mesh => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, h, -y);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };

  const lamp = (x: number, h: number, y: number, color: number, size: number): Mesh => {
    const material = new MeshBasicMaterial({ color });
    materials.push(material);
    const mesh = new Mesh(new SphereGeometry(size, 10, 8), material);
    mesh.position.set(x, h, -y);
    root.add(mesh);
    return mesh;
  };

  const blinker = (x: number, h: number, y: number, color: number, period: number, phase: number, size = 1.6) => {
    blinkers.push({ mesh: lamp(x, h, y, color, size), on: color, off: new Color(color).multiplyScalar(0.12).getHex(), period, phase });
  };

  for (const module of definition.modules) build(module);

  function build(module: StationModule): void {
    switch (module.kind) {
      case 'core': {
        const { x, y, r } = module;
        const windows = windowsTexture(seed + 7, 64, 8);
        const band = new MeshStandardMaterial({ map: plating, color: 0xc3c8ce, metalness: 0.5, roughness: 0.5, emissive: 0xffffff, emissiveMap: windows, emissiveIntensity: 1.4 });
        materials.push(band);
        add(new CylinderGeometry(r, r, r * 0.55, 64), band, x, 0, y);
        add(new CylinderGeometry(r * 0.82, r, r * 0.25, 64), hull, x, r * 0.4, y);
        add(new CylinderGeometry(r * 0.55, r * 0.82, r * 0.3, 48), dark, x, r * 0.67, y);
        add(new SphereGeometry(r * 0.55, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), hull, x, r * 0.82, y);
        add(new CylinderGeometry(r, r * 0.7, r * 0.35, 64), dark, x, -r * 0.45, y);
        const rib = new TorusGeometry(r * 1.02, r * 0.035, 8, 64);
        rib.rotateX(Math.PI / 2);
        add(rib, accent, x, r * 0.28, y);
        add(rib.clone(), accent, x, -r * 0.28, y);
        // Antenna farm on the dome.
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.4;
          add(new CylinderGeometry(0.5, 0.8, r * 0.7, 6), strut, x + Math.cos(a) * r * 0.3, r * 1.25, y + Math.sin(a) * r * 0.3);
        }
        const dish = new SphereGeometry(r * 0.22, 24, 8, 0, Math.PI * 2, 0, Math.PI / 3);
        add(dish, hull, x + r * 0.15, r * 1.05, y - r * 0.2).rotation.set(0.6, 0, 0.4);
        blinker(x, r * 1.62, y, 0xffffff, 1.4, 0, 2.2);
        const glow = new PointLight(0xffd8a8, 900, r * 6, 2);
        glow.position.set(x, r * 1.2, -y);
        root.add(glow);
        break;
      }
      case 'ring': {
        const torus = new TorusGeometry(module.r, module.thickness * 0.4, 18, 160);
        torus.rotateX(Math.PI / 2);
        const windows = windowsTexture(seed + 11, 160, 6);
        windows.repeat.set(1, 1);
        const ringMaterial = new MeshStandardMaterial({ map: plating, color: 0xcfd3d8, metalness: 0.5, roughness: 0.5, emissive: 0xffffff, emissiveMap: windows, emissiveIntensity: 1.2 });
        materials.push(ringMaterial);
        add(torus, ringMaterial, 0, 0, 0);
        const habitats: BufferGeometry[] = [];
        const count = 16;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          const box = new BoxGeometry(module.thickness * 1.25, module.thickness * 0.9, module.thickness * 2.2);
          box.rotateY(-a);
          box.translate(Math.cos(a) * module.r, 0, -Math.sin(a) * module.r);
          habitats.push(box);
        }
        add(mergeGeometries(habitats), dark, 0, 0, 0);
        break;
      }
      case 'truss':
      case 'panel': {
        const [x0, y0] = module.from;
        const [x1, y1] = module.to;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const length = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const parts: BufferGeometry[] = [];
        const place = (geometry: BufferGeometry, along: number, side: number, h: number) => {
          geometry.translate(along, h, -side);
          geometry.rotateY(angle);
          geometry.translate(x0, 0, -y0);
          parts.push(geometry);
        };
        if (module.kind === 'truss') {
          const w = module.width;
          const rail = Math.max(0.6, w * 0.08);
          for (const side of [-1, 1]) {
            for (const h of [-1, 1]) place(new BoxGeometry(length, rail, rail), length / 2, (side * w) / 2.6, (h * w) / 2.6);
          }
          const bays = Math.max(1, Math.round(length / w));
          for (let i = 0; i <= bays; i++) {
            const at = (i / bays) * length;
            place(new BoxGeometry(rail, rail, w * 0.77), at, 0, w / 2.6);
            place(new BoxGeometry(rail, rail, w * 0.77), at, 0, -w / 2.6);
            place(new BoxGeometry(rail, w * 0.77, rail), at, w / 2.6, 0);
            place(new BoxGeometry(rail, w * 0.77, rail), at, -w / 2.6, 0);
          }
          add(mergeGeometries(parts), strut, 0, 0, 0);
        } else {
          const panel = new BoxGeometry(length, 0.6, module.width);
          panel.rotateX(0.18);
          place(panel, length / 2, 0, 1.5);
          add(mergeGeometries(parts), solar, 0, 0, 0);
          // Port and starboard lights at the far edge of each array.
          const nx = -Math.sin(angle);
          const ny = Math.cos(angle);
          blinker(x1 + nx * module.width * 0.5, 2, y1 + ny * module.width * 0.5, 0xff3b30, 1.1, 0.0);
          blinker(x1 - nx * module.width * 0.5, 2, y1 - ny * module.width * 0.5, 0x34ff6a, 1.1, 0.0);
        }
        break;
      }
      case 'tank': {
        add(new SphereGeometry(module.r, 32, 20), hull, module.x, 0, module.y);
        const band = new TorusGeometry(module.r * 1.01, module.r * 0.06, 8, 48);
        band.rotateX(Math.PI / 2);
        add(band, accent, module.x, 0, module.y);
        break;
      }
      case 'dock': {
        const { x, y, angle, width, depth } = module;
        const group = new Group();
        group.position.set(x, 0, -y);
        group.rotation.y = angle;
        root.add(group);
        const local = (geometry: BufferGeometry, material: Material, lx: number, h: number, ly: number) => {
          const mesh = new Mesh(geometry, material);
          mesh.position.set(lx, h, -ly);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);
          return mesh;
        };
        const wallHeight = 14;
        for (const side of [-1, 1]) {
          local(new BoxGeometry(depth, wallHeight, 4), dark, -depth / 2, 0, (side * width) / 2);
          local(new BoxGeometry(depth, 1, 4.4), hazard, -depth / 2, wallHeight / 2 + 0.5, (side * width) / 2);
        }
        local(new BoxGeometry(4, wallHeight, width + 4), dark, -depth, 0, 0);
        local(new BoxGeometry(depth, 1.2, width), hull, -depth / 2, -wallHeight / 2, 0);
        // Wall lights inside the bay.
        for (let i = 0; i < 6; i++) {
          const lx = -depth + 3 + (i * (depth - 6)) / 5;
          for (const side of [-1, 1]) {
            const m = new Mesh(new SphereGeometry(0.9, 8, 6), new MeshBasicMaterial({ color: 0x9fe4ff }));
            materials.push(m.material as Material);
            m.position.set(lx, wallHeight / 2 - 2, -((side * (width / 2 - 2.4))));
            group.add(m);
          }
        }
        // Approach lights: a runway in front of the mouth that chases toward the bay.
        for (let i = 0; i < 12; i++) {
          for (const side of [-1, 1]) {
            const m = new Mesh(new SphereGeometry(1.1, 8, 6), new MeshBasicMaterial({ color: 0x34ff6a, transparent: true, blending: AdditiveBlending }));
            materials.push(m.material as Material);
            m.position.set(14 + i * 11, -2, -((side * width) / 2));
            m.userData.order = i;
            group.add(m);
            chase.push(m);
          }
        }
        const bayLight = new PointLight(0x9fe4ff, 700, depth * 3, 2);
        bayLight.position.set(-depth / 2, 4, 0);
        group.add(bayLight);
        break;
      }
    }
  }

  return {
    root,
    update(time) {
      for (const b of blinkers) {
        const on = (time + b.phase) % b.period < 0.18;
        (b.mesh.material as MeshBasicMaterial).color.setHex(on ? b.on : b.off);
      }
      const head = (time * 9) % 16;
      for (const m of chase) {
        const order = 11 - (m.userData.order as number);
        const d = (head - order + 16) % 16;
        (m.material as MeshBasicMaterial).opacity = d < 3 ? 1 - d / 3 : 0.08;
      }
    },
    dispose() {
      root.traverse((object) => {
        if (object instanceof Mesh) object.geometry.dispose();
      });
      for (const material of materials) material.dispose();
    },
  };
}
