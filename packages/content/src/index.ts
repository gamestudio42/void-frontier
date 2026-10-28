import { z } from 'zod';
import provingGroundData from '../data/proving-ground.json';
import shipData from '../data/ships.json';
import { sectorDefinitionSchema, shipDefinitionSchema, type SectorDefinition, type ShipDefinition } from './schema.ts';

export * from './schema.ts';

/** Every definition is validated when the module loads, so bad data fails fast in tests and at boot. */
export const SHIPS: ReadonlyMap<string, ShipDefinition> = new Map(
  z.array(shipDefinitionSchema).parse(shipData).map((ship) => [ship.id, ship]),
);

export const PROVING_GROUND: SectorDefinition = sectorDefinitionSchema.parse(provingGroundData);

export function getShip(id: string): ShipDefinition {
  const ship = SHIPS.get(id);
  if (!ship) throw new Error(`Unknown ship definition: ${id}`);
  return ship;
}
