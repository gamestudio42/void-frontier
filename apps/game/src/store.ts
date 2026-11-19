import type { DockRefusal, FleetNote, FleetOrder, FlightTelemetry, Pilot, Proximity, TargetInfo } from '@void-frontier/simulation';

export interface DebugStats {
  fps: number;
  frameMs: number;
  tick: number;
  stepsPerFrame: number;
  droppedSeconds: number;
  entities: number;
  drawCalls: number;
  triangles: number;
  zoom: number;
  quality: string;
  autoQuality: boolean;
  /** Encounter director: how hot things are (0..1) and its pacing phase. */
  intensity: number;
  phase: string;
}

export interface DockingView {
  distance: number;
  speed: number;
  angleError: number;
  refusals: DockRefusal[];
  limits: { maxDistance: number; maxRelativeSpeed: number; maxAngle: number };
}

/** The goal ladder as the station's career tab shows it. */
export interface CareerView {
  rank: number;
  merit: number;
  /** Merit the current rank started at, and the next rank's threshold (null at the top). */
  rankMerit: number;
  nextMerit: number | null;
  activeBonus: number;
  offerBonus: number;
  licences: { id: string; price: number; rank: number; kinds: string[]; rewardBonus: number; killBounty: number; owned: boolean }[];
  /** This station's stake: level now, the level on sale (null when maxed) and what is owed. */
  stake: {
    level: number;
    max: number;
    current: { serviceDiscount: number; offerSlots: number; eliteOffers: boolean; dividendPerHour: number } | null;
    next: { cost: number; rank: number; serviceDiscount: number; offerSlots: number; eliteOffers: boolean; dividendPerHour: number } | null;
  };
}

export interface StationView {
  /** Rank, licences and this station's stake. */
  career: CareerView;
  name: string;
  credits: number;
  market: { resource: string; stock: number; held: number; buy: number | null; sell: number | null }[];
  repairCost: number;
  refuelCost: number;
  /** Owning faction and the player's standing with it. */
  faction: string;
  standing: number;
  /** Modules on offer here plus any already installed, with whether they can be fitted. */
  upgrades: {
    id: string;
    slot: 'engine' | 'utility' | 'defense';
    cost: number;
    /** What the pilot pays: the cost less the trade-in of the tier it replaces. */
    price: number;
    /** Mk I..III for modules that come in tiers, else null. */
    tier: number | null;
    replaces: string | null;
    /** The lower tier that must be fitted first. */
    needs: string | null;
    superseded: boolean;
    installed: boolean;
    offered: boolean;
    locked: { faction: string; reputation: number } | null;
  }[];
  slots: Record<'engine' | 'utility' | 'defense', { used: number; total: number }>;
  shipyard: { ship: string; price: number; locked: { faction: string; reputation: number } | null }[];
  /** Every parked ship, here or elsewhere. */
  hangar: { id: number; ship: string; station: string; here: boolean; value: number; upgrades: number; cargo: number }[];
  /** Hull being flown. */
  flying: string;
  /** Each weapon mount, with what this station can fit there. */
  mounts: { index: number; weapon: string; group: 'primary' | 'secondary' | 'mining'; offers: { weapon: string; cost: number }[] }[];
}

export interface FleetShipView {
  id: number;
  ship: string;
  pilot: Pilot | null;
  order: FleetOrder | null;
  /** parked: in a hangar with nothing to do; docked: loading or unloading on its routine. */
  status: 'parked' | 'docked' | 'travel' | 'work' | 'escort';
  /** Station it is parked at, last left, or heading to. */
  station: string;
  heading: string | null;
  sector: string;
  /** Parked in the hangar of the station the player is docked at. */
  here: boolean;
  cargo: number;
  earned: number;
  fit: { trade: boolean; mine: boolean; wingman: boolean };
}

export interface FleetView {
  ships: FleetShipView[];
  /** Hired pilots waiting at a station without a ship. */
  crew: { pilot: Pilot; station: string; here: boolean }[];
  /** Pilots for hire at the station the player is docked at. */
  offers: (Pilot & { fee: number })[];
  pilots: number;
  maxPilots: number;
  /** Credits per pay cycle for everyone on the payroll. */
  payroll: number;
  payIn: number;
  log: FleetNote[];
}

export interface CampaignView {
  step: string;
  index: number;
  total: number;
  /** Progress toward a counted objective, or null when it is all or nothing. */
  progress: { current: number; target: number } | null;
  /** A decision step: the options to choose between. */
  options: { id: string; credits: number }[] | null;
  speaker: string;
}

export interface ContractView {
  id: number;
  kind: 'delivery' | 'mining' | 'bounty' | 'escort' | 'salvage' | 'patrol' | 'recon';
  elite: boolean;
  reward: number;
  seconds: number;
  units: number;
  resource: string | null;
  drop: string | null;
  station: string | null;
  sector: string | null;
  /** Escorts: the hauler's route id. */
  route: string | null;
  /** The named client and how many jobs the player has done for them. */
  client: string | null;
  loyalty: number;
  /** Enough jobs done that the client counts the player as a regular. */
  regular: boolean;
  modifier: 'fragile' | 'volatile' | 'rush' | 'noBrake' | null;
  /** Fragile crates: share intact, felt g now, and the limit. */
  integrity: number | null;
  g: number | null;
  maxG: number | null;
  /** A no-brake job whose bonus is gone. */
  bonusLost: boolean;
}

export interface ActiveContractView extends ContractView {
  timeLeft: number;
  current: number;
  target: number;
  canHandIn: boolean;
  dropPosition: { x: number; y: number } | null;
}

