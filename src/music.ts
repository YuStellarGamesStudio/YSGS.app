import type { OPMVoice } from 'xyz.js';

type MusicStatus = 'waiting' | 'loading' | 'playing' | 'paused' | 'blocked' | 'error';
interface Song {
  bpm: number;
  durationBeats: number;
  tracks: { name: string; voice: OPMVoice; notes: { note: number; beat: number; length: number }[] }[];
}
interface OPM {
  context: AudioContext | null;
  node: AudioWorkletNode | null;
  loadVoice(name: string, voice: unknown): void;
  start(): Promise<void>;
  playNote(options: { voice: string; note: number; time: number; duration: number }): number;
  close(): Promise<void>;
}
interface Event {
  voice: string;
  note: number;
  time: number;
  duration: number;
}
const BASE = import.meta.env.BASE_URL;

// Use the official OPM distribution directly: one worklet for the whole arrangement,
// independent of whether the site's 3D renderer is available.
export class MusicController {
  private wanted: boolean;
  private level: number;
  private blocked = false;
  private activated = false;
  private failed = false;
  private disposed = false;
  private loading: Promise<void> | null = null;
  private transitions: Promise<void> = Promise.resolve();
  private opm: OPM | null = null;
  private resources = this.preload();
  private gain: GainNode | null = null;
  private events: Event[] = [];
  private period = 0;
  private origin = 0;
  private cycle = 0;
  private index = 0;
  private timer: number | undefined;

  private preload() {
    const resources = Promise.all([
      import(/* @vite-ignore */ `${BASE}opm/dist/api/index.js`) as Promise<{ OPM: new () => OPM }>,
      fetch(`${BASE}music/stellar-drift.json`).then(async (response) => {
        if (!response.ok) throw new Error(`Music score: HTTP ${response.status}`);
        return await response.json() as Song;
      }),
    ]);
    void resources.catch(() => {});
    return resources;
  }
  constructor(private readonly onChange: () => void, volume = 0.05, enabled = true) {
    this.level = volume;
    this.wanted = enabled;
    // Preloading creates no AudioContext; playback waits for a user gesture.
  }

  get enabled(): boolean { return this.wanted; }
  get volume(): number { return this.level; }
  get status(): MusicStatus {
    if (this.failed) return 'error';
    if (this.loading) return 'loading';
    if (!this.wanted) return 'paused';
    if (this.blocked) return 'blocked';
    return this.opm?.context?.state === 'running' ? 'playing' : 'waiting';
  }

  async activate(): Promise<void> {
    if (this.disposed || !this.wanted || this.blocked) return;
    this.activated = true;
    if (!this.opm && !this.loading) {
      if (this.failed) this.resources = this.preload();
      this.failed = false;
      this.loading = this.initialize();
      this.onChange();
    }
    try {
      await this.loading;
      if (!this.disposed) await this.syncPlayback();
    } catch (error) {
      await this.fail(error);
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.wanted = enabled;
    this.onChange();
    if (enabled) await this.activate();
    else await this.syncPlayback();
  }

  setVolume(value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('Music volume must be within 0..1');
    this.level = value;
    const context = this.opm?.context;
    if (context && this.gain) this.gain.gain.setTargetAtTime(value, context.currentTime, 0.03);
    this.onChange();
  }

  setBlocked(blocked: boolean): void {
    this.blocked = blocked;
    void this.syncPlayback();
    this.onChange();
  }

  private async initialize(): Promise<void> {
    const [{ OPM }, song] = await this.resources;
    if (this.disposed) return;
    const synth = new OPM();
    try {
      if (!Number.isFinite(song.bpm) || song.bpm <= 0 || !Number.isFinite(song.durationBeats) || song.durationBeats <= 0) throw new Error('Invalid music tempo or loop period');
      const seconds = 60 / song.bpm;
      this.period = song.durationBeats * seconds;
      this.events = song.tracks.flatMap((track, trackIndex) => {
        const voice = `track_${trackIndex}`;
        synth.loadVoice(voice, track.voice);
        return track.notes.map(({ note, beat, length }) => {
          if (!Number.isInteger(note) || note < 0 || note > 127 || !Number.isFinite(beat) || beat < 0 || !Number.isFinite(length) || length <= 0 || length * seconds > 60 || beat + length > song.durationBeats) throw new Error('Invalid music note');
          return { voice, note, time: beat * seconds, duration: length * seconds };
        });
      }).sort((a, b) => a.time - b.time);
      if (!this.events.length) throw new Error('Music score is empty');
      await synth.start();
      if (this.disposed) { await synth.close(); return; }
      const context = synth.context!;
      // OPM starts connected to destination; reroute through our master volume.
      const gain = context.createGain();
      gain.gain.value = this.level;
      synth.node!.disconnect();
      synth.node!.connect(gain);
      gain.connect(context.destination);
      synth.node!.addEventListener('processorerror', () => { void this.fail(new Error('OPM audio processor failed')); });
      this.opm = synth;
      this.gain = gain;
      this.origin = context.currentTime + 0.05;
      this.cycle = 0;
      this.index = 0;
    } catch (error) {
      await synth.close();
      throw error;
    } finally {
      this.loading = null;
    }
  }

  // Serializing context transitions prevents a late resume from undoing a pause
  // requested while OPM was loading, during navigation, or on a hidden tab.
  private syncPlayback(): Promise<void> {
    this.transitions = this.transitions.then(async () => {
      const context = this.opm?.context;
      if (!context || this.disposed) return;
      if (this.wanted && this.activated && !this.blocked) {
        await context.resume();
        if (!this.wanted || this.blocked || this.disposed) return;
        this.tick();
        if (this.failed) return;
        this.timer ??= setInterval(() => this.tick(), 25);
      } else {
        this.clearTimer();
        await context.suspend();
      }
      this.onChange();
    }).catch((error: unknown) => this.fail(error));
    return this.transitions;
  }

  private tick(): void {
    const synth = this.opm;
    const context = synth?.context;
    if (!synth || !context || context.state !== 'running' || this.blocked || !this.wanted) return;
    const now = context.currentTime;
    try {
      // Schedule only 120 ms ahead. Pausing the AudioContext freezes both queued
      // worklet events and our clock; resuming never piles up background notes.
      while (true) {
        const event = this.events[this.index]!;
        const at = this.origin + this.cycle * this.period + event.time;
        if (at > now + 0.12) break;
        if (at + event.duration > now) synth.playNote({ voice: event.voice, note: event.note, time: Math.max(0, at - now), duration: Math.min(event.duration, at + event.duration - now) });
        this.index++;
        if (this.index === this.events.length) { this.index = 0; this.cycle++; }
      }
    } catch (error) {
      void this.fail(error);
    }
  }

  private clearTimer(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private async fail(error: unknown): Promise<void> {
    this.clearTimer();
    this.failed = true;
    const synth = this.opm;
    this.opm = null;
    this.gain = null;
    this.loading = null;
    console.warn('Background music unavailable:', error);
    await synth?.close();
    if (!this.disposed) this.onChange();
  }

  async destroy(): Promise<void> {
    this.disposed = true;
    this.clearTimer();
    await this.loading?.catch(() => {});
    await this.transitions;
    await this.opm?.close();
    this.opm = null;
    this.gain = null;
  }
}
