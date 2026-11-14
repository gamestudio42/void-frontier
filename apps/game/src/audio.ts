import { hostilesNear, type SimEvent, type Simulation } from '@void-frontier/simulation';
import { PRIORITY, VoiceBudget, duckDepth, musicIntensity, nextVariant, pitchJitter, smoothIntensity, spatial, stemLevels, type Priority, type Stem } from './audioMix.ts';

/** Beats per minute of the adaptive score. */
const TEMPO = 92;
/** Seconds of music scheduled ahead of the audio clock. */
const LOOKAHEAD = 0.25;
/** Root notes (Hz) of the score's minor progression, one per two bars. */
const PROGRESSION = [
  { root: 55, chord: [110, 130.8, 164.8, 220] },
  { root: 49, chord: [98, 116.5, 146.8, 196] },
  { root: 43.65, chord: [87.3, 110, 130.8, 174.6] },
  { root: 49, chord: [98, 123.5, 146.8, 185] },
];

type Bus = 'sfx' | 'ambience' | 'ui';

/** Unity below 0.6, then a tanh knee that never reaches full scale. */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(2049);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= 0.6 ? a : 0.6 + 0.38 * Math.tanh((a - 0.6) / 0.38);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

/**
 * Procedural sound: every effect is synthesised with Web Audio, so the game ships no
 * audio files. Sounds go through four buses (effects, ambience, interface, music) into a
 * limiter; heavy events duck the music and ambience. One-shots are layered (attack,
 * body, tail), vary in pitch and variant, carry a space reverb send and compete for a
 * voice budget by priority. The score is four procedural stems on a beat grid whose
 * levels follow how intense the moment is.
 */
export class AudioEngine {
  private ctx: BaseAudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<Bus, GainNode>;
  private music!: GainNode;
  /** Ducking stages: the music and ambience pass through these. */
  private musicDuck!: GainNode;
  private ambienceDuck!: GainNode;
  private reverb!: GainNode;
  private noise!: AudioBuffer;
  private engine!: { gain: GainNode; filter: BiquadFilterNode; osc: OscillatorNode; body: OscillatorNode; bodyGain: GainNode; whine: OscillatorNode; whineGain: GainNode };
  private rcs!: { gain: GainNode; filter: BiquadFilterNode };
  private beam!: { gain: GainNode; osc: OscillatorNode; sub: OscillatorNode };
  private drill!: { gain: GainNode; osc: OscillatorNode };
  private drillNoise!: GainNode;
  private stems!: Record<Stem, GainNode>;
  private drone!: { a: OscillatorNode; b: OscillatorNode };
  private readonly voices = new VoiceBudget();
  private readonly variant: Record<string, number> = {};
  private bossHeard = new Set<number>();
  private intensity = 0;
  private lastAction = -100;
  private nextBeat = 0;
  private beat = 0;
  private volumes = { master: 0.8, effects: 0.9, music: 0.5 };

