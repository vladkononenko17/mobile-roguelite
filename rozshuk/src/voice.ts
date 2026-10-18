import { lineFor, type Cast } from "./lines";
import { getAudio } from "./sfx";

/**
 * Spoken lines. Recorded voices (ElevenLabs, in public/rozshuk/voice/) play
 * through WebAudio; a line without a recording falls back to the device's
 * Ukrainian speech synthesis, and to nothing where there is none — the speech
 * bubble always shows the text anyway.
 */

export type VoiceRole = "officer" | "babka" | "me" | "npc";

const PRIORITY: Record<Cast | "npc" | "me", number> = {
  officer: 2, guard: 3, clerk: 3, hr: 3, arkadiy: 3, molfar: 3, babka: 1, hero: 1, me: 1, npc: 0,
};
const TTS: Record<VoiceRole, { pitch: number; rate: number }> = {
  officer: { pitch: 0.6, rate: 1.12 }, babka: { pitch: 1.45, rate: 1.05 }, me: { pitch: 1, rate: 1.15 }, npc: { pitch: 0.9, rate: 1.05 },
};

class Voice {
  private enabled = true;
  private uk: SpeechSynthesisVoice | null = null;
  private busyUntil = 0;
  private busyPriority = -1;
  private gain: GainNode | null = null;
  private current: AudioBufferSourceNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();

  constructor() {
    if (!this.tts) return;
    const load = () => { this.uk = window.speechSynthesis.getVoices().find((v) => /^uk/i.test(v.lang)) ?? null; };
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
  }

  private get tts(): boolean { return typeof window !== "undefined" && "speechSynthesis" in window; }
  /** Recorded lines ship with the game, so voices are always available. */
  get available(): boolean { return true; }
  get on(): boolean { return this.enabled; }
  set on(v: boolean) {
    this.enabled = v;
    try { localStorage.setItem("rozshuk-voice", v ? "1" : "0"); } catch { /* blocked */ }
    if (!v) this.stop();
  }

  load(): void {
    try { this.enabled = localStorage.getItem("rozshuk-voice") !== "0"; } catch { /* blocked */ }
  }

  /** Call from a user gesture: wakes speech synthesis on iOS and warms the cache. */
  unlock(): void {
    if (this.tts && this.uk) {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
    for (const id of ["tck-stop", "tck-docs", "tck-grab", "tck-van", "me-caught"]) void this.buffer(id);
  }

  private buffer(id: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(id);
    if (!p) {
      p = (async () => {
        const a = getAudio();
        if (!a) return null;
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}rozshuk/voice/${id}.mp3`);
          if (!res.ok) return null;
          return await a.ctx.decodeAudioData(await res.arrayBuffer());
        } catch {
          return null;
        }
      })();
      this.buffers.set(id, p);
      // let a failed fetch retry later
      void p.then((b) => { if (!b) this.buffers.delete(id); });
    }
    return p;
  }

  /** Say something the game shows. `role` picks the fallback synthetic voice. */
  say(text: string, role: VoiceRole, delayMs = 0): void {
    if (!this.enabled) return;
    if (delayMs > 0) { setTimeout(() => this.say(text, role), delayMs); return; }
    const line = lineFor(text);
    const priority = PRIORITY[line?.who ?? (role === "me" ? "me" : role === "officer" ? "officer" : role === "babka" ? "babka" : "npc")];
    const now = performance.now();
    if (now < this.busyUntil && priority < this.busyPriority) return;
    if (line) {
      this.busyPriority = priority;
      this.busyUntil = now + 900;
      void this.buffer(line.id).then((buf) => {
        const a = getAudio();
        if (!buf || !a || !this.enabled) { if (!buf) this.speak(text, role, priority); return; }
        if (!this.gain) { this.gain = a.ctx.createGain(); this.gain.gain.value = 1; this.gain.connect(a.ctx.destination); }
        try { this.current?.stop(); } catch { /* already done */ }
        if (this.tts) window.speechSynthesis.cancel();
        const src = a.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.gain);
        src.start();
        this.current = src;
        this.busyUntil = performance.now() + buf.duration * 1000;
      });
      return;
    }
    this.speak(text, role, priority);
  }

  private speak(text: string, role: VoiceRole, priority: number): void {
    if (!this.tts || !this.uk) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[«»…]/g, ""));
    u.voice = this.uk;
    u.lang = this.uk.lang;
    u.pitch = TTS[role].pitch;
    u.rate = TTS[role].rate;
    window.speechSynthesis.speak(u);
    this.busyUntil = performance.now() + 400 + text.length * 70;
    this.busyPriority = priority;
  }

  stop(): void {
    try { this.current?.stop(); } catch { /* already done */ }
    if (this.tts) window.speechSynthesis.cancel();
    this.busyUntil = 0;
  }
}

export const voice = new Voice();
