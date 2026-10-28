import { describe, expect, it } from 'vitest';
import { ASTEROID_TYPES, OUTPOST_ALPHA, RESOURCES, SHIPS, STATIONS, getResource, getShip, getUpgrade, getWeapon, shipDefinitionSchema, validateSector } from '../src/index.ts';

describe('content', () => {
  it('ships two player ships and one pirate for the vertical slice', () => {
    expect(SHIPS.size).toBe(3);
    expect(getShip('kestrel').class).toBe('scout');
    expect(getShip('mule').class).toBe('hauler');
    expect(getShip('jackal').class).toBe('interceptor');
  });

  it('arms the starter ship with an autocannon pair and a laser', () => {
    const weapons = getShip('kestrel').hardpoints.map((h) => getWeapon(h.weapon).kind);
    expect(weapons.sort()).toEqual(['beam', 'mining', 'projectile', 'projectile']);
  });

  it('gives each weapon a reason to exist: lasers strip shields, cannons break hulls', () => {
    const cannon = getWeapon('autocannon_mk1');
    const laser = getWeapon('laser_mk1');
    expect(laser.multipliers.shield).toBeGreaterThan(cannon.multipliers.shield);
    expect(cannon.multipliers.hull).toBeGreaterThan(laser.multipliers.hull);
  });

  it('defines three asteroid types for the three slice minerals', () => {
    expect([...ASTEROID_TYPES.values()].map((t) => t.resource).sort()).toEqual(['copper_ore', 'iron_ore', 'titanium_ore']);
  });

  it('maps every rock type to a resource with mass and volume', () => {
    for (const type of ASTEROID_TYPES.values()) {
      const resource = getResource(type.resource);
      expect(resource.unitMass).toBeGreaterThan(0);
      expect(resource.unitVolume).toBeGreaterThan(0);
    }
    expect(RESOURCES.has('salvage')).toBe(true);
  });

  it('offers four upgrades and a market that trades every slice resource', () => {
    const station = [...STATIONS.values()][0];
    expect(station.upgrades.map((u) => getUpgrade(u).cost).every((c) => c > 0)).toBe(true);
    expect(station.upgrades).toHaveLength(4);
    expect(station.market.map((m) => m.resource).sort()).toEqual(['copper_ore', 'iron_ore', 'machine_parts', 'salvage', 'titanium_ore']);
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
