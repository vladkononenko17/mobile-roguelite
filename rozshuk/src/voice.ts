/**
 * Spoken lines through the device's Ukrainian speech synthesis (iPhones ship
 * «Lesya», Android has Google uk-UA). Silent where no Ukrainian voice exists;
 * the speech bubbles always show the text anyway. Pre-recorded files can
 * replace this later.
 */

export type VoiceRole = "officer" | "babka" | "me" | "npc";

const PROFILE: Record<VoiceRole, { pitch: number; rate: number; volume: number; priority: number }> = {
  officer: { pitch: 0.6, rate: 1.12, volume: 1, priority: 2 },
  babka: { pitch: 1.45, rate: 1.05, volume: 0.9, priority: 1 },
  me: { pitch: 1.0, rate: 1.15, volume: 0.9, priority: 1 },
  npc: { pitch: 0.9, rate: 1.05, volume: 0.9, priority: 0 },
};

class Voice {
  private enabled = true;
  private uk: SpeechSynthesisVoice | null = null;
  private busyUntil = 0;
  private busyPriority = -1;

  constructor() {
    if (!this.supported) return;
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      this.uk = all.find((v) => /^uk/i.test(v.lang)) ?? null;
    };
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
  }

  get supported(): boolean { return typeof window !== "undefined" && "speechSynthesis" in window; }
  get available(): boolean { return !!this.uk; }
  get on(): boolean { return this.enabled; }
  set on(v: boolean) {
    this.enabled = v;
    try { localStorage.setItem("rozshuk-voice", v ? "1" : "0"); } catch { /* blocked */ }
    if (!v && this.supported) window.speechSynthesis.cancel();
  }

  load(): void {
    try { this.enabled = localStorage.getItem("rozshuk-voice") !== "0"; } catch { /* blocked */ }
  }

  /** iOS only speaks after a first utterance inside a user gesture. */
  unlock(): void {
    if (!this.supported || !this.uk) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    u.voice = this.uk;
    window.speechSynthesis.speak(u);
  }

  say(text: string, role: VoiceRole): void {
    if (!this.enabled || !this.supported || !this.uk) return;
    const p = PROFILE[role];
    const now = performance.now();
    if (now < this.busyUntil && p.priority <= this.busyPriority) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[«»…]/g, ""));
    u.voice = this.uk;
    u.lang = this.uk.lang;
    u.pitch = p.pitch;
    u.rate = p.rate;
    u.volume = p.volume;
    window.speechSynthesis.speak(u);
    this.busyUntil = now + 400 + text.length * 70;
    this.busyPriority = p.priority;
  }

  stop(): void { if (this.supported) window.speechSynthesis.cancel(); this.busyUntil = 0; }
}

export const voice = new Voice();
