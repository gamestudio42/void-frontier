import type { FlightTelemetry } from '@void-frontier/simulation';

export interface DebugStats {
  fps: number;
  frameMs: number;
  tick: number;
  stepsPerFrame: number;
  droppedSeconds: number;
  entities: number;
  drawCalls: number;
  zoom: number;
}

export interface HudState {
  telemetry: FlightTelemetry | null;
  braking: boolean;
  steering: boolean;
  paused: boolean;
  help: boolean;
  debug: boolean;
  beacon: { name: string; distance: number } | null;
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
  beacon: null,
  stats: { fps: 0, frameMs: 0, tick: 0, stepsPerFrame: 0, droppedSeconds: 0, entities: 0, drawCalls: 0, zoom: 1 },
});
