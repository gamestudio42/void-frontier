import { z } from 'zod';

const positive = z.number().positive();

export const shipDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  class: z.enum(['scout', 'interceptor', 'fighter', 'miner', 'hauler', 'frigate', 'salvager']),
  hull: z.object({
    integrity: positive,
    /** kg */
    dryMass: positive,
    /** metres, nose to tail; the renderer scales the model to it */
    length: positive,
    /** metres */
    collisionRadius: positive,
  }),
  movement: z.object({
    /** newtons */
    mainThrust: positive,
    reverseThrust: positive,
    /** newtons per side */
    lateralThrust: positive,
    /** newton-metres */
    rotationalTorque: positive,
    /** metres; moment of inertia = total mass * gyrationRadius^2, so cargo slows turning too */
    gyrationRadius: positive,
    /** rad/s; the rotation thrusters stop pushing past it, it is not a hard clamp */
    maxAngularVelocity: positive,
    boostMultiplier: z.number().min(1),
    boostFuelMultiplier: z.number().min(1),
  }),
  fuel: z.object({
    /** kg; fuel mass counts toward the ship's mass */
    capacity: positive,
    /** kg of fuel burned per mega-newton-second of thrust */
    consumptionPerMegaNewtonSecond: positive,
  }),
  cargo: z.object({
    /** kg */
    maxMass: positive,
    /** m^3 */
    maxVolume: positive,
  }),
});

export type ShipDefinition = z.infer<typeof shipDefinitionSchema>;
export type ShipClass = ShipDefinition['class'];

export const sectorDefinitionSchema = z.object({
  id: z.string(),
  seed: z.number().int(),
  playerShip: z.string(),
  playerStart: z.object({ x: z.number(), y: z.number(), heading: z.number() }),
  beacons: z.array(z.object({ id: z.string(), x: z.number(), y: z.number() })),
});

export type SectorDefinition = z.infer<typeof sectorDefinitionSchema>;
