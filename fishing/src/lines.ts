/**
 * Every spoken line in the game, in one place. The voice generator script
 * reads this file to pre-record lines (e.g. with ElevenLabs) and the game
 * finds each recording by the same key. Pure data: no DOM.
 */
import { BASE_TAUNTS, HAZARD_TEXT, LEVELS } from "./content.ts";
export type Speaker = "hero" | "tolik" | "announcer";

export const TAUNTS = [
  "ОПА! ЕЩЁ ОДИН!", "ТУТ МЕСТО ЗНАТЬ НАДО", "ДЕРЖИ, ПОКАЖУ КАК НАДО", "ЧЁ, НЕ КЛЮЁТ? ХЕ-ХЕ", "СЕДЬМОЙ… ИЛИ ВОСЬМОЙ?",
  "МОЖЕТ, НАЖИВКУ ПОМЕНЯЕШЬ?", "ИДИ СЮДА, ТУТ НА ВСЕХ ХВАТИТ", "У МЕНЯ ДЕД ТАК ЖЕ ЛОВИЛ", "О, ТЯЖЁЛЕНЬКИЙ!",
];

export const DISTRACT_LINES: Record<"phone" | "bushes" | "stretch", string[]> = {
  phone: ["АЛЛО? ДА, КЛЮЁТ КАК БЕШЕНАЯ!", "ЗАЙ, Я НА РАБОТЕ… НУ ПОЧТИ"],
  bushes: ["Я В КУСТЫ. СЛЕДИ ЗА УДОЧКОЙ", "ЩАС ПРИДУ, НЕ ТРОГАЙ НИЧЕГО"],
  stretch: ["ЭЭЭХ, СПИНА…", "ХОРОШО СИДИМ!"],
};

export const TOLIK = {
  hello: "НУ ЧТО, КТО БОЛЬШЕ ПОЙМАЕТ?",
  day2: "ВЧЕРА РАЗМИНКА БЫЛА",
  day3: "СЕГОДНЯ Я СОМА ВОЗЬМУ, ЧУЮ",
  early: "НЕ ТОРОПИСЬ, ХЕ-ХЕ",
  small: "МАЛЁК! ОТПУСТИ, ПУСТЬ ПОДРАСТЁТ",
  catfish: "СО-О-ОМ!!! ВИДАЛ?!",
  caught: "Э! ТЫ ЧЁ, МОЮ РЫБУ?!",
  wake: "С ДОБРЫМ УТРОМ! ГЛЯНЬ, СКОЛЬКО У МЕНЯ",
  splash: "…ВОТ ЭТО ПОЙМАЛ",
  king: "ЦАРЬ-СОМ!!! НА КОЛЕНИ, СМЕРТНЫЙ!",
  junk: "О! ГАЛОШУ ПОЙМАЛ? В ПАРУ К ПЕРВОЙ",
  fell: "…НУ, ЛЁД ПРОВЕРИЛ. ТОНКИЙ",
  fine: "ПЛАТИ, БРАКОНЬЕР! ХЕ-ХЕ",
};

export const ANNOUNCER = {
  days: ["День первый. Суббота.", "День второй. Воскресенье.", "День третий. Понедельник. Отгул."],
  dayEnd: "День окончен.",
  won: "Рыбалка окончена. Нервы выдержали.",
  levelWon: "Уровень пройден. Толик в бешенстве.",
  levelLost: "Провал. Толик доволен.",
  champion: "Чемпион области! Толик плачет в панаму.",
  fell: "Человек под лёд!",
};

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
  junk: ["Это что за хрень?!", "Ну хоть не пустой…"],
  escaped: ["Ушла!", "Да твою ж налево!"],
  snag: ["Зацеп. Опять коряга.", "Да чтоб тебя, зацеп!"],
  fine: ["За что?!", "Командир, это не моё!"],
  call: ["Да, дорогая. Копаю. Картошку."],
  fell: ["А-а-а! Холодно!"],
};

/** Which actor says each LINES group. */
export const LINE_SPEAKER: Record<keyof typeof LINES, Speaker> = {
  bite: "announcer", rageWarning: "announcer",
  junk: "hero", escaped: "hero", snag: "hero", fine: "hero", call: "hero", fell: "hero",
  hooked: "hero", catch: "hero", snap: "hero", missed: "hero", early: "hero", beer: "hero", hic: "hero",
  smoke: "hero", stolen: "hero", sleep: "hero", wake: "hero", meltdown: "hero",
};

/** Stable file key for a line: speaker + FNV-1a hash of the exact text. */
export function voiceKey(speaker: Speaker, text: string): string {
  let h = 0x811c9dc5;
  const s = `${speaker}|${text}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${speaker}-${h.toString(16).padStart(8, "0")}`;
}

/** Bubble text is shouted in caps; recordings want normal sentence case. */
export function spokenText(text: string): string {
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/(^|[.!?…]\s+)([а-яёa-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

export function allLines(): Array<{ speaker: Speaker; text: string; key: string }> {
  const out: Array<{ speaker: Speaker; text: string }> = [];
  TAUNTS.forEach((text) => out.push({ speaker: "tolik", text }));
  Object.values(DISTRACT_LINES).flat().forEach((text) => out.push({ speaker: "tolik", text }));
  Object.values(TOLIK).forEach((text) => out.push({ speaker: "tolik", text }));
  BASE_TAUNTS.forEach((text) => out.push({ speaker: "tolik", text }));
  LEVELS.forEach((l) => {
    out.push({ speaker: "announcer", text: l.intro }, { speaker: "tolik", text: l.tolikIntro });
    l.taunts.forEach((text) => out.push({ speaker: "tolik", text }));
  });
  Object.values(HAZARD_TEXT).forEach((h) => { if (h.tolik) out.push({ speaker: "tolik", text: h.tolik }); });
  ANNOUNCER.days.forEach((text) => out.push({ speaker: "announcer", text }));
  (["dayEnd", "won", "levelWon", "levelLost", "champion", "fell"] as const).forEach((k) => out.push({ speaker: "announcer", text: ANNOUNCER[k] }));
  (Object.keys(LINES) as Array<keyof typeof LINES>).forEach((group) =>
    LINES[group].forEach((text) => out.push({ speaker: LINE_SPEAKER[group], text })));
  const seen = new Set<string>();
  return out
    .map((l) => ({ ...l, key: voiceKey(l.speaker, l.text) }))
    .filter((l) => (seen.has(l.key) ? false : (seen.add(l.key), true)));
}
