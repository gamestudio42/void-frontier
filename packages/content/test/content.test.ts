import { describe, expect, it } from 'vitest';
import { ASTEROID_TYPES, OUTPOST_ALPHA, SHIPS, STATIONS, getShip, shipDefinitionSchema, validateSector } from '../src/index.ts';

describe('content', () => {
  it('ships two valid ship definitions for the vertical slice', () => {
    expect(SHIPS.size).toBe(2);
    expect(getShip('kestrel').class).toBe('scout');
    expect(getShip('mule').class).toBe('hauler');
  });

  it('defines three asteroid types for the three slice minerals', () => {
    expect([...ASTEROID_TYPES.values()].map((t) => t.resource).sort()).toEqual(['copper_ore', 'iron_ore', 'titanium_ore']);
  });

  it('has one station with a docking bay', () => {
    expect(STATIONS.size).toBe(1);
    expect([...STATIONS.values()][0].modules.some((m) => m.kind === 'dock')).toBe(true);
  });

  it('references only existing definitions from the sector', () => {
    expect(() => validateSector(OUTPOST_ALPHA)).not.toThrow();
    const broken = structuredClone(OUTPOST_ALPHA);
    broken.asteroidFields[0].types = { unobtainium: 1 };
    expect(() => validateSector(broken)).toThrow();
  });

  it('rejects a definition with negative thrust', () => {
    const bad = structuredClone(getShip('kestrel'));
    bad.movement.mainThrust = -1;
    expect(shipDefinitionSchema.safeParse(bad).success).toBe(false);
  });

  it('throws on an unknown ship id', () => {
    expect(() => getShip('nope')).toThrow();
  });
});