export interface ContractsView {
  /** Standing with each lawful faction. */
  reputation: Record<string, number>;
  maxActive: number;
  offers: ContractView[];
  active: ActiveContractView[];
  history: { id: number; kind: string; outcome: string; reward: number }[];
}

/** What destroyed the player's ship, for the death card. */
export interface DeathCause {
  kind: 'weapon' | 'ram' | 'rock' | 'station' | 'hazard' | 'other';
  /** Ship definition id of the shooter or the ship rammed. */
  ship: string | null;
  /** Closing speed of the fatal impact, m/s. */
  speed: number;
}

export interface HudState {
  telemetry: FlightTelemetry | null;
  braking: boolean;
  steering: boolean;
  paused: boolean;
  help: boolean;
  debug: boolean;
  proximity: Proximity | null;
  target: TargetInfo | null;
  /** Recent pickups, merged per resource, for the HUD feed. */
  gains: { resource: string; units: number }[];
  jettisonArmed: boolean;
  holdFull: boolean;
  docking: DockingView | null;
  /** Refusal reasons from the last docking request, shown for a few seconds. */
  dockRefused: DockRefusal[] | null;
  station: StationView | null;
  contracts: ContractsView | null;
  notices: { id: number; kind: string; outcome: string; reward: number }[];
  /** Which menu is open over the game, if any. */
  menu: 'main' | 'pause' | null;
  tutorial: { index: number; total: number; title: string; hint: string } | null;
  /** The contextual tip on screen, as a message key. */
  tip: string | null;
  /** The launch from the bay is playing: letterbox on, controls held. */
  launching: boolean;
  sectorId: string;
  gate: { to: string; distance: number; speed: number; ready: boolean } | null;
  /** m/s^2 of pull from gravity wells where the ship is */
  gravity: number;
  /** Game clock of the last jump, for the transition effect. */
  jumpedAt: number;
  /** Last device the player used, for button prompts. */
  device: 'keyboard' | 'gamepad';
  /** The cruise autopilot's destination and what it is doing, while it flies. */
  cruise: { label: string; distance: number; phase: string } | null;
  deathCause: DeathCause | null;
  discovered: string[];
  visited: string[];
  mapOpen: boolean;
  fleetOpen: boolean;
  /** Every readout, or only what a pilot needs at a glance. */
  hudDetails: boolean;
  /** A disabled pirate within reach of boarding. */
  boarding: { distance: number; relativeSpeed: number; ready: boolean; surrendered: boolean } | null;
  /** The system player fire is aimed at, if any. */
  aimedSystem: string | null;
  fleet: FleetView | null;
  /** Current story step; null once the story is over. */
  campaign: CampaignView | null;
  /** The story just ended: show its closing card. */
  campaignEnding: { branch: string | null; minutes: number; deaths: number } | null;
  /** Sector the current story step leads to, if any. */
  campaignSector: string | null;
  /** Latest economy news, newest first. */
  news: { tick: number; kind: string; subject: string; station?: string; sector?: string; resource?: string }[];
  /** Active economy events. */
  events: { id: string; secondsLeft: number }[];
  /**
   * The director's incident under way: `seconds` left in its stage, `distance` to it
   * (calls and wrecks), and for a flare whether the ship is in cover.
   */
  incident: { kind: string; stage: 'warning' | 'active'; seconds: number; distance: number | null; covered: boolean | null } | null;
  /**
   * The sector boss nearby: hull and shield shares, the phase thresholds and how many are
   * past, and whether its guard is open.
   */
  boss: { id: string; trigger: string; hull: number; shield: number; phase: number; phases: number[]; open: boolean; distance: number } | null;
  /** The radio line on screen: who speaks and the message key with its values. */
  radio: { speaker: string; key: string; values: Record<string, string>; name: string | null } | null;
  /** Increments on every damaging hit, so the HUD can flash. */
  hits: number;
  stats: DebugStats;
}

/** Tiny external store for useSyncExternalStore: the game publishes, React only reads. */
export class HudStore {
  private state: HudState;
  private readonly listeners = new Set<() => void>();

  constructor(initial: HudState) {
    this.state = initial;
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = () => this.state;

  update(patch: Partial<HudState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}

export const initialHudState = (): HudState => ({
  telemetry: null,
  braking: false,
  steering: true,
  paused: false,
  help: false,
  debug: false,
  proximity: null,
  target: null,
  gains: [],
  jettisonArmed: false,
  holdFull: false,
  docking: null,
  dockRefused: null,
  station: null,
  contracts: null,
  notices: [],
  menu: 'main',
  tutorial: null,
  tip: null,
  launching: false,
  sectorId: 'outpost_alpha',
  gate: null,
  gravity: 0,
  jumpedAt: -100,
  cruise: null,
  device: 'keyboard',
  deathCause: null,
  incident: null,
  radio: null,
  boss: null,
  discovered: [],
  visited: ['outpost_alpha'],
  mapOpen: false,
  fleetOpen: false,
  hudDetails: false,
  boarding: null,
  aimedSystem: null,
  fleet: null,
  campaign: null,
  campaignEnding: null,
  campaignSector: null,
  news: [],
  events: [],
  hits: 0,
  stats: { fps: 0, frameMs: 0, tick: 0, stepsPerFrame: 0, droppedSeconds: 0, entities: 0, drawCalls: 0, triangles: 0, zoom: 1, quality: 'high', autoQuality: true, intensity: 0, phase: 'calm' },
});