  /**
   * Browsers only allow audio after a user gesture; call this from one. Tests and tools
   * may pass their own context (an OfflineAudioContext renders without a speaker).
   */
  unlock(context?: BaseAudioContext): void {
    if (this.ctx) {
      if ('resume' in this.ctx) void (this.ctx as AudioContext).resume();
      return;
    }
    let ctx = context;
    if (!ctx) {
      const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      ctx = new AudioCtor();
    }
    this.ctx = ctx;

    // A limiter on the master keeps a pile-up from clipping.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    // Past the limiter, a soft clipper rounds off the transients it is too slow to catch.
    const clipper = ctx.createWaveShaper();
    clipper.curve = softClipCurve();
    clipper.oversample = '2x';
    this.master = ctx.createGain();
    this.master.connect(limiter).connect(clipper).connect(ctx.destination);

    this.musicDuck = ctx.createGain();
    this.ambienceDuck = ctx.createGain();
    this.musicDuck.connect(this.master);
    this.ambienceDuck.connect(this.master);
    this.music = ctx.createGain();
    this.music.connect(this.musicDuck);
    this.buses = { sfx: ctx.createGain(), ambience: ctx.createGain(), ui: ctx.createGain() };
    this.buses.sfx.connect(this.master);
    this.buses.ui.connect(this.master);
    this.buses.ambience.connect(this.ambienceDuck);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // A long dark tail: big events bloom into it, small ones barely touch it.
    const convolver = ctx.createConvolver();
    convolver.buffer = this.impulse(2.8);
    const reverbTone = ctx.createBiquadFilter();
    reverbTone.type = 'lowpass';
    reverbTone.frequency.value = 2400;
    this.reverb = ctx.createGain();
    this.reverb.gain.value = 0.55;
    this.reverb.connect(convolver).connect(reverbTone).connect(this.master);
    this.applyVolumes();

    // Main engine: filtered rumble, a low hum, a sub body and a turbine whine on boost.
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 200;
    this.loopNoise().connect(engineFilter).connect(engineGain).connect(this.buses.ambience);
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 42;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 120;
    hum.connect(humFilter).connect(engineGain);
    hum.start();
    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.value = 28;
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0;
    body.connect(bodyGain).connect(engineGain);
    body.start();
    const whine = ctx.createOscillator();
    whine.type = 'triangle';
    whine.frequency.value = 900;
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0;
    whine.connect(whineGain).connect(this.buses.ambience);
    whine.start();
    this.engine = { gain: engineGain, filter: engineFilter, osc: hum, body, bodyGain, whine, whineGain };

    // Reaction thrusters: a hiss whose colour follows how hard they push.
    const rcsGain = ctx.createGain();
    rcsGain.gain.value = 0;
    const rcsFilter = ctx.createBiquadFilter();
    rcsFilter.type = 'highpass';
    rcsFilter.frequency.value = 2500;
    this.loopNoise().connect(rcsFilter).connect(rcsGain).connect(this.buses.ambience);
    this.rcs = { gain: rcsGain, filter: rcsFilter };

    const beam = this.tone('sawtooth', 660, 1800);
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 165;
    sub.connect(beam.gain);
    sub.start();
    this.beam = { ...beam, sub };
    this.drill = this.tone('square', 140, 900);
    const drillNoise = ctx.createGain();
    drillNoise.gain.value = 0;
    const drillFilter = ctx.createBiquadFilter();
    drillFilter.type = 'bandpass';
    drillFilter.frequency.value = 880;
    drillFilter.Q.value = 0.8;
    this.loopNoise().connect(drillFilter).connect(drillNoise).connect(this.buses.ambience);
    this.drillNoise = drillNoise;

    // Music stems, each with its own fader the intensity moves.
    const stem = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.music);
      return g;
    };
    this.stems = { drone: stem(), pad: stem(), pulse: stem(), drums: stem(), brass: stem() };
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 260;
    droneFilter.connect(this.stems.drone);
    const a = ctx.createOscillator();
    a.type = 'sawtooth';
    a.frequency.value = 55;
    const b = ctx.createOscillator();
    b.type = 'sawtooth';
    b.frequency.value = 55;
    b.detune.value = 9;
    const droneLevel = ctx.createGain();
    droneLevel.gain.value = 0.09;
    a.connect(droneLevel);
    b.connect(droneLevel);
    droneLevel.connect(droneFilter);
    a.start();
    b.start();
    this.drone = { a, b };
    this.nextBeat = ctx.currentTime + 0.1;
  }

  setVolumes(master: number, effects: number, music: number): void {
    this.volumes = { master, effects, music };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.buses.sfx.gain.value = this.volumes.effects;
    this.buses.ambience.gain.value = this.volumes.effects;
    this.buses.ui.gain.value = Math.min(1, this.volumes.effects * 1.1);
    this.music.gain.value = this.volumes.music * 0.5;
  }

  /** Exponentially decaying stereo noise: the reverb's impulse response. */
  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3.2;
    }
    return buffer;
  }

  private loopNoise(): AudioBufferSourceNode {
    const source = this.ctx!.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    source.start();
    return source;
  }

  private tone(type: OscillatorType, frequency: number, cutoff: number): { gain: GainNode; osc: OscillatorNode } {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(this.buses.ambience);
    osc.start();
    return { gain, osc };
  }

  /** Continuous sounds follow the player's thrusters and beams; the score follows the moment. */
  update(sim: Simulation, active: boolean, dt: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const ship = sim.world.ships.get(sim.playerId);
    const on = active && ship && !ship.destroyed && ship.docked === null;
    const out = ship?.output;
    const main = on && out ? out.main * (out.boosting ? 1.4 : 1) : 0;
    const side = on && out ? Math.min(1, Math.abs(out.lateral) + Math.abs(out.rotation) * 0.6 + out.reverse) : 0;
    this.engine.gain.gain.setTargetAtTime(main * 0.42, t, 0.08);
    this.engine.filter.frequency.setTargetAtTime(140 + main * 620, t, 0.1);
    this.engine.osc.frequency.setTargetAtTime(36 + main * 28, t, 0.15);
    this.engine.body.frequency.setTargetAtTime(26 + main * 22, t, 0.12);
    this.engine.bodyGain.gain.setTargetAtTime(main * 0.32, t, 0.08);
    const boosting = on && !!out?.boosting && out.main > 0;
    this.engine.whineGain.gain.setTargetAtTime(boosting ? 0.025 : 0, t, boosting ? 0.15 : 0.4);
    this.engine.whine.frequency.setTargetAtTime(boosting ? 1500 : 900, t, 0.6);
    this.rcs.gain.gain.setTargetAtTime(side * 0.07, t, 0.04);
    this.rcs.filter.frequency.setTargetAtTime(1800 + side * 2400, t, 0.05);
    const beam = on && ship!.weapons.some((w) => w.beam && w.definition.kind === 'beam');
    const drill = on && ship!.weapons.some((w) => w.beam && w.definition.kind === 'mining');
    this.beam.gain.gain.setTargetAtTime(beam ? 0.05 : 0, t, 0.03);
    this.beam.osc.frequency.setTargetAtTime(660 + Math.sin(t * 40) * 30, t, 0.01);
    this.drill.gain.gain.setTargetAtTime(drill ? 0.04 : 0, t, 0.05);
    this.drill.osc.frequency.setTargetAtTime(120 + Math.sin(t * 23) * 16, t, 0.02);
    this.drillNoise.gain.setTargetAtTime(drill ? 0.07 : 0, t, 0.04);
    this.watchBoss(sim);

    // The score: intensity from the situation, smoothed, sets each stem's fader.
    const docked = ship?.docked != null;
    let hunting = 0;
    for (const pilot of sim.world.pilots.values()) if (pilot.target === sim.playerId) hunting++;
    const boss = [...sim.world.ships.values()].some((s) => !s.destroyed && s.baseDefinition.id === 'dreadmaw');
    const target = musicIntensity({
      docked,
      destroyed: !ship || ship.destroyed,
      hostilesNear: ship && !ship.destroyed ? hostilesNear(sim.world, sim.playerId, 900).length : 0,
      hunting,
      boss,
      sinceAction: t - this.lastAction,
      hull: ship ? ship.hull / ship.definition.hull.integrity : 1,
    });
    this.intensity = smoothIntensity(this.intensity, active ? target : Math.min(target, 0.15), dt);
    const levels = stemLevels(this.intensity, docked);
    for (const stem of Object.keys(levels) as Stem[]) this.stems[stem].gain.setTargetAtTime(levels[stem], t, 0.8);
    this.schedule(levels);
  }

  /** Current smoothed music intensity, for the debug overlay and tests. */
  get musicLevel(): number {
    return this.intensity;
  }

  /** One-shot effects from simulation events. */
  handle(sim: Simulation, events: SimEvent[]): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const me = sim.world.bodies.get(sim.playerId)?.position ?? { x: 0, y: 0 };
    const at = (p: { x: number; y: number }) => spatial(p.x - me.x, p.y - me.y);
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          const mine = e.owner === sim.playerId;
          if (mine) this.lastAction = now;
          const body = sim.world.bodies.get(e.owner);
          const where = body ? at(body.position) : { gain: 0.3, pan: 0, cutoff: 4000 };
          const level = (mine ? 1 : 0.7) * where.gain;
          if (!this.admit(mine ? PRIORITY.player : PRIORITY.weapon, level, 0.2, mine ? 'shot:me' : 'shot')) break;
          this.shot(level, where.pan, where.cutoff, mine);
          break;
        }
        case 'hit': {
          if (e.beam) break;
          const onMe = e.target === sim.playerId;
          if (onMe) this.lastAction = now;
          const where = at(e.point);
          const priority = onMe ? PRIORITY.critical : e.attacker === sim.playerId ? PRIORITY.player : PRIORITY.impact;
          if (!this.admit(priority, where.gain, 0.3, onMe ? 'hit:me' : 'hit')) break;
          if (e.shieldDamage > 0) this.shieldHit(where.gain, where.pan, onMe);
          else if (e.hullDamage > 0) this.hullHit(where.gain, where.pan, where.cutoff, onMe);
          else this.burst({ duration: 0.08, freq: 600, type: 'lowpass', gain: 0.08 * where.gain, pan: where.pan });
          if (sim.world.ships.get(e.target)?.baseDefinition.id === 'dreadmaw') this.thump(38, 0.5, 0.3 * where.gain, where.pan);
          if (onMe && e.hullDamage > 0) this.duck(0.35, 0.4);
          break;
        }
        case 'collision': {
          const where = at(e.point);
          const level = Math.min(1, e.speed / 20);
          const mine = e.a === sim.playerId || e.b === sim.playerId;
          if (!this.admit(mine ? PRIORITY.critical : PRIORITY.impact, where.gain, 0.45, 'collision')) break;
          this.thump(46, 0.42, (0.22 + level * 0.4) * where.gain, where.pan);
          this.burst({ duration: 0.3, freq: 360, type: 'lowpass', gain: level * 0.26 * where.gain, pan: where.pan, sweepTo: 70, send: 0.4 });
          this.sweep(480, 80, 0.34, 0.11 * level * where.gain, where.pan, 'triangle');
          // Metal groans under a hard knock.
          if (level > 0.5) this.metal(160 * pitchJitter(Math.random(), 120), 0.6, 0.1 * level * where.gain, where.pan);
          // The shield taking the blow crackles over the thud.
          if (e.losses.some((l) => l.shield > 0)) this.burst({ duration: 0.22, freq: 2400, type: 'bandpass', gain: (0.08 + level * 0.12) * where.gain, pan: where.pan, sweepTo: 900 });
          if (mine) this.duck(0.2 + level * 0.3, 0.5);
          break;
        }
        case 'shipDestroyed': {
          const where = at(e.position);
          this.admit(PRIORITY.critical, where.gain, 2, 'explosion');
          this.explosion(where.gain, where.pan, e.id === sim.playerId);
          this.duck(0.4 + where.gain * 0.6, e.id === sim.playerId ? 2.5 : 1.2);
          break;
        }
        case 'asteroidFractured': {
          const where = at(e.position);
          if (e.volatile) {
            this.explosion(where.gain, where.pan, e.by === sim.playerId);
            this.duck(0.3 + where.gain * 0.5, 1.2);
            break;
          }
          if (!this.admit(PRIORITY.impact, where.gain, 1.2, 'crack')) break;
          // A sharp crack, then the halves grinding apart.
          this.burst({ duration: 0.12, freq: 2400, type: 'highpass', gain: 0.5 * where.gain, pan: where.pan, send: 0.4 });
          this.burst({ duration: 1.1, freq: 380, type: 'lowpass', gain: 0.4 * where.gain, pan: where.pan, sweepTo: 90, send: 0.6 });
          this.debris(where.gain * 0.7, where.pan, 7);
          break;
        }
        case 'asteroidDepleted': {
          const where = at(e.position);
          if (!this.admit(PRIORITY.impact, where.gain, 1, 'rock')) break;
          this.burst({ duration: 0.9, freq: 500, type: 'lowpass', gain: 0.35 * where.gain, pan: where.pan, sweepTo: 120, send: 0.5 });
          this.debris(where.gain * 0.5, where.pan, 5);
          break;
        }
        case 'scan':
          if (e.owner === sim.playerId) {
            this.sweep(1400, 700, 0.6, 0.12, 0, 'sine', 0, 'ui', 0.3);
            this.sweep(1400, 700, 0.6, 0.05, 0, 'sine', 0.35, 'ui', 0.3);
          }
          break;
        case 'collected':
          if (e.ship === sim.playerId && this.admit(PRIORITY.player, 0.5, 0.3, 'collected')) this.chime([1320, 1760], 0.05);
          break;
        case 'cargoFull':
          if (e.ship === sim.playerId) this.chime([440, 330], 0.06);
          break;
        case 'docked':
        case 'undocked':
          if (e.ship === sim.playerId) {
            this.thump(70, 0.25, 0.35, 0);
            this.burst({ duration: 0.3, freq: 1200, type: 'highpass', gain: 0.1, pan: 0 });
            // Clamps: two metallic clanks.
            this.metal(220, 0.5, 0.08, -0.3);
            this.metal(196, 0.5, 0.07, 0.3, 0.12);
            this.chime(e.type === 'docked' ? [660, 880] : [880, 660], 0.05, 0.2);
          }
          break;
        case 'subsystemDamaged':
          if (e.ship === sim.playerId) this.chime(e.health === 0 ? [880, 660, 880, 660] : [880, 660], 0.07);
          break;
        case 'discovered':
          this.chime([392, 523, 659, 784, 1047], 0.06);
          this.duck(0.3, 1.5);
          break;
        case 'campaign':
          // A rising figure for a mission, the full fanfare for the end of the story.
          this.chime(e.finished ? [392, 523, 659, 784, 1047, 1319] : [523, 659, 784], 0.08);
          this.thump(70, 0.5, 0.25, 0);
          this.duck(0.45, 2);
          break;
        case 'fleet':
          if (e.note.kind === 'lost') this.chime([440, 349, 262], 0.08);
          else if (e.note.kind === 'attacked' || e.note.kind === 'unpaid' || e.note.kind === 'quit') this.chime([659, 523], 0.05);
          else if (e.note.kind === 'skill') this.chime([659, 880], 0.04);
          break;
        case 'contract':
          this.chime(e.outcome === 'completed' ? [523, 659, 784, 1047] : [440, 349, 294], 0.07);
          this.duck(0.3, 1.2);
          break;
      }
    }
  }

  private admit(priority: Priority, gain: number, duration: number, kind: string): boolean {
    return gain >= 0.01 && this.voices.admit({ priority, gain, duration, kind }, this.ctx!.currentTime);
  }

  /** Pull the music and ambience down by `weight` (0..1) and bring them back over `hold` seconds. */
  private duck(weight: number, hold: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const depth = duckDepth(weight);
    for (const [node, share] of [
      [this.musicDuck, 1],
      [this.ambienceDuck, 0.5],
    ] as const) {
      node.gain.cancelScheduledValues(t);
      node.gain.setTargetAtTime(1 - depth * share, t, 0.03);
      node.gain.setTargetAtTime(1, t + hold * 0.3, hold * 0.35);
    }
  }

  /** A gunshot in three layers: a crack, a pitched body and a short tail into the reverb. */
  private shot(level: number, pan: number, cutoff: number, mine: boolean): void {
    const v = (this.variant.shot = nextVariant(this.variant.shot ?? 0, 3, Math.random()));
    const pitch = pitchJitter(Math.random(), 80);
    this.burst({ duration: 0.03, freq: [3200, 2600, 3800][v] * pitch, type: 'highpass', gain: 0.13 * level, pan, cutoff });
    this.thump((mine ? 125 : 90) * pitch, 0.16, 0.2 * level, pan, cutoff);
    this.burst({ duration: 0.18, freq: [240, 200, 280][v], type: 'lowpass', gain: 0.09 * level, pan, sweepTo: 70, cutoff, send: mine ? 0.15 : 0.3 });
  }

  /** Rounds on a hull: a hard click and a short inharmonic ring, like struck plate. */
  private hullHit(level: number, pan: number, cutoff: number, onMe: boolean): void {
    const pitch = pitchJitter(Math.random(), 150);
    this.burst({ duration: 0.05, freq: 3400 * pitch, type: 'bandpass', gain: (onMe ? 0.24 : 0.16) * level, pan, cutoff });
    this.metal((onMe ? 310 : 420) * pitch, onMe ? 0.4 : 0.25, (onMe ? 0.1 : 0.06) * level, pan);
    if (onMe) this.thump(60, 0.3, 0.3, pan);
  }

  /** Rounds on a shield: a bright shimmer that bends down. */
  private shieldHit(level: number, pan: number, onMe: boolean): void {
    const pitch = pitchJitter(Math.random(), 100);
    this.sweep(1900 * pitch, 900 * pitch, 0.14, (onMe ? 0.1 : 0.07) * level, pan, 'sine');
    this.sweep(2850 * pitch, 1300 * pitch, 0.1, 0.04 * level, pan, 'sine');
    this.burst({ duration: 0.1, freq: 5200, type: 'highpass', gain: 0.03 * level, pan });
  }

  /** A ship coming apart: crack, a deep body, debris rattling for half a second, a long rumble. */
  private explosion(level: number, pan: number, player: boolean): void {
    const v = (this.variant.boom = nextVariant(this.variant.boom ?? 0, 3, Math.random()));
    const scale = player ? 1.2 : 1;
    this.burst({ duration: 0.12, freq: 2200, type: 'highpass', gain: 0.35 * level * scale, pan });
    this.thump([38, 34, 42][v], 1.2, 0.8 * level * scale, pan);
    this.burst({ duration: 1.8, freq: [900, 700, 1100][v], type: 'lowpass', gain: 0.6 * level * scale, pan, sweepTo: 80, send: 0.8 });
    this.debris(level * 0.6, pan, 9);
    this.burst({ duration: 3, freq: 160, type: 'lowpass', gain: 0.25 * level * scale, pan, sweepTo: 40, send: 0.6, delay: 0.15 });
  }

  /** Small scattered clicks: fragments of hull or rock. */
  private debris(level: number, pan: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const delay = 0.05 + Math.random() * 0.6;
      this.burst({ duration: 0.04 + Math.random() * 0.05, freq: 1200 + Math.random() * 3000, type: 'bandpass', gain: level * (0.05 + Math.random() * 0.06), pan: Math.max(-1, Math.min(1, pan + (Math.random() - 0.5) * 0.6)), delay });
    }
  }

  /** Struck metal: three detuned sine partials at plate-like ratios, decaying fast. */
  private metal(freq: number, duration: number, level: number, pan: number, delay = 0): void {
    for (const [ratio, share] of [
      [1, 1],
      [2.76, 0.5],
      [5.4, 0.25],
    ] as const) {
      this.sweep(freq * ratio, freq * ratio * 0.98, duration / ratio ** 0.4, level * share, pan, 'sine', delay, 'sfx', 0.25);
    }
  }

  /** A low horn the first time the flagship is in the sector, including when it returns repaired. */
  private watchBoss(sim: Simulation): void {
    const alive = new Set<number>();
    for (const [id, ship] of sim.world.ships) {
      if (ship.destroyed || ship.baseDefinition.id !== 'dreadmaw') continue;
      alive.add(id);
      if (!this.bossHeard.has(id)) {
        this.bossHeard.add(id);
        this.sweep(76, 32, 1.7, 0.2, 0, 'sawtooth', 0, 'sfx', 0.6);
        this.thump(30, 1.6, 0.4, 0);
        this.burst({ duration: 1.3, freq: 100, type: 'lowpass', gain: 0.18, pan: 0, sweepTo: 40, send: 0.6 });
        this.duck(0.6, 2.5);
      }
    }
    for (const id of this.bossHeard) if (!alive.has(id)) this.bossHeard.delete(id);
  }

  /** Jump-gate transit: a rising whoosh into a low boom. */
  jump(): void {
    if (!this.ctx) return;
    this.burst({ duration: 1.2, freq: 200, type: 'bandpass', gain: 0.4, pan: 0, sweepTo: 4000, send: 0.5 });
    this.sweep(80, 900, 1.0, 0.18, 0, 'sawtooth');
    this.thump(45, 1.4, 0.5, 0);
    this.duck(0.7, 2);
  }

  /** Soft interface click. */
  click(): void {
    if (this.ctx) this.chime([1800], 0.03);
  }

  /** A sound's way out: optional distance low-pass, a panner onto its bus, and a reverb send. */
  private output(pan: number, bus: Bus = 'sfx', cutoff = 0, send = 0): AudioNode {
    const ctx = this.ctx!;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(this.buses[bus]);
    if (send > 0) {
      const sendGain = ctx.createGain();
      sendGain.gain.value = send;
      panner.connect(sendGain).connect(this.reverb);
    }
    if (cutoff > 0 && cutoff < 16000) {
      const air = ctx.createBiquadFilter();
      air.type = 'lowpass';
      air.frequency.value = cutoff;
      air.connect(panner);
      return air;
    }
    return panner;
  }

  private burst(o: { duration: number; freq: number; type: BiquadFilterType; gain: number; pan: number; sweepTo?: number; cutoff?: number; send?: number; delay?: number }): void {
    if (o.gain < 0.005) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = o.type;
    filter.frequency.setValueAtTime(o.freq, t);
    if (o.sweepTo) filter.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.setValueAtTime(o.gain, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + o.duration);
    source.connect(filter).connect(gain).connect(this.output(o.pan, 'sfx', o.cutoff ?? 0, o.send ?? 0));
    source.start(t, Math.random());
    source.stop(t + o.duration + 0.05);
  }

  private thump(freq: number, duration: number, level: number, pan: number, cutoff = 0): void {
    if (level < 0.005) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(freq * 2, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.output(pan, 'sfx', cutoff, 0.2));
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private sweep(from: number, to: number, duration: number, level: number, pan: number, type: OscillatorType, delay = 0, bus: Bus = 'sfx', send = 0): void {
    if (level < 0.003) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.output(pan, bus, 0, send));
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private chime(notes: number[], level: number, delay = 0): void {
    notes.forEach((freq, i) => this.sweep(freq, freq * 0.995, 0.35, level, 0, 'triangle', delay + i * 0.09, 'ui', 0.2));
  }

  /**
   * Schedules the score on its beat grid just ahead of the audio clock. Only stems that
   * can be heard get notes; the drone runs continuously and follows the chord root.
   */
  private schedule(levels: Record<Stem, number>): void {
    const ctx = this.ctx!;
    const secondsPerBeat = 60 / TEMPO;
    // After a pause the clock has run on: restart the grid instead of catching up.
    if (this.nextBeat < ctx.currentTime - 0.5) this.nextBeat = ctx.currentTime + 0.05;
    while (this.nextBeat < ctx.currentTime + LOOKAHEAD) {
      const at = this.nextBeat;
      const beat = this.beat;
      const step = PROGRESSION[Math.floor(beat / 8) % PROGRESSION.length];
      if (beat % 8 === 0) {
        this.drone.a.frequency.setTargetAtTime(step.root, at, 0.6);
        this.drone.b.frequency.setTargetAtTime(step.root, at, 0.6);
        if (levels.pad > 0.01) this.padChord(step.chord, at, secondsPerBeat * 8);
        if (levels.brass > 0.01) this.brass(step.chord, at, secondsPerBeat * 8);
      }
      if (levels.pulse > 0.01) {
        // Eighth-note ostinato on the root and its octave.
        for (const half of [0, 0.5]) this.note(this.stems.pulse, 'sawtooth', step.root * (half === 0 ? 2 : beat % 2 === 0 ? 4 : 3), at + half * secondsPerBeat, 0.16, 0.07, 520);
      }
      if (levels.drums > 0.01) this.drums(beat, at, secondsPerBeat);
      this.beat++;
      this.nextBeat += secondsPerBeat;
    }
  }

  private padChord(chord: number[], at: number, length: number): void {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.05, at + length * 0.3);
    gain.gain.linearRampToValueAtTime(0.0001, at + length + 0.4);
    filter.connect(gain).connect(this.stems.pad);
    for (const freq of chord) {
      for (const detune of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq * 2;
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(at);
        osc.stop(at + length + 0.5);
      }
    }
  }

  private brass(chord: number[], at: number, length: number): void {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, at);
    filter.frequency.linearRampToValueAtTime(1400, at + 0.5);
    filter.frequency.linearRampToValueAtTime(500, at + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.045, at + 0.35);
    gain.gain.linearRampToValueAtTime(0.0001, at + length);
    filter.connect(gain).connect(this.stems.brass);
    for (const freq of [chord[0], chord[2], chord[0] * 2]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.connect(filter);
      osc.start(at);
      osc.stop(at + length + 0.1);
    }
  }

  /** Kick on 1 and 3, a noise snare on 2 and 4, closed hats on the eighths. */
  private drums(beat: number, at: number, secondsPerBeat: number): void {
    const ctx = this.ctx!;
    const stem = this.stems.drums;
    if (beat % 2 === 0) {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(110, at);
      osc.frequency.exponentialRampToValueAtTime(42, at + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      osc.connect(g).connect(stem);
      osc.start(at);
      osc.stop(at + 0.32);
    } else {
      this.hit(stem, at, 0.14, 1600, 'bandpass', 0.18);
    }
    for (const half of [0, 0.5]) this.hit(stem, at + half * secondsPerBeat, 0.035, 7000, 'highpass', 0.05);
  }

  private hit(stem: GainNode, at: number, duration: number, freq: number, type: BiquadFilterType, level: number): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(g).connect(stem);
    source.start(at, Math.random());
    source.stop(at + duration + 0.02);
  }

  private note(stem: GainNode, type: OscillatorType, freq: number, at: number, duration: number, level: number, cutoff: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(level, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(filter).connect(g).connect(stem);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  dispose(): void {
    const ctx = this.ctx;
    if (ctx && 'close' in ctx) void (ctx as AudioContext).close();
    this.ctx = null;
  }
}
