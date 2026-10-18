import { LINE_SPEAKER, LINES, spokenText, voiceKey, type Speaker } from "./lines";
import { getAudio, onUnlock } from "./sfx";

/**
 * Voice lines. Pre-recorded files (e.g. generated once with ElevenLabs by
 * `npm run voices`) are used when present in `fishing/voice/`; otherwise the
 * device's built-in Russian speech synthesis reads the line.
 */
export type { Speaker };

const PROFILE: Record<Speaker, { pitch: number; rate: number; volume: number }> = {
  hero: { pitch: 1.05, rate: 1.1, volume: 0.95 },
  tolik: { pitch: 0.55, rate: 0.98, volume: 1 },
  announcer: { pitch: 1.25, rate: 1.18, volume: 1 },
};

const MALE = /(yuri|юрий|pavel|павел|dmitri|дмитрий|maxim|максим|aleksandr|александр|male|муж)/i;
const FEMALE = /(milena|милена|irina|ирина|katya|катя|elena|елена|anna|анна|svetlana|female|жен)/i;

export { LINES };

class VoiceBox {
  private enabled = true;
  private voices: SpeechSynthesisVoice[] = [];
  private cast: Partial<Record<Speaker, SpeechSynthesisVoice>> = {};
  private currentPriority = -1;
  private busyUntil = 0;
  private recorded = new Set<string>();
  private urls = new Map<string, string>();
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private current: AudioBufferSourceNode | null = null;

  constructor() {
    if (!this.supported) return;
    const load = () => this.pickVoices();
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
  }

  get supported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  get recordingCount(): number {
    return this.recorded.size;
  }

  /** Register recordings: a manifest of keys next to the page, or inline data URLs. */
  async loadRecordings(baseUrl: string, inline?: Record<string, string>): Promise<void> {
    if (inline) {
      Object.entries(inline).forEach(([key, url]) => { this.recorded.add(key); this.urls.set(key, url); });
    } else {
      try {
        const res = await fetch(`${baseUrl}manifest.json`, { cache: "no-cache" });
        if (!res.ok) return;
        const data = (await res.json()) as { files: Record<string, string> };
        Object.entries(data.files).forEach(([key, file]) => { this.recorded.add(key); this.urls.set(key, baseUrl + file); });
      } catch { return; }
    }
    // Decode in the background once audio is allowed, so lines start instantly.
    onUnlock(() => this.recorded.forEach((key) => void this.buffer(key)));
  }

  private buffer(key: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(key);
    if (!p) {
      const a = getAudio();
      const url = this.urls.get(key);
      if (!a || !url) return Promise.resolve(null);
      p = fetch(url).then((r) => r.arrayBuffer()).then((b) => a.ctx.decodeAudioData(b)).catch(() => null);
      this.buffers.set(key, p);
    }
    return p;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.stop();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private pickVoices(): void {
    if (!this.supported) return;
    this.voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("ru"));
    const male = this.voices.filter((v) => MALE.test(v.name));
    const female = this.voices.filter((v) => FEMALE.test(v.name));
    const any = this.voices[0];
    this.cast.hero = male[0] ?? any;
    this.cast.tolik = male[1] ?? male[0] ?? any;
    this.cast.announcer = female[0] ?? any;
  }

  /** Must run inside a tap on iOS before any speech is allowed. */
  unlock(): void {
    if (!this.supported) return;
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }

  say(speaker: Speaker, text: string, priority = 1): void {
    if (!this.enabled) return;
    const now = performance.now();
    if (now < this.busyUntil && priority <= this.currentPriority) return;
    const key = voiceKey(speaker, text);
    if (this.recorded.has(key) && getAudio()) {
      this.stop();
      this.currentPriority = priority;
      this.busyUntil = now + 4000;
      void this.buffer(key).then((buf) => {
        const a = getAudio();
        if (!buf || !a || this.currentPriority !== priority || !this.enabled) return;
        const src = a.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(a.voice);
        src.onended = () => { if (this.current === src) { this.current = null; this.busyUntil = 0; this.currentPriority = -1; } };
        this.current = src;
        this.busyUntil = performance.now() + buf.duration * 1000;
        src.start();
      });
      return;
    }
    this.synth(speaker, text, priority, now);
  }

  private synth(speaker: Speaker, text: string, priority: number, now: number): void {
    if (!this.supported || this.voices.length === 0) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(spokenText(text));
      const voice = this.cast[speaker];
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? "ru-RU";
      const p = PROFILE[speaker];
      u.pitch = p.pitch;
      u.rate = p.rate;
      u.volume = p.volume;
      u.onend = () => { this.busyUntil = 0; this.currentPriority = -1; };
      this.currentPriority = priority;
      this.busyUntil = now + 600 + text.length * 70;
      window.speechSynthesis.speak(u);
    } catch { /* speech is optional */ }
  }

  line(_speaker: Speaker, group: keyof typeof LINES, priority = 1): void {
    const options = LINES[group];
    this.say(LINE_SPEAKER[group], options[Math.floor(Math.random() * options.length)], priority);
  }

  stop(): void {
    if (this.supported) window.speechSynthesis.cancel();
    try { this.current?.stop(); } catch { /* already stopped */ }
    this.current = null;
    this.busyUntil = 0;
    this.currentPriority = -1;
  }
}

export const voice = new VoiceBox();
