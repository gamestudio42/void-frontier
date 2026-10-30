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
  /** The branch the player chose, once they have. */
  branch: string | null;
  /** How the playthrough went, read back from a save when balancing. */
  stats: { deaths: number; startTick: number; steps: { id: string; tick: number }[] };
}

export const createCampaign = (): Campaign => ({ step: 0, progress: 0, killsSeen: 0, shipSeen: 1, branch: null, stats: { deaths: 0, startTick: 0, steps: [] } });

export const campaignStep = (campaign: Campaign): CampaignStep | null => CAMPAIGN.steps[campaign.step] ?? null;

function bossEncounter(world: World, stepId: string): EncounterState | undefined {
  return world.encounters.find((e) => e.definition.id === `campaign_boss_${stepId}`);
}

function spawnGroup(world: World, id: string, ship: string, count: number, x: number, y: number): EncounterState {
  const definition = {
    id,
    ship: getShip(ship).id,
    faction: 'pirate' as const,
    count,
    spawn: { x, y },
    patrol: [[x, y], [x + 500, y - 300]] as [number, number][],
    // It never returns once beaten.
    respawnDelay: 1e6,
  };
  const state = { definition, members: spawnEncounter(world, definition), respawnAt: null };
  world.encounters.push(state);
  return state;
}

/** The boss waits in its sector; leaving and coming back finds it repaired, as with any pirate. */
function bossFallen(world: World, stepId: string, objective: Extract<CampaignStep['objective'], { kind: 'boss' }>): boolean {
  if (world.sectorId !== objective.sector) return false;
  const existing = bossEncounter(world, stepId);
  if (existing) return existing.members.every((id) => world.ships.get(id)?.destroyed ?? true);
  spawnGroup(world, `campaign_boss_${stepId}`, objective.ship, 1, objective.x, objective.y);
  if (objective.escort) spawnGroup(world, `campaign_escort_${stepId}`, objective.escort.ship, objective.escort.count, objective.x + 90, objective.y + 90);
  return false;
}

function objectiveMet(sim: Simulation, campaign: Campaign, step: CampaignStep): boolean {
  const world = sim.world;
  const objective = step.objective;
  if (objective.kind === 'discover') return world.sectorId === objective.sector && !!world.pointsOfInterest.get(objective.poi)?.found;
  if (objective.kind === 'kill') return campaign.progress >= objective.count;
  if (objective.kind === 'boss') return bossFallen(world, step.id, objective);
  // Waits for chooseCampaign.
  if (objective.kind === 'choice') return false;
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
  finishStep(sim, campaign, step, step.reward);
}

function finishStep(sim: Simulation, campaign: Campaign, step: CampaignStep, reward: { credits: number; faction: string; reputation: number }): void {
  sim.world.credits += reward.credits;
  sim.world.standing[reward.faction] = Math.max(-100, Math.min(100, (sim.world.standing[reward.faction] ?? 0) + reward.reputation));
  campaign.stats.steps.push({ id: step.id, tick: sim.world.tick });
  campaign.step++;
  // Steps on the other branch are passed over.
  while (CAMPAIGN.steps[campaign.step]?.when && CAMPAIGN.steps[campaign.step].when !== campaign.branch) campaign.step++;
  campaign.progress = 0;
  sim.world.events.push({ type: 'campaign', step: step.id, credits: reward.credits, finished: campaignStep(campaign) === null });
}

/** The player's answer to a choice step: pays that option and sets the branch for the rest of the story. */
export function chooseCampaign(sim: Simulation, optionId: string): boolean {
  const campaign = sim.campaign;
  const step = campaign && campaignStep(campaign);
  if (!campaign || !step || step.objective.kind !== 'choice') return false;
  const option = step.objective.options.find((o) => o.id === optionId);
  if (!option) return false;
  campaign.branch = option.id;
  finishStep(sim, campaign, step, option);
  return true;
}

/** Where the current step leads, for the on-screen marker: a sector, and a point when one is known. */
export function campaignTarget(sim: Simulation): { sector: string; position: { x: number; y: number } | null } | null {
  const step = sim.campaign && campaignStep(sim.campaign);
  if (!step) return null;
  const objective = step.objective;
  if (objective.kind === 'kill' || objective.kind === 'choice') return null;
  if (objective.kind === 'deliver') {
    const place = STATION_PLACEMENTS.get(objective.station)!;
    return { sector: place.sector, position: { x: place.x, y: place.y } };
  }
  if (objective.kind === 'boss') {
    const id = bossEncounter(sim.world, step.id)?.members[0];
    const body = id !== undefined ? sim.world.bodies.get(id) : undefined;
    return { sector: objective.sector, position: body?.position ?? { x: objective.x, y: objective.y } };
  }
  const poi = sim.world.pointsOfInterest.get(objective.poi);
  return { sector: objective.sector, position: poi?.position ?? null };
}
