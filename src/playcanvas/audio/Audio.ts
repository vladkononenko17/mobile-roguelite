/**
 * Game audio on Web Audio: short one-shot effects and a looping music track, built by
 * scripts/build-audio.mjs into public/audio/ (small mono mp3, a few variants per sound).
 *
 * - The context starts suspended and is resumed by the first touch / click / key (mobile autoplay
 *   rules); it is suspended again while the page is hidden.
 * - Sounds load lazily: the first request of a not-yet-loaded sound starts its download and is
 *   skipped; `preload` fetches what a map needs up front.
 * - Positional one-shots fade with distance from the listener (the hero) and pan left / right in
 *   screen space; RULES caps simultaneous voices and repeat rate per sound (rapid fire, hordes).
 * - Music crossfades between tracks (the chapter's loop, the boss theme).
 * - Muting is remembered in localStorage (the HUD's speaker button).
 */

/** Per-sound mix: volume, pitch jitter (+- fraction), simultaneous voices, minimum gap (s). */
interface Rule {
  volume: number;
  pitch?: number;
  voices?: number;
  gap?: number;
}

const RULES: Record<string, Rule> = {
  shot_pistol: { volume: 0.5, pitch: 0.06, voices: 3 },
  shot_rifle: { volume: 0.4, pitch: 0.06, voices: 4 },
  shot_shotgun: { volume: 0.55, pitch: 0.05, voices: 2 },
  shot_plasma: { volume: 0.3, pitch: 0.08, voices: 4 },
  shot_hellfire: { volume: 0.55, pitch: 0.05, voices: 2 },
  reload: { volume: 0.45, voices: 1 },
  step_sand: { volume: 0.22, pitch: 0.1, voices: 2 },
  step_concrete: { volume: 0.26, pitch: 0.1, voices: 2 },
  step_metal: { volume: 0.16, pitch: 0.1, voices: 2 },
  step_grass: { volume: 0.22, pitch: 0.1, voices: 2 },
  step_stone: { volume: 0.26, pitch: 0.1, voices: 2 },
  hurt: { volume: 0.55, pitch: 0.08, voices: 1, gap: 0.25 },
  die: { volume: 0.7, voices: 1 },
  cash: { volume: 0.3, pitch: 0.08, voices: 2, gap: 0.07 },
  heal: { volume: 0.45, voices: 1 },
  upgrade: { volume: 0.5, voices: 1 },
  levelup: { volume: 0.55, voices: 1 },
  ui: { volume: 0.35, voices: 1, gap: 0.05 },
  gate_space: { volume: 0.6, voices: 1 },
  gate_wood: { volume: 0.6, voices: 1 },
  gate_hell: { volume: 0.6, voices: 1 },
  explosion: { volume: 0.5, pitch: 0.1, voices: 3, gap: 0.05 },
  slam: { volume: 0.6, pitch: 0.05, voices: 2 },
  pop: { volume: 0.6, pitch: 0.08, voices: 2 },
};
/** Enemy voices share one rule per kind of sound. */
const VOICE_RULES: Record<string, Rule> = {
  groan: { volume: 0.32, pitch: 0.12, voices: 2, gap: 0.6 },
  attack: { volume: 0.34, pitch: 0.1, voices: 2, gap: 0.2 },
  hit: { volume: 0.22, pitch: 0.12, voices: 2, gap: 0.12 },
  death: { volume: 0.36, pitch: 0.1, voices: 3, gap: 0.06 },
  roar: { volume: 0.8, pitch: 0.03, voices: 1 },
};
const DEFAULT_RULE: Rule = { volume: 0.5, voices: 2 };

/** Distance falloff: full volume within NEAR m of the listener, silent beyond FAR. */
const NEAR = 5;
const FAR = 26;
/** Screen-space x offset (m) at which a sound pans fully to one side (capped at PAN_MAX). */
const PAN_RANGE = 14;
const PAN_MAX = 0.7;
const MUSIC_VOLUME = 0.32;
const MUSIC_FADE = 1.6;
const STORAGE_KEY = "roguelite.sound";

