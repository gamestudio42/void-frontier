import hull from '../assets/kestrel/hull.json';
import { describe, expect, it } from 'vitest';

/** The baked interceptor, in model space: nose +X, centred, unscaled. */
describe('kestrel hull', () => {
  it('is a closed-enough mesh with the nose forward and the bells aft', () => {
    expect(hull.length).toBeGreaterThan(40);
    expect(hull.length).toBeLessThan(55);
    for (const surface of [hull.atlas, hull.glow]) {
      expect(surface.positions.length % 9).toBe(0);
      expect(surface.normals).toHaveLength(surface.positions.length);
      expect(surface.uvs).toHaveLength((surface.positions.length / 3) * 2);
      for (const uv of surface.uvs) expect(uv).toBeGreaterThanOrEqual(0);
      for (const uv of surface.uvs) expect(uv).toBeLessThanOrEqual(1);
    }
    expect(hull.atlas.positions.length).toBeGreaterThan(hull.glow.positions.length);

    const exhausts = hull.nozzles.filter((nozzle) => nozzle.groups.includes('main'));
    const reverse = hull.nozzles.filter((nozzle) => nozzle.groups.includes('reverse'));
    expect(exhausts).toHaveLength(2);
    expect(reverse.length).toBeGreaterThan(0);
    for (const nozzle of exhausts) expect(nozzle.position[0]).toBeLessThan(-hull.length / 2);
    for (const nozzle of reverse) expect(nozzle.position[0]).toBeGreaterThan(hull.length / 4);
  });
});
