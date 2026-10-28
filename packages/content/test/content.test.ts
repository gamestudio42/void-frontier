import { describe, expect, it } from 'vitest';
import { PROVING_GROUND, SHIPS, getShip, shipDefinitionSchema } from '../src/index.ts';

describe('content', () => {
  it('ships two valid ship definitions for the vertical slice', () => {
    expect(SHIPS.size).toBe(2);
    expect(getShip('kestrel').class).toBe('scout');
    expect(getShip('mule').class).toBe('hauler');
  });

  it('starts the player in a ship that exists', () => {
    expect(SHIPS.has(PROVING_GROUND.playerShip)).toBe(true);
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
