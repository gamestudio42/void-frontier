import type { DockRefusal, FlightTelemetry, Proximity, TargetInfo } from '@void-frontier/simulation';

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
}

export interface DockingView {
  distance: number;
  speed: number;
  angleError: number;
  refusals: DockRefusal[];
  limits: { maxDistance: number; maxRelativeSpeed: number; maxAngle: number };
}

export interface StationView {
  name: string;
  credits: number;
  market: { resource: string; stock: number; held: number; buy: number | null; sell: number | null }[];
  repairCost: number;
  refuelCost: number;
  upgrades: { id: string; cost: number; installed: boolean }[];
}

export interface ContractView {
  id: number;
  kind: 'delivery' | 'mining' | 'bounty';
  elite: boolean;
  reward: number;
  seconds: number;
  units: number;
  resource: string | null;
  drop: string | null;
}

export interface ActiveContractView extends ContractView {
  timeLeft: number;
  current: number;
  target: number;
  canHandIn: boolean;
  dropPosition: { x: number; y: number } | null;
}

export interface ContractsView {
  reputation: number;
  maxActive: number;
  offers: ContractView[];
  active: ActiveContractView[];
  history: { id: number; kind: string; outcome: string; reward: number }[];
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
  help: true,
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
  hits: 0,
  stats: { fps: 0, frameMs: 0, tick: 0, stepsPerFrame: 0, droppedSeconds: 0, entities: 0, drawCalls: 0, triangles: 0, zoom: 1, quality: 'high', autoQuality: true },
});
