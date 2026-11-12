import bulwark from '../assets/bulwark/hull.json';
import dreadmaw from '../assets/dreadmaw/hull.json';
import kestrel from '../assets/kestrel/hull.json';
import marauder from '../assets/marauder/hull.json';
import { describe, expect, it } from 'vitest';

/** Baked studio hulls, in model space: nose +X, centred, unscaled. */
const HULLS = [
  { name: 'kestrel', hull: kestrel, exhausts: 2 },
  { name: 'marauder', hull: marauder, exhausts: 4 },
  { name: 'bulwark', hull: bulwark, exhausts: 2 },
  { name: 'dreadmaw', hull: dreadmaw, exhausts: 4 },
] as const;

describe('authored hulls', () => {
  it.each(HULLS)('$name keeps its nose forward and its bells aft', ({ hull, exhausts }) => {
    expect(hull.length).toBeGreaterThan(10);
    for (const surface of [hull.atlas, hull.glow]) {
      expect(surface.positions.length % 9).toBe(0);
      expect(surface.normals).toHaveLength(surface.positions.length);
      expect(surface.uvs).toHaveLength((surface.positions.length / 3) * 2);
      for (const uv of surface.uvs) expect(uv).toBeGreaterThanOrEqual(0);
      for (const uv of surface.uvs) expect(uv).toBeLessThanOrEqual(1);
    }
    expect(hull.atlas.positions.length).toBeGreaterThan(hull.glow.positions.length);

    const bells = hull.nozzles.filter((nozzle) => nozzle.groups.includes('main'));
    const reverse = hull.nozzles.filter((nozzle) => nozzle.groups.includes('reverse'));
    expect(bells).toHaveLength(exhausts);
    expect(reverse.length).toBeGreaterThan(0);
    for (const nozzle of bells) expect(nozzle.position[0]).toBeLessThan(-hull.length / 2);
    for (const nozzle of reverse) expect(nozzle.position[0]).toBeGreaterThan(hull.length / 4);
  });
});
