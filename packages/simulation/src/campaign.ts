import { CAMPAIGN, getShip, STATION_PLACEMENTS, type CampaignStep } from '@void-frontier/content';
import { spawnEncounter } from './ai.ts';
import { dockedStationKey } from './missions.ts';
import type { Simulation } from './simulation.ts';
import type { EncounterState } from './types.ts';
import type { World } from './world.ts';

/** How far along the story is. */
export interface Campaign {
  /** Index of the current step; past the last one when the story is over. */
  step: number;
  /** Kills counted toward a kill objective. */
  progress: number;
  /** Player kills already counted, and the owned ship they belong to (hulls keep their own tally). */
  killsSeen: number;
  shipSeen: number;
}

export const createCampaign = (): Campaign => ({ step: 0, progress: 0, killsSeen: 0, shipSeen: 1 });

export const campaignStep = (campaign: Campaign): CampaignStep | null => CAMPAIGN.steps[campaign.step] ?? null;

const BOSS_ENCOUNTER = 'campaign_boss';

function bossEncounter(world: World): EncounterState | undefined {
  return world.encounters.find((e) => e.definition.id === BOSS_ENCOUNTER);
}

/** The boss waits in its sector; leaving and coming back finds it repaired, as with any pirate. */
function bossFallen(world: World, objective: Extract<CampaignStep['objective'], { kind: 'boss' }>): boolean {
  if (world.sectorId !== objective.sector) return false;
  const existing = bossEncounter(world);
  if (existing) return existing.members.every((id) => world.ships.get(id)?.destroyed ?? true);
  const definition = {
    id: BOSS_ENCOUNTER,
    ship: getShip(objective.ship).id,
    faction: 'pirate' as const,
    count: 1,
    spawn: { x: objective.x, y: objective.y },
    patrol: [[objective.x, objective.y], [objective.x + 500, objective.y - 300]] as [number, number][],
    // It never returns once beaten.
    respawnDelay: 1e6,
  };
  world.encounters.push({ definition, members: spawnEncounter(world, definition), respawnAt: null });
  return false;
}

function objectiveMet(sim: Simulation, campaign: Campaign, step: CampaignStep): boolean {
  const world = sim.world;
  const objective = step.objective;
  if (objective.kind === 'discover') return world.sectorId === objective.sector && !!world.pointsOfInterest.get(objective.poi)?.found;
  if (objective.kind === 'kill') return campaign.progress >= objective.count;
  if (objective.kind === 'boss') return bossFallen(world, objective);
  if (dockedStationKey(world, sim.playerId) !== objective.station) return false;
  const ship = world.ships.get(sim.playerId)!;
  const held = ship.cargo.get(objective.resource) ?? 0;
  if (held < objective.units) return false;
  // Handed over on docking: it goes into the station's stock, unpaid (the reward is the pay).
  if (held > objective.units) ship.cargo.set(objective.resource, held - objective.units);
  else ship.cargo.delete(objective.resource);
  const item = sim.economy?.markets[objective.station]?.find((m) => m.resource === objective.resource);
  if (item) item.stock += objective.units;
  return true;
}

/** Counts kills made by the ship being flown, whichever hull that is. */
function countKills(sim: Simulation, campaign: Campaign): void {
  const kills = sim.world.ships.get(sim.playerId)?.kills ?? 0;
  if (campaign.shipSeen !== sim.fleet.activeId) {
    campaign.shipSeen = sim.fleet.activeId;
    campaign.killsSeen = kills;
    return;
  }
  campaign.progress += Math.max(0, kills - campaign.killsSeen);
  campaign.killsSeen = kills;
}

/** The story, every step: checks the current objective, pays out and moves on. */
export function campaignSystem(sim: Simulation): void {
  const campaign = sim.campaign;
  if (!campaign) return;
  countKills(sim, campaign);
  const step = campaignStep(campaign);
  if (!step || !objectiveMet(sim, campaign, step)) return;
  sim.world.credits += step.reward.credits;
  sim.world.standing[step.reward.faction] = Math.min(100, (sim.world.standing[step.reward.faction] ?? 0) + step.reward.reputation);
  campaign.step++;
  campaign.progress = 0;
  sim.world.events.push({ type: 'campaign', step: step.id, credits: step.reward.credits, finished: campaignStep(campaign) === null });
}

/** Where the current step leads, for the on-screen marker: a sector, and a point when one is known. */
export function campaignTarget(sim: Simulation): { sector: string; position: { x: number; y: number } | null } | null {
  const step = sim.campaign && campaignStep(sim.campaign);
  if (!step) return null;
  const objective = step.objective;
  if (objective.kind === 'kill') return null;
  if (objective.kind === 'deliver') {
    const place = STATION_PLACEMENTS.get(objective.station)!;
    return { sector: place.sector, position: { x: place.x, y: place.y } };
  }
  if (objective.kind === 'boss') {
    const id = bossEncounter(sim.world)?.members[0];
    const body = id !== undefined ? sim.world.bodies.get(id) : undefined;
    return { sector: objective.sector, position: body?.position ?? { x: objective.x, y: objective.y } };
  }
  const poi = sim.world.pointsOfInterest.get(objective.poi);
  return { sector: objective.sector, position: poi?.position ?? null };
}
