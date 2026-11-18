import bulwark from '../assets/bulwark/hull.json';
import dreadmaw from '../assets/dreadmaw/hull.json';
import kestrel from '../assets/kestrel/hull.json';
import marauder from '../assets/marauder/hull.json';
import jackal from '../assets/jackal/hull.json';
import lancer from '../assets/lancer/hull.json';
import magpie from '../assets/magpie/hull.json';
import mule from '../assets/mule/hull.json';
import prospector from '../assets/prospector/hull.json';
import { describe, expect, it } from 'vitest';

/** Baked studio hulls, in model space: nose +X, centred, unscaled. */
const HULLS = [
  { name: 'kestrel', hull: kestrel, exhausts: 2 },
  { name: 'marauder', hull: marauder, exhausts: 4 },
  { name: 'bulwark', hull: bulwark, exhausts: 2 },
  { name: 'dreadmaw', hull: dreadmaw, exhausts: 4 },
  { name: 'jackal', hull: jackal, exhausts: 2 },
  { name: 'mule', hull: mule, exhausts: 2 },
  { name: 'prospector', hull: prospector, exhausts: 2 },
  { name: 'lancer', hull: lancer, exhausts: 3 },
  { name: 'magpie', hull: magpie, exhausts: 2 },
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
    // Every main bell sits in the aft half, the last ones at the stern; a grafted or
    // auxiliary engine may sit forward of it. Reverse jets fire from ahead of the middle.
    for (const nozzle of bells) expect(nozzle.position[0]).toBeLessThan(-hull.length / 4);
    expect(Math.min(...bells.map((nozzle) => nozzle.position[0]))).toBeLessThan(-hull.length / 2);
    for (const nozzle of reverse) expect(nozzle.position[0]).toBeGreaterThan(0);
  });
});
