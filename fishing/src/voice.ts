/**
 * Voice lines through the browser's built-in speech synthesis (free, offline
 * on phones, no audio files). Three "actors" are told apart by voice choice,
 * pitch and pace. If the device has no Russian voice, the game stays silent.
 */
export type Speaker = "hero" | "tolik" | "announcer";

const PROFILE: Record<Speaker, { pitch: number; rate: number; volume: number }> = {
  hero: { pitch: 1.05, rate: 1.1, volume: 0.95 },
  tolik: { pitch: 0.55, rate: 0.98, volume: 1 },
  announcer: { pitch: 1.25, rate: 1.18, volume: 1 },
};

const MALE = /(yuri|юрий|pavel|павел|dmitri|дмитрий|maxim|максим|aleksandr|александр|male|муж)/i;
const FEMALE = /(milena|милена|irina|ирина|katya|катя|elena|елена|anna|анна|svetlana|female|жен)/i;

export const LINES = {
  bite: ["Клюёт! Подсекай!", "Поклёвка! Подсекай!", "Клюёт, клюёт!"],
  hooked: ["Есть!", "Сидит!", "Держу!"],
  catch: ["Ну наконец-то!", "Иди сюда, родимая!", "Вот это я понимаю!", "Ха! Видал?"],
  snap: ["Да ёлки-палки!", "Сошла, зараза!", "Ну как так-то?!"],
  missed: ["Прозевал…", "Да чтоб тебя!"],
  early: ["Рано…", "Тьфу ты."],
  beer: ["Ну, за рыбалку!", "Холодненькое…", "Так, по одной."],
  hic: ["Ик.", "Ик! Пардон."],
  smoke: ["Перекур.", "Так. Спокойно. Дышим."],
  stolen: ["Хе-хе. Никто не видел.", "Своя рыба, своя."],
  sleep: ["Хррр…"],
  wake: ["А? Что? Я не сплю!"],
  meltdown: ["Да пошло оно всё!!!"],
  rageWarning: ["Внимание! Злость на критическом уровне!", "Опасность! Нервы на пределе!"],
  phone: ["Так, что там в ленте…"],
};

class VoiceBox {
  private enabled = true;
  private voices: SpeechSynthesisVoice[] = [];
  private cast: Partial<Record<Speaker, SpeechSynthesisVoice>> = {};
  private currentPriority = -1;
  private busyUntil = 0;

  constructor() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => this.pickVoices();
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
  }

  get supported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  get hasRussian(): boolean {
    return this.voices.length > 0;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on && this.supported) window.speechSynthesis.cancel();
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
    // Two different male voices when the device has them; pitch does the rest.
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
    if (!this.enabled || !this.supported || this.voices.length === 0) return;
    const now = performance.now();
    if (now < this.busyUntil && priority <= this.currentPriority) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.toLowerCase().replace(/ё/g, "ё"));
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

  line(speaker: Speaker, key: keyof typeof LINES, priority = 1): void {
    const options = LINES[key];
    this.say(speaker, options[Math.floor(Math.random() * options.length)], priority);
  }

  stop(): void {
    if (this.supported) window.speechSynthesis.cancel();
    this.busyUntil = 0;
    this.currentPriority = -1;
  }
}

export const voice = new VoiceBox();
