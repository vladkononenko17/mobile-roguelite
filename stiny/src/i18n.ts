/**
 * Language for «Чотири стіни» / «Four Walls». Ukrainian is the original; the
 * English text sits next to it (inline `tr(uk, en)` in code, `content.en.ts`
 * for the data). Pure and DOM-free at import so the tests can load it.
 */

export type Lang = "uk" | "en";

const KEY = "stiny-lang-v1";
let lang: Lang = "uk";

export function getLang(): Lang { return lang; }
export function setLangValue(l: Lang): void { lang = l; }

/** The saved choice, else Ukrainian: the game is Ukrainian for everyone; English only if the player picks it. */
export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "uk" || saved === "en") return saved;
  } catch { /* storage blocked */ }
  return "uk";
}

export function saveLang(l: Lang): void {
  try { localStorage.setItem(KEY, l); } catch { /* storage blocked */ }
}

/** Picks the text for the current language. Works for strings and for arrays of lines. */
export function tr<T>(uk: T, en: T): T { return lang === "en" ? en : uk; }

/** Numbers with the right thousands separator. */
export function num(n: number): string {
  const v = Math.round(n);
  return lang === "en" ? v.toLocaleString("en-US") : v.toLocaleString("uk-UA").replace(/\s/g, "\u00a0");
}

// ------------------------------------------------------------------ names

/** Friends keep their Ukrainian names; in English they are transliterated. */
const NAME_EN: Record<string, string> = {
  Сашко: "Sashko", Діма: "Dima", Олег: "Oleh", Макс: "Max", Влад: "Vlad", Ігор: "Ihor", Тарас: "Taras", Андрій: "Andriy",
  Женя: "Zhenia", Богдан: "Bohdan", Костя: "Kostia", Сергій: "Serhiy", Юра: "Yura", Назар: "Nazar", Артем: "Artem", Микола: "Mykola",
};
const ROLE_EN: Record<string, string> = {
  однокласник: "classmate", колега: "colleague", "з універу": "from uni", "сусід по гуртожитку": "dorm roommate",
  "двоюрідний брат": "cousin", "з футболу": "from football", "друг дитинства": "childhood friend",
};

export function nameOf(f: { name: string }): string { return lang === "en" ? NAME_EN[f.name] ?? f.name : f.name; }
export function accOf(f: { name: string; acc: string }): string { return lang === "en" ? NAME_EN[f.name] ?? f.name : f.acc; }
export function roleOf(f: { role: string }): string { return lang === "en" ? ROLE_EN[f.role] ?? f.role : f.role; }