export interface PlayOptions {
  /** World position (omit for the hero's own sounds / UI). */
  x?: number;
  z?: number;
  /** Volume multiplier on the rule's volume. */
  volume?: number;
  /** Playback rate multiplier (lower = deeper). */
  rate?: number;
}

type Loaded = AudioBuffer[] | Promise<void> | null;

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private base = "";
  private counts: Record<string, number> | null = null;
  private countsLoading: Promise<void> | null = null;
  private readonly buffers = new Map<string, Loaded>();
  private readonly active = new Map<string, number>();
  private readonly last = new Map<string, number>();
  private listenerX = 0;
  private listenerZ = 0;
  private yawSin = 0;
  private yawCos = 1;
  private musicId: string | null = null;
  private musicSource: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private unlocked = false;
  muted = false;

  /** Creates the context and hooks the unlock gesture; `base`: the site's base URL. */
  init(base: string): void {
    if (this.ctx) return;
    this.base = `${base}audio/`;
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === "off";
    } catch {
      /* storage unavailable */
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = MUSIC_VOLUME;
    this.musicBus.connect(this.master);
    const unlock = () => {
      if (!this.ctx || document.hidden) return;
      this.ctx.resume().then(() => {
        this.unlocked = true;
        // Music asked for before the gesture starts now.
        if (!this.musicSource && this.musicId) this.startMusic(this.musicId);
      }, () => {});
    };
    for (const type of ["pointerdown", "touchend", "keydown"]) window.addEventListener(type, unlock, { capture: true, passive: true });
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.unlocked) void this.ctx.resume();
    });
    this.loadCounts();
  }

  private loadCounts(): Promise<void> {
    this.countsLoading ??= fetch(`${this.base}sounds.json`)
      .then((r) => r.json() as Promise<Record<string, number>>)
      .then((c) => void (this.counts = c))
      .catch((error: unknown) => console.warn("[Audio] sounds.json failed to load.", error));
    return this.countsLoading;
  }

  /** Whether sound `id` exists (after sounds.json loaded). */
  has(id: string): boolean {
    return !!this.counts?.[id];
  }

  /** Starts loading sounds (all their variants) in the background. */
  preload(ids: Iterable<string>): void {
    const list = [...ids];
    void this.loadCounts().then(() => list.forEach((id) => this.load(id)));
  }

  private load(id: string): Promise<void> | null {
    const ctx = this.ctx;
    const n = this.counts?.[id];
    if (!ctx || !n || this.buffers.has(id)) return null;
    const names = n === 1 && id.startsWith("music_") ? [`${id}.mp3`] : Array.from({ length: n }, (_, i) => `${id}-${i}.mp3`);
    const promise = Promise.all(
      names.map((name) =>
        fetch(`${this.base}${name}`)
          .then((r) => r.arrayBuffer())
          .then((data) => new Promise<AudioBuffer>((resolve, reject) => ctx.decodeAudioData(data, resolve, reject))),
      ),
    ).then(
      (list) => void this.buffers.set(id, list),
      (error: unknown) => {
        console.warn(`[Audio] ${id} failed to load.`, error);
        this.buffers.set(id, null);
      },
    );
    this.buffers.set(id, promise);
    return promise;
  }

  /** The listener (the hero) and the camera yaw (degrees) for panning. */
  setListener(x: number, z: number, cameraYawDeg: number): void {
    this.listenerX = x;
    this.listenerZ = z;
    const a = (cameraYawDeg * Math.PI) / 180;
    this.yawSin = Math.sin(a);
    this.yawCos = Math.cos(a);
  }

  /** Plays a random variant of `id` (see RULES); positional when x / z are given. */
  play(id: string, options: PlayOptions = {}, rule: Rule = RULES[id] ?? DEFAULT_RULE): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || !this.unlocked || ctx.state !== "running" || !this.sfx) return;
    const buffers = this.buffers.get(id);
    if (!Array.isArray(buffers)) {
      if (buffers === undefined) this.load(id);
      return;
    }
    const now = ctx.currentTime;
    if ((this.active.get(id) ?? 0) >= (rule.voices ?? 2)) return;
    if (rule.gap && now - (this.last.get(id) ?? -1) < rule.gap) return;
    let volume = rule.volume * (options.volume ?? 1);
    let pan = 0;
    if (options.x !== undefined && options.z !== undefined) {
      const dx = options.x - this.listenerX, dz = options.z - this.listenerZ;
      const d = Math.hypot(dx, dz);
      if (d >= FAR) return;
      const k = d <= NEAR ? 1 : 1 - (d - NEAR) / (FAR - NEAR);
      volume *= k * k;
      // Screen right is the camera's right: (cos, -sin) of its yaw on the ground.
      const side = dx * this.yawCos - dz * this.yawSin;
      pan = Math.max(-PAN_MAX, Math.min(PAN_MAX, side / PAN_RANGE));
    }
    if (volume < 0.01) return;
    const source = ctx.createBufferSource();
    source.buffer = buffers[Math.floor(Math.random() * buffers.length)];
    const jitter = rule.pitch ? 1 + (Math.random() * 2 - 1) * rule.pitch : 1;
    source.playbackRate.value = jitter * (options.rate ?? 1);
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    if (pan && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner);
      panner.connect(this.sfx);
    } else gain.connect(this.sfx);
    this.active.set(id, (this.active.get(id) ?? 0) + 1);
    this.last.set(id, now);
    source.onended = () => {
      this.active.set(id, Math.max(0, (this.active.get(id) ?? 1) - 1));
      source.disconnect();
      gain.disconnect();
    };
    source.start();
  }

  /** An enemy voice line: `${voice}_${kind}` (kind: groan, attack, hit, death, roar). */
  voice(voice: string, kind: "groan" | "attack" | "hit" | "death" | "roar", options: PlayOptions = {}): void {
    const id = kind === "roar" ? `roar_${voice}` : `${voice}_${kind}`;
    this.play(id, options, VOICE_RULES[kind]);
  }

  /** Crossfades to music track `id` (null: silence). */
  music(id: string | null): void {
    if (id === this.musicId) return;
    this.musicId = id;
    this.fadeOutMusic();
    if (id && this.unlocked && !this.muted) this.startMusic(id);
  }

  private fadeOutMusic(): void {
    const ctx = this.ctx;
    const m = this.musicSource;
    if (!ctx || !m) return;
    this.musicSource = null;
    const now = ctx.currentTime;
    m.gain.gain.cancelScheduledValues(now);
    m.gain.gain.setValueAtTime(m.gain.gain.value, now);
    m.gain.gain.linearRampToValueAtTime(0, now + MUSIC_FADE);
    m.source.stop(now + MUSIC_FADE + 0.05);
  }

  private startMusic(id: string): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const buffers = this.buffers.get(id);
    if (!Array.isArray(buffers)) {
      // Not loaded yet: start once it is (if still wanted).
      const pending = buffers instanceof Promise ? buffers : this.loadCounts().then(() => this.load(id) ?? undefined);
      void pending.then(() => {
        if (this.musicId === id && !this.musicSource && this.unlocked && !this.muted && Array.isArray(this.buffers.get(id))) this.startMusic(id);
      });
      return;
    }
    const buffer = buffers[0];
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    // Skip the mp3 encoder padding at both ends so the loop has no gap.
    source.loopStart = Math.min(0.05, buffer.duration / 4);
    source.loopEnd = Math.max(source.loopStart + 0.1, buffer.duration - 0.05);
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + MUSIC_FADE);
    source.connect(gain);
    gain.connect(this.musicBus);
    source.start(now, source.loopStart);
    this.musicSource = { source, gain };
  }

  /** Mutes / unmutes everything (remembered). */
  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(STORAGE_KEY, muted ? "off" : "on");
    } catch {
      /* storage unavailable */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
    if (muted) this.fadeOutMusic();
    else if (this.musicId && !this.musicSource && this.unlocked) this.startMusic(this.musicId);
  }
}

export const audio = new AudioManager();
