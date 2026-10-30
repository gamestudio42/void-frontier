import { describe, expect, it } from 'vitest';
import { ASTEROID_TYPES, FACTIONS, OUTPOST_ALPHA, RESOURCES, SECTORS, SHIPS, STATIONS, UPGRADES, getResource, getShip, getUpgrade, getWeapon, shipDefinitionSchema, validateSector } from '../src/index.ts';

describe('content', () => {
  it('ships four player hulls, two pirate types and the campaign flagship', () => {
    expect(SHIPS.size).toBe(7);
    expect(getShip('prospector').class).toBe('miner');
    expect(getShip('lancer').class).toBe('fighter');
    expect(getShip('marauder').class).toBe('frigate');
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

  it('defines a rock type for each mined resource', () => {
    expect([...ASTEROID_TYPES.values()].map((t) => t.resource).sort()).toEqual(['copper_ore', 'exotic_matter', 'iron_ore', 'platinum_ore', 'titanium_ore']);
  });

  it('links four sectors with paired gates', () => {
    expect(SECTORS.size).toBe(4);
    for (const sector of SECTORS.values()) expect(sector.gates.length).toBeGreaterThanOrEqual(2);
  });

  it('maps every rock type to a resource with mass and volume', () => {
    for (const type of ASTEROID_TYPES.values()) {
      const resource = getResource(type.resource);
      expect(resource.unitMass).toBeGreaterThan(0);
      expect(resource.unitVolume).toBeGreaterThan(0);
    }
    expect(RESOURCES.has('salvage')).toBe(true);
  });

  it('offers five modules and a market that trades every slice resource', () => {
    const station = STATIONS.get('outpost')!;
    expect(station.upgrades.map((u) => getUpgrade(u).cost).every((c) => c > 0)).toBe(true);
    expect(station.upgrades).toHaveLength(5);
    expect(station.market.map((m) => m.resource).sort()).toEqual(['copper_ore', 'iron_ore', 'machine_parts', 'salvage', 'titanium_ore']);
  });

  it('defines four factions, one hostile, and gives every station an owner', () => {
    expect(FACTIONS.size).toBe(4);
    expect([...FACTIONS.values()].filter((f) => f.hostile).map((f) => f.id)).toEqual(['free_pirates']);
    for (const station of STATIONS.values()) expect(FACTIONS.has(station.faction)).toBe(true);
  });

  it('puts every module in a slot the starter ship has', () => {
    const slots = getShip('kestrel').slots;
    for (const upgrade of UPGRADES.values()) expect(slots[upgrade.slot]).toBeGreaterThan(0);
    for (const ship of SHIPS.values()) for (const h of ship.hardpoints) expect(getWeapon(h.weapon)).toBeDefined();
    expect(UPGRADES.size).toBe(10);
  });

  it('gives every station a docking bay', () => {
    expect(STATIONS.size).toBe(4);
    for (const station of STATIONS.values()) expect(station.modules.some((m) => m.kind === 'dock')).toBe(true);
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
