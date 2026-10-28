import type { SimEvent, Simulation } from '@void-frontier/simulation';

/**
 * Procedural sound: every effect is synthesised with Web Audio, so the game ships no
 * audio files. Continuous sounds (engines, thrusters, beams) follow the player's ship
 * every frame; one-shots come from simulation events, panned and attenuated by
 * distance from the player.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private effects!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private engine!: { gain: GainNode; filter: BiquadFilterNode; osc: OscillatorNode };
  private rcs!: { gain: GainNode };
  private beam!: { gain: GainNode; osc: OscillatorNode };
  private drill!: { gain: GainNode; osc: OscillatorNode };
  private musicTimer = 0;
  private chord = 0;
  private volumes = { master: 0.8, effects: 0.9, music: 0.5 };

  /** Browsers only allow audio after a user gesture; call this from one. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const ctx = new AudioCtor();
    this.ctx = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 4;
    this.master = ctx.createGain();
    this.effects = ctx.createGain();
    this.music = ctx.createGain();
    this.effects.connect(this.master);
    this.music.connect(this.master);
    this.master.connect(compressor).connect(ctx.destination);
    this.applyVolumes();

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Main engine: filtered rumble plus a low hum.
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 200;
    this.loopNoise().connect(engineFilter).connect(engineGain).connect(this.effects);
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 42;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 120;
    hum.connect(humFilter).connect(engineGain);
    hum.start();
    this.engine = { gain: engineGain, filter: engineFilter, osc: hum };

    // Reaction thrusters: a high hiss.
    const rcsGain = ctx.createGain();
    rcsGain.gain.value = 0;
    const rcsFilter = ctx.createBiquadFilter();
    rcsFilter.type = 'highpass';
    rcsFilter.frequency.value = 2500;
    this.loopNoise().connect(rcsFilter).connect(rcsGain).connect(this.effects);
    this.rcs = { gain: rcsGain };

    this.beam = this.tone('sawtooth', 660, 1800);
    this.drill = this.tone('square', 140, 900);
  }

  setVolumes(master: number, effects: number, music: number): void {
    this.volumes = { master, effects, music };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.effects.gain.value = this.volumes.effects;
    this.music.gain.value = this.volumes.music * 0.35;
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
    osc.connect(filter).connect(gain).connect(this.effects);
    osc.start();
    return { gain, osc };
  }

  /** Continuous sounds follow the player's thrusters and beams. */
  update(sim: Simulation, active: boolean, dt: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const ship = sim.world.ships.get(sim.playerId);
    const on = active && ship && !ship.destroyed && ship.docked === null;
    const out = ship?.output;
    const main = on && out ? out.main * (out.boosting ? 1.4 : 1) : 0;
    const side = on && out ? Math.min(1, Math.abs(out.lateral) + Math.abs(out.rotation) * 0.6 + out.reverse) : 0;
    this.engine.gain.gain.setTargetAtTime(main * 0.5, t, 0.08);
    this.engine.filter.frequency.setTargetAtTime(160 + main * 500, t, 0.1);
    this.engine.osc.frequency.setTargetAtTime(38 + main * 22, t, 0.2);
    this.rcs.gain.gain.setTargetAtTime(side * 0.07, t, 0.04);
    const beam = on && ship!.weapons.some((w) => w.beam && w.definition.kind === 'beam');
    const drill = on && ship!.weapons.some((w) => w.beam && w.definition.kind === 'mining');
    this.beam.gain.gain.setTargetAtTime(beam ? 0.05 : 0, t, 0.03);
    this.beam.osc.frequency.setTargetAtTime(660 + Math.sin(t * 40) * 30, t, 0.01);
    this.drill.gain.gain.setTargetAtTime(drill ? 0.045 : 0, t, 0.05);
    this.drill.osc.frequency.setTargetAtTime(140 + Math.sin(t * 23) * 18, t, 0.02);

    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      this.playPad();
      this.musicTimer = 14;
    }
  }

  /** One-shot effects from simulation events. */
  handle(sim: Simulation, events: SimEvent[]): void {
    if (!this.ctx) return;
    const me = sim.world.bodies.get(sim.playerId)?.position ?? { x: 0, y: 0 };
    const at = (p: { x: number; y: number }) => {
      const dx = p.x - me.x;
      const dy = p.y - me.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      return { gain: 1 / (1 + d / 120), pan: Math.max(-1, Math.min(1, dx / 300)) };
    };
    let shots = 0;
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          if (shots++ > 6) break;
          const body = sim.world.bodies.get(e.owner);
          const where = body ? at(body.position) : { gain: 0.3, pan: 0 };
          const mine = e.owner === sim.playerId;
          this.burst({ duration: 0.09, freq: mine ? 1400 : 1000, type: 'bandpass', gain: (mine ? 0.22 : 0.16) * where.gain, pan: where.pan });
          this.thump(mine ? 90 : 70, 0.08, (mine ? 0.18 : 0.1) * where.gain, where.pan);
          break;
        }
        case 'hit': {
          if (e.beam) break;
          const where = at(e.point);
          if (e.shieldDamage > 0) this.sweep(1800, 900, 0.12, 0.08 * where.gain, where.pan, 'sine');
          else if (e.hullDamage > 0) this.burst({ duration: 0.12, freq: 3000, type: 'bandpass', gain: 0.18 * where.gain, pan: where.pan });
          else this.burst({ duration: 0.08, freq: 600, type: 'lowpass', gain: 0.08 * where.gain, pan: where.pan });
          break;
        }
        case 'collision': {
          const where = at(e.point);
          const level = Math.min(1, e.speed / 20);
          this.thump(55, 0.35, (0.2 + level * 0.5) * where.gain, where.pan);
          this.burst({ duration: 0.25, freq: 400, type: 'lowpass', gain: level * 0.3 * where.gain, pan: where.pan });
          break;
        }
        case 'shipDestroyed': {
          const where = at(e.position);
          this.burst({ duration: 1.8, freq: 900, type: 'lowpass', gain: 0.7 * where.gain, pan: where.pan, sweepTo: 80 });
          this.thump(38, 1.2, 0.8 * where.gain, where.pan);
          break;
        }
        case 'asteroidDepleted': {
          const where = at(e.position);
          this.burst({ duration: 0.9, freq: 500, type: 'lowpass', gain: 0.35 * where.gain, pan: where.pan, sweepTo: 120 });
          break;
        }
        case 'scan':
          if (e.owner === sim.playerId) {
            this.sweep(1400, 700, 0.6, 0.12, 0, 'sine');
            this.sweep(1400, 700, 0.6, 0.05, 0, 'sine', 0.35);
          }
          break;
        case 'collected':
          if (e.ship === sim.playerId) this.chime([1320, 1760], 0.05);
          break;
        case 'cargoFull':
          if (e.ship === sim.playerId) this.chime([440, 330], 0.06);
          break;
        case 'docked':
        case 'undocked':
          if (e.ship === sim.playerId) {
            this.thump(70, 0.25, 0.35, 0);
            this.burst({ duration: 0.3, freq: 1200, type: 'highpass', gain: 0.1, pan: 0 });
            this.chime(e.type === 'docked' ? [660, 880] : [880, 660], 0.05, 0.2);
          }
          break;
        case 'discovered':
          this.chime([392, 523, 659, 784, 1047], 0.06);
          break;
        case 'contract':
          this.chime(e.outcome === 'completed' ? [523, 659, 784, 1047] : [440, 349, 294], 0.07);
          break;
      }
    }
  }

  /** Jump-gate transit: a rising whoosh into a low boom. */
  jump(): void {
    if (!this.ctx) return;
    this.burst({ duration: 1.2, freq: 200, type: 'bandpass', gain: 0.4, pan: 0, sweepTo: 4000 });
    this.sweep(80, 900, 1.0, 0.18, 0, 'sawtooth');
    this.thump(45, 1.4, 0.5, 0);
  }

  /** Soft interface click. */
  click(): void {
    if (this.ctx) this.chime([1800], 0.03);
  }

  private output(pan: number): AudioNode {
    const panner = this.ctx!.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(this.effects);
    return panner;
  }

  private burst(o: { duration: number; freq: number; type: BiquadFilterType; gain: number; pan: number; sweepTo?: number }): void {
    if (o.gain < 0.005) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = o.type;
    filter.frequency.setValueAtTime(o.freq, t);
    if (o.sweepTo) filter.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(o.gain, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + o.duration);
    source.connect(filter).connect(gain).connect(this.output(o.pan));
    source.start(t, Math.random());
    source.stop(t + o.duration + 0.05);
  }

  private thump(freq: number, duration: number, level: number, pan: number): void {
    if (level < 0.005) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(freq * 2, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.output(pan));
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private sweep(from: number, to: number, duration: number, level: number, pan: number, type: OscillatorType, delay = 0): void {
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
    osc.connect(gain).connect(this.output(pan));
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private chime(notes: number[], level: number, delay = 0): void {
    notes.forEach((freq, i) => this.sweep(freq, freq * 0.995, 0.35, level, 0, 'triangle', delay + i * 0.09));
  }

  /** Ambient score: slow, quiet pad chords that drift through a minor progression. */
  private playPad(): void {
    const ctx = this.ctx!;
    const progressions = [
      [110, 164.8, 220, 261.6],
      [98, 146.8, 196, 233.1],
      [87.3, 130.8, 174.6, 220],
      [98, 146.8, 196, 246.9],
    ];
    const notes = progressions[this.chord++ % progressions.length];
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 4);
    gain.gain.linearRampToValueAtTime(0.0001, t + 16);
    filter.connect(gain).connect(this.music);
    for (const freq of notes) {
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(t);
        osc.stop(t + 16.2);
      }
    }
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
