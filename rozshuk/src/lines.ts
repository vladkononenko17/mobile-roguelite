/**
 * Every spoken line in «Розшук». `text` is what the game shows (and how a
 * line is looked up: any shown string that contains it plays it); `say` is
 * the prompt for recording, with ElevenLabs v4 direction tags. Recordings
 * live in public/rozshuk/voice/<id>.mp3; missing ones fall back to the
 * device's speech synthesis.
 */

export type Cast = "officer" | "babka" | "hero" | "arkadiy" | "molfar" | "hr" | "clerk" | "guard";

export interface Line { id: string; who: Cast; text: string; say: string }

export const CAST_VOICE: Record<Cast, { name: string; voiceId: string }> = {
  officer: { name: "Taras Vovk — Tactical Game NPC", voiceId: "11JUpgNlQsWfppULB2T8" },
  babka: { name: "Horpyna — Village Witch and Trickster", voiceId: "upV1WVQQOkwfYxJITYqG" },
  hero: { name: "Adrian H.", voiceId: "vUZbo4a4aVWCFt2ZCOXF" },
  arkadiy: { name: "Maks Tsukrenko — Confident Podcast", voiceId: "S80713fa2M70CssGEBj5" },
  molfar: { name: "Pavlo — Warm Ukrainian Baritone", voiceId: "5nGIpKQWEmhylnRK4h9b" },
  hr: { name: "Yaryna Lisova — Natural Conversation", voiceId: "JOQst3wrnXwBfeTEW2ts" },
  clerk: { name: "Veselyna — Bold, Strong and Confident", voiceId: "4m9JlYe3SXVOj4qPhtRN" },
  guard: { name: "Ostap — Grim Monster Hunter", voiceId: "tsYZxMRqpm0LKWcugf1k" },
};

export const LINES: Line[] = [
  // ТЦК: spotting you
  { id: "tck-stop", who: "officer", text: "Стояти!", say: "[shouting] Стояти!" },
  { id: "tck-docs", who: "officer", text: "Чоловіче, ваші документи!", say: "[shouting] Чоловіче, ваші документи!" },
  { id: "tck-where", who: "officer", text: "Куди зібрався?", say: "[shouting] Куди зібрався?" },
  { id: "tck-hey", who: "officer", text: "Агов! Ти!", say: "[shouting] Агов! Ти!" },
  { id: "tck-halt", who: "officer", text: "Е, ну-ка стій!", say: "[shouting] Е, ну-ка стій!" },
  { id: "tck-young", who: "officer", text: "Молодий чоловік!", say: "[shouting] Молодий чоловік!" },
  // ТЦК: lost you
  { id: "tck-lost1", who: "officer", text: "Та де він…", say: "[annoyed, out of breath] Та де він..." },
  { id: "tck-lost2", who: "officer", text: "Втік, падлюка", say: "[angry, out of breath] Втік, падлюка." },
  { id: "tck-lost3", who: "officer", text: "Ну нічого, ще побачимось", say: "[menacing, quietly] Ну нічого, ще побачимось." },
  { id: "tck-lost4", who: "officer", text: "Шукай-шукай…", say: "[muttering] Шукай-шукай..." },
  // ТЦК: heard something
  { id: "tck-huh1", who: "officer", text: "Хм?", say: "[suspicious] Хм?" },
  { id: "tck-huh2", who: "officer", text: "Шо там?", say: "[suspicious] Шо там?" },
  { id: "tck-huh3", who: "officer", text: "Шось шурхнуло…", say: "[suspicious, quietly] Шось шурхнуло..." },
  { id: "tck-huh4", who: "officer", text: "Ану…", say: "[suspicious] Ану..." },
  // ТЦК: the grab and its outcomes
  { id: "tck-grab", who: "officer", text: "Попався!", say: "[triumphant, grabbing someone] Попався!" },
  { id: "tck-van", who: "officer", text: "В бус його!", say: "[shouting] В бус його!" },
  { id: "tck-bron", who: "officer", text: "Бронь? Покажіть оригінал…", say: "[skeptical] Бронь? Покажіть оригінал..." },
  { id: "tck-dog", who: "officer", text: "А де пес?", say: "[skeptical] А де пес?" },
  { id: "tck-remember", who: "officer", text: "Ну йди, але ми тебе запамʼятали", say: "[grudgingly] Ну йди. Але ми тебе запам'ятали." },
  { id: "tck-sorry", who: "officer", text: "Вибачте, вільні", say: "[reluctantly polite] Вибачте, вільні." },
  { id: "tck-dogok", who: "officer", text: "А, з собакою… Ну йди", say: "[sighs] А, з собакою... Ну йди." },
  { id: "tck-knock", who: "officer", text: "Відкривайте, ТЦК! Ми знаємо, що ви вдома", say: "[banging on a door, shouting] Відкривайте, ТЦК! Ми знаємо, що ви вдома!" },
  // babusias on benches
  { id: "babka-call", who: "babka", text: "Алло, Галю? Тут один ходить…", say: "[gossiping into a phone, old woman] Алло, Галю? Тут один ходить..." },
  { id: "babka-front", who: "babka", text: "Синку, а ти чого не на фронті?", say: "[nosy old woman] Синку, а ти чого не на фронті?" },
  { id: "babka-see", who: "babka", text: "Я все бачу!", say: "[old woman, shaking a finger] Я все бачу!" },
  // the hero
  { id: "me-caught", who: "hero", text: "Ні-ні-ні, я ж на удальонці!", say: "[panicked] Ні-ні-ні, я ж на удальонці!" },
  { id: "me-spotted", who: "hero", text: "Ой-йой…", say: "[scared, under his breath] Ой-йой..." },
  { id: "me-lost", who: "hero", text: "Фух… відірвався", say: "[relieved, out of breath] Фух... відірвався." },
  { id: "me-vault", who: "hero", text: "Опа!", say: "[effort, jumping] Опа!" },
  { id: "me-van", who: "hero", text: "Тікаю!!!", say: "[desperate shout] Тікаю!" },
  { id: "me-knock", who: "hero", text: "Пронесло…", say: "[whispering, relieved] Пронесло..." },
  // dialogues
  { id: "arkadiy-offer", who: "arkadiy", text: "Бронь, відрядження, виїзд. Усе по закону.", say: "[smooth, businesslike] Бронь, відрядження, виїзд. Усе по закону. Близько ста сімдесяти тисяч. Цікаво?" },
  { id: "arkadiy-found", who: "arkadiy", text: "Тихо! Не кричіть. За мною стежать.", say: "[whispering urgently] Тихо! Не кричіть. За мною стежать. Справи йдуть, але треба ще десять тисяч на ризики." },
  { id: "molfar-offer", who: "molfar", text: "Ліс, село, річка.", say: "[calm, a little amused] Ліс, село, річка. Шістдесят тисяч і твої ноги. Не страшно?" },
  { id: "hr-why", who: "hr", text: "Чому ви хочете працювати саме в нас?", say: "[friendly, professional] Чому ви хочете працювати саме в нас?" },
  { id: "clerk-data", who: "clerk", text: "Дата народження? Місце проживання?", say: "[bored, strict] Дата народження? Місце проживання? Чого не оновились вчасно?" },
  { id: "guard-purpose", who: "guard", text: "Мета виїзду?", say: "[stern border guard] Мета виїзду?" },
  { id: "guard-basis", who: "guard", text: "Підстава для перетину?", say: "[stern border guard] Підстава для перетину?" },
  { id: "guard-work", who: "guard", text: "Де працюєте?", say: "[stern border guard] Де працюєте?" },
];

/** The recorded line for something the game is about to show, if any. */
export function lineFor(shown: string): Line | undefined {
  const norm = (s: string) => s.replace(/[’']/g, "ʼ");
  const t = norm(shown);
  return LINES.find((l) => t.includes(norm(l.text)));
}
