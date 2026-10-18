/**
 * Game content for «Не клюёт»: ten locations, fishing methods, gear, fish and
 * the misery each place inflicts. Pure data so tests and tools can import it.
 */

export type Method = "float" | "feeder" | "spin" | "ice";
export type GearSlot = "rod" | "reel" | "bait";
export type Theme = "dacha" | "garages" | "quarry" | "night" | "plant" | "paid" | "ice" | "swamp" | "reserve" | "champ";
export type Hazard =
  | "wife" | "mosquito" | "gopniki" | "jetski" | "neighbors" | "dump" | "ashot" | "tolikCheat"
  | "iceCrack" | "leech" | "nadzor" | "crowd" | "drone";

export interface Stats {
  /** Bite window multiplier (float/feeder/ice hook timing). */
  window: number;
  /** Green zone multiplier for the float marker. */
  zone: number;
  /** Fight strength: how fast tension rises and fish come in. */
  power: number;
  /** Spinning retrieve speed. */
  retrieve: number;
  /** Bite frequency multiplier. */
  bite: number;
  /** Bias toward bigger fish (adds to the draw weight of size-3 fish). */
  size: number;
  /** Fewer fake nibbles (0..1 reduction). */
  fake: number;
}

export const BASE_STATS: Stats = { window: 1, zone: 1, power: 1, retrieve: 1, bite: 1, size: 0, fake: 0 };

export interface GearItem {
  id: string;
  slot: GearSlot;
  name: string;
  blurb: string;
  price: number;
  /** Level number (1-based) that must be reached before it is sold. */
  unlock: number;
  method?: Method;
  /** Only works with these methods (baits/lures). */
  methods?: Method[];
  stats: Partial<Stats>;
  icon: string;
}

export const GEAR: GearItem[] = [
  // ---- rods: a rod is a fishing method
  { id: "rod-bamboo", slot: "rod", method: "float", name: "БАМБУК ДЕДА", blurb: "Поплавочная. Пахнет гаражом и сорок седьмым годом.", price: 0, unlock: 1, stats: {}, icon: "🎋" },
  { id: "rod-tele", slot: "rod", method: "float", name: "ТЕЛЕСКОП ИЗ ФИКС-ПРАЙСА", blurb: "Поплавочная. Окно подсечки +25%. Складывается сама, в самый неподходящий момент.", price: 600, unlock: 2, stats: { window: 1.25 }, icon: "🎣" },
  { id: "rod-feeder", slot: "rod", method: "feeder", name: "ФИДЕР «КАРП-УБИЙЦА 3000»", blurb: "Донная ловля с кормушкой. Крупный лещ и карп. Подкармливай — иначе не клюёт.", price: 2500, unlock: 3, stats: { size: 1 }, icon: "🪝" },
  { id: "rod-spin", slot: "rod", method: "spin", name: "СПИННИНГ «ЩУКОДАВ»", blurb: "Активная ловля: крути, дёргай, вываживай хищника. Ленивым не подходит.", price: 4200, unlock: 5, stats: { size: 1 }, icon: "🐊" },
  { id: "rod-oligarch", slot: "rod", method: "float", name: "КАРБОН «ОЛИГАРХ»", blurb: "Поплавочная мечта. Окно +45%, рыба крупнее. Жена не должна узнать цену.", price: 9000, unlock: 6, stats: { window: 1.45, size: 1.5, zone: 1.15 }, icon: "💎" },
  { id: "rod-ice", slot: "rod", method: "ice", name: "ЗИМНЯЯ «МОРОЗКО»", blurb: "Мормышка для льда. Играй мормышкой — рыба любит ритм.", price: 0, unlock: 7, stats: {}, icon: "🧊" },
  { id: "rod-feeder-pro", slot: "rod", method: "feeder", name: "ФИДЕР «ПЕНСИЯ ПРОПАЛА»", blurb: "Фидер +60% к силе и крупной рыбе. Куплен вместо зимней резины.", price: 12000, unlock: 8, stats: { size: 2.5, power: 1.3 }, icon: "🦈" },
  // ---- reels
  { id: "reel-sovok", slot: "reel", name: "НЕВСКАЯ (СОВОК)", blurb: "Скрипит, как совесть Толика. Зато вечная.", price: 0, unlock: 1, stats: {}, icon: "⚙️" },
  { id: "reel-ali", slot: "reel", name: "ШИМАНО С АЛИЭКСПРЕССА", blurb: "Зелёная зона +25%, сила +10%. На коробке иероглифы и «SHIMANA».", price: 900, unlock: 2, stats: { zone: 1.25, power: 1.1 }, icon: "🧧" },
  { id: "reel-tlt", slot: "reel", name: "БАЙТКАСТЕР «ТОЛЬЯТТИ»", blurb: "Проводка +40%, сила +25%. Собран в гараже, работает на мате.", price: 3500, unlock: 4, stats: { retrieve: 1.4, power: 1.25, zone: 1.1 }, icon: "🚗" },
  { id: "reel-alimony", slot: "reel", name: "«МЕЧТА АЛИМЕНТЩИКА»", blurb: "Зона +50%, сила +50%. Стоит как три месяца алиментов.", price: 8500, unlock: 7, stats: { zone: 1.5, power: 1.5, retrieve: 1.25 }, icon: "💸" },
  // ---- baits & lures
  { id: "bait-bread", slot: "bait", name: "ХЛЕБНЫЙ МЯКИШ", blurb: "Вчерашний батон. Рыба тоже не в восторге.", price: 0, unlock: 1, stats: {}, icon: "🍞" },
  { id: "bait-maggot", slot: "bait", name: "ОПАРЫШ ИЗ ТУАЛЕТА НА ТРАССЕ", blurb: "Клёв +25%. Не спрашивай, где взяли.", price: 300, unlock: 2, methods: ["float", "feeder", "ice"], stats: { bite: 1.25, fake: 0.15 }, icon: "🪱" },
  { id: "bait-corn", slot: "bait", name: "КУКУРУЗА ИЗ БАНКИ", blurb: "Для фидера: крупный карп +, клёв +15%. Половину съел сам.", price: 700, unlock: 3, methods: ["feeder", "float"], stats: { bite: 1.15, size: 1 }, icon: "🌽" },
  { id: "bait-blood", slot: "bait", name: "МОТЫЛЬ БАБЫ НИНЫ", blurb: "Клёв +40%, пустых поклёвок меньше. Баба Нина знает, что делает.", price: 1300, unlock: 4, methods: ["float", "feeder", "ice"], stats: { bite: 1.4, fake: 0.35 }, icon: "🧶" },
  { id: "lure-vasya", slot: "bait", name: "ВОБЛЕР «КИСЛОТНЫЙ ВАСЯ»", blurb: "Для спиннинга: поклёвки +50%. Светится в темноте и в анализах.", price: 2000, unlock: 5, methods: ["spin"], stats: { bite: 1.5 }, icon: "🧪" },
  { id: "lure-spoon", slot: "bait", name: "БЛЕСНА ИЗ ЛОЖКИ ТЁЩИ", blurb: "Спиннинг: крупная щука +, поклёвки +30%. Тёща ищет ложку.", price: 3800, unlock: 6, methods: ["spin"], stats: { bite: 1.3, size: 2 }, icon: "🥄" },
];

export const STARTER_GEAR = { rod: "rod-bamboo", reel: "reel-sovok", bait: "bait-bread" };

export interface FishInfo {
  kg: [number, number];
  size: 1 | 2 | 3;
  /** Rubles per kg at the market (or what the neighbour pays). */
  price: number;
  look: "fish" | "long" | "cat" | "junk";
  color: number;
  /** Junk catches cost rage instead of calming you down. */
  junk?: boolean;
}

export const FISH: Record<string, FishInfo> = {
  "ЁРШ": { kg: [0.03, 0.08], size: 1, price: 60, look: "fish", color: 0xa58d5c },
  "ПЛОТВА": { kg: [0.08, 0.3], size: 1, price: 90, look: "fish", color: 0xd7dde0 },
  "УКЛЕЙКА": { kg: [0.02, 0.06], size: 1, price: 40, look: "fish", color: 0xe8eef0 },
  "ОКУНЬ": { kg: [0.15, 0.6], size: 1, price: 180, look: "fish", color: 0x9cbc4a },
  "КАРАСЬ": { kg: [0.3, 0.9], size: 2, price: 150, look: "fish", color: 0xe7b84a },
  "ЛЕЩ": { kg: [0.8, 2.4], size: 2, price: 200, look: "fish", color: 0xc4a067 },
  "КАРП": { kg: [1.5, 5], size: 3, price: 260, look: "fish", color: 0xd99a3a },
  "ЩУКА": { kg: [1.5, 6], size: 3, price: 300, look: "long", color: 0x7fa04a },
  "СУДАК": { kg: [1.2, 4], size: 3, price: 450, look: "long", color: 0xaab7a4 },
  "СОМ": { kg: [6, 18], size: 3, price: 350, look: "cat", color: 0x6b6f5a },
  "РОТАН": { kg: [0.05, 0.25], size: 1, price: 10, look: "fish", color: 0x4b4a33 },
  "ОКУНЬ-МУТАНТ": { kg: [0.6, 1.8], size: 2, price: 50, look: "fish", color: 0x6fe04a },
  "ТРЁХГЛАЗЫЙ КАРАСЬ": { kg: [0.8, 2.2], size: 2, price: 40, look: "fish", color: 0xc9f04a },
  "ЦАРЬ-СОМ": { kg: [25, 40], size: 3, price: 400, look: "cat", color: 0x3f4434 },
  // junk
  "ГАЛОША": { kg: [0.3, 0.3], size: 1, price: 0, look: "junk", color: 0x2a2a2a, junk: true },
  "ПАКЕТ-МАЙКА": { kg: [0.01, 0.01], size: 1, price: 0, look: "junk", color: 0xe7ddc6, junk: true },
  "ПУСТАЯ «БАЛТИКА»": { kg: [0.2, 0.2], size: 1, price: 0, look: "junk", color: 0x3f7a4a, junk: true },
  "ПОКРЫШКА": { kg: [6, 6], size: 3, price: 0, look: "junk", color: 0x1f1f1f, junk: true },
};

/** What each method tends to bring up. [species, draw weight] */
export const METHOD_POOL: Record<Method, Array<[string, number]>> = {
  float: [["ЁРШ", 4], ["ПЛОТВА", 5], ["УКЛЕЙКА", 3], ["ОКУНЬ", 3], ["КАРАСЬ", 2.5], ["ЛЕЩ", 0.8], ["КАРП", 0.25]],
  feeder: [["ПЛОТВА", 2], ["КАРАСЬ", 3], ["ЛЕЩ", 4], ["КАРП", 1.6], ["СОМ", 0.15]],
  spin: [["ОКУНЬ", 4], ["ЩУКА", 2.5], ["СУДАК", 1.3], ["СОМ", 0.25]],
  ice: [["ЁРШ", 4], ["ПЛОТВА", 3], ["ОКУНЬ", 4], ["ЛЕЩ", 0.7], ["СУДАК", 0.3]],
};

export const FRIEND_POOL: Array<[string, number]> = [["ПЛОТВА", 2], ["ОКУНЬ", 3], ["КАРАСЬ", 4], ["ЛЕЩ", 4], ["КАРП", 1.4], ["СУДАК", 1.1], ["ЩУКА", 1], ["СОМ", 0.12]];

export interface Level {
  id: number;
  name: string;
  place: string;
  theme: Theme;
  /** One-line pitch shown on the map. */
  blurb: string;
  length: number;
  friendEvery: [number, number];
  /** Kg needed to pass. */
  target: number;
  /** Final: you must also out-fish Tolik. */
  mustBeatTolik?: boolean;
  rageMult: number;
  hazards: Array<[Hazard, number]>;
  /** Extra species (junk, mutants, local specials) mixed into every method. */
  extra: Array<[string, number]>;
  friendExtra?: Array<[string, number]>;
  /** Forces a method (ice = only the ice rod works). */
  forceMethod?: Method;
  /** Methods that make no sense here. */
  noMethods?: Method[];
  cold?: boolean;
  intro: string;
  tolikIntro: string;
  taunts: string[];
}

export const LEVELS: Level[] = [
  {
    id: 1, name: "ПРУД У ДАЧИ", place: "Дача тёщи, СНТ «Рассвет»", theme: "dacha",
    blurb: "Тёща считает, что ты копаешь картошку.", length: 70, friendEvery: [9, 13], target: 1, rageMult: 1,
    hazards: [["mosquito", 0.4]], extra: [["ГАЛОША", 0.4]], intro: "Уровень один. Пруд у дачи.",
    tolikIntro: "НУ ЧТО, КТО БОЛЬШЕ ПОЙМАЕТ?",
    taunts: ["ТУТ МЕСТО ЗНАТЬ НАДО", "У ТЕБЯ ДАЖЕ ЛЯГУШКА НЕ КЛЮНЕТ", "ТЁЩА ЛОВИТ ЛУЧШЕ ТЕБЯ"],
  },
  {
    id: 2, name: "РЕЧКА ЗА ГАРАЖАМИ", place: "ГСК «Мотор», за 14-м боксом", theme: "garages",
    blurb: "Тут пахнет бензином, рыбой и проблемами.", length: 75, friendEvery: [8, 12], target: 1.5, rageMult: 1.05,
    hazards: [["gopniki", 0.6], ["wife", 0.5]], extra: [["ПУСТАЯ «БАЛТИКА»", 0.8], ["ПАКЕТ-МАЙКА", 0.6]], intro: "Уровень два. Речка за гаражами.",
    tolikIntro: "ТУТ ВОДА ЧИСТАЯ. ПОЧТИ",
    taunts: ["ТЫ БУТЫЛКИ ЛОВИШЬ ИЛИ РЫБУ?", "ДАЖЕ ГАРАЖНЫЕ ЛОВЯТ БОЛЬШЕ", "МОЖЕТ, ТЕБЕ ЛУЧШЕ МАШИНУ ЧИНИТЬ?"],
  },
  {
    id: 3, name: "КАРЬЕР «ГОЛУБАЯ ЛАГУНА»", place: "Песчаный карьер, 40 км по трассе", theme: "quarry",
    blurb: "Мажоры на гидроциклах, а ты с фидером.", length: 80, friendEvery: [7.5, 11], target: 2.5, rageMult: 1.1,
    hazards: [["jetski", 0.7], ["wife", 0.5]], extra: [["КАРП", 0.6]], intro: "Уровень три. Карьер. Голубая лагуна.",
    tolikIntro: "ФИДЕР ВЗЯЛ? НУ ТЫ ОЛИГАРХ",
    taunts: ["ФИДЕР КУПИЛ, А РУКИ НЕ КУПИЛ", "ГИДРОЦИКЛ ПОЙМАЛ БОЛЬШЕ ТЕБЯ", "КАРП ТЕБЯ ЗА ЛОХА ДЕРЖИТ"],
  },
  {
    id: 4, name: "НОЧЬ У КОСТРА", place: "Остров на Волге, без связи", theme: "night",
    blurb: "Комары размером с воробья и соседи с гитарой.", length: 85, friendEvery: [7, 10], target: 3, rageMult: 1.12,
    hazards: [["mosquito", 1.3], ["neighbors", 0.7]], extra: [["СОМ", 0.25]], intro: "Уровень четыре. Ночь у костра.",
    tolikIntro: "НОЧЬЮ ОНА ДУРНАЯ, САМА ЛЕЗЕТ",
    taunts: ["ДАЖЕ В ТЕМНОТЕ ВИДНО, ЧТО ТЫ ЛОХ", "КОМАРЫ ПОЙМАЛИ БОЛЬШЕ, ЧЕМ ТЫ", "ПОДКИНЬ ДРОВ, ХОТЬ КАКАЯ-ТО ПОЛЬЗА"],
  },
  {
    id: 5, name: "СБРОС ГРЭС", place: "Тёплый канал у электростанции", theme: "plant",
    blurb: "Вода +28 круглый год. Рыба светится.", length: 85, friendEvery: [6.5, 10], target: 4, rageMult: 1.15,
    hazards: [["dump", 0.7], ["drone", 0.5]], extra: [["ОКУНЬ-МУТАНТ", 2], ["ТРЁХГЛАЗЫЙ КАРАСЬ", 1.5]],
    friendExtra: [["ОКУНЬ-МУТАНТ", 1]], intro: "Уровень пять. Сброс ГРЭС.",
    tolikIntro: "ЕШЬ, НЕ БОЙСЯ. У МЕНЯ ДЕД ЕЛ, ДО СОРОКА ДОЖИЛ",
    taunts: ["У ТВОЕЙ РЫБЫ ТРИ ГЛАЗА, А У ТЕБЯ НИ ОДНОЙ", "ДАЖЕ МУТАНТЫ ТЕБЯ ИГНОРЯТ", "СПИННИНГ — НЕ ВЕНИК, ИМ НЕ МАШУТ"],
  },
  {
    id: 6, name: "ПЛАТНИК «У АШОТА»", place: "Платный пруд, 1500 ₽ за вход", theme: "paid",
    blurb: "Рыбы полно. Совести у Толика — нет.", length: 90, friendEvery: [6, 9], target: 5, rageMult: 1.18,
    hazards: [["ashot", 0.8], ["tolikCheat", 0.6]], extra: [["КАРП", 1.5]], intro: "Уровень шесть. Платник у Ашота.",
    tolikIntro: "ТУТ ЗА ДЕНЬГИ ВСЁ ЛОВИТСЯ. У ТЕБЯ ДЕНЕГ НЕТ",
    taunts: ["ДАЖЕ ЗА ДЕНЬГИ НЕ КЛЮЁТ? ДИАГНОЗ", "АШОТ ГОВОРИТ, ТЫ ЕГО РЫБУ ПУГАЕШЬ", "ЗАПЛАТИЛ ПОЛТОРЫ ТЫЩИ, ЧТОБЫ ПОСИДЕТЬ"],
  },
  {
    id: 7, name: "ЗИМНИК НА ВОДОХРАНИЛИЩЕ", place: "Лёд 12 сантиметров. Наверное", theme: "ice",
    blurb: "Минус двадцать. Пиво греет. Лёд трещит.", length: 90, friendEvery: [6, 9], target: 3, rageMult: 1.2,
    hazards: [["iceCrack", 0.6], ["mosquito", 0]], extra: [], forceMethod: "ice", cold: true, intro: "Уровень семь. Зимник.",
    tolikIntro: "НЕ ПРЫГАЙ ТОЛЬКО. ХОТЯ ПРЫГАЙ",
    taunts: ["У ТЕБЯ ЛУНКА ИЛИ ОБИДА?", "ТЫ ИГРАЕШЬ МОРМЫШКОЙ, КАК НА БАЯНЕ ПЬЯНЫЙ", "ЗАМЁРЗНЕШЬ — ВЕСНОЙ НАЙДУТ"],
  },
  {
    id: 8, name: "БОЛОТО «ГНИЛОЙ УГОЛ»", place: "Куда навигатор не советует", theme: "swamp",
    blurb: "Пиявки, ротаны и запах безысходности.", length: 90, friendEvery: [5.5, 8.5], target: 5, rageMult: 1.25,
    hazards: [["leech", 0.9], ["mosquito", 0.8]], extra: [["РОТАН", 4], ["ПОКРЫШКА", 0.5]], intro: "Уровень восемь. Болото.",
    tolikIntro: "ТУТ ЩУКИ ПО ДЕСЯТЬ КИЛО. МНЕ ГОВОРИЛИ",
    taunts: ["РОТАН — ЭТО ТВОЙ ПОТОЛОК", "ПИЯВКИ ТЕБЯ ЛЮБЯТ, А РЫБА НЕТ", "ТЫ ЛОВИШЬ, КАК БУДТО ТЕБЯ ЗАСТАВЛЯЮТ"],
  },
  {
    id: 9, name: "ЗАПОВЕДНИК", place: "Табличка «ЛОВ ЗАПРЕЩЁН» прострелена", theme: "reserve",
    blurb: "Рыба непуганая. Рыбнадзор — пуганый, злой.", length: 95, friendEvery: [5, 8], target: 7, rageMult: 1.3,
    hazards: [["nadzor", 1.1], ["drone", 0.5]], extra: [["СУДАК", 1], ["ЩУКА", 1]], intro: "Уровень девять. Заповедник.",
    tolikIntro: "ЕСЛИ ЧТО — ТЫ МЕНЯ НЕ ЗНАЕШЬ",
    taunts: ["РЫБНАДЗОР ЛОВИТ ЛУЧШЕ ТЕБЯ. ТЕБЯ ЛОВИТ", "ТУТ РЫБА САМА В ЛОДКУ ПРЫГАЕТ. КРОМЕ ТВОЕЙ", "ПОСАДЯТ ЗА БРАКОНЬЕРСТВО, А У ТЕБЯ НОЛЬ"],
  },
  {
    id: 10, name: "ЧЕМПИОНАТ ОБЛАСТИ", place: "Городской пляж, прямой эфир", theme: "champ",
    blurb: "Финал. Камеры, толпа, Толик в новой панаме.", length: 100, friendEvery: [5.5, 8], target: 6, mustBeatTolik: true, rageMult: 1.35,
    hazards: [["crowd", 1], ["wife", 0.4], ["drone", 0.6]], extra: [["КАРП", 0.8], ["ЩУКА", 0.5]], friendExtra: [["ЦАРЬ-СОМ", 0.12]],
    intro: "Финал. Чемпионат области по ловле рыбы.",
    tolikIntro: "ВСЮ ЖИЗНЬ К ЭТОМУ ШЁЛ. СЕЙЧАС Я ТЕБЯ УНИЧТОЖУ",
    taunts: ["МАМ, СМОТРИ, Я ПО ТЕЛЕВИЗОРУ, А ОН ЛОХ!", "ТОЛПА ЗА МЕНЯ, ДАЖЕ ТВОЯ ЖЕНА", "ПОБЕДИТЕЛЬ ТОЛЬКО ОДИН. И ЭТО НЕ ТЫ"],
  },
];

export const BASE_TAUNTS = [
  "ОПА! ЕЩЁ ОДИН!", "ЧЁ, НЕ КЛЮЁТ? ХЕ-ХЕ", "СЕДЬМОЙ… ИЛИ ВОСЬМОЙ?", "МОЖЕТ, НАЖИВКУ ПОМЕНЯЕШЬ?",
  "ИДИ СЮДА, ТУТ НА ВСЕХ ХВАТИТ", "О, ТЯЖЁЛЕНЬКИЙ!", "МОЖЕТ, ТЕБЕ В МАГАЗИН ЗА РЫБОЙ?", "РУКИ-КРЮКИ, А КРЮЧОК ПРЯМОЙ",
];

/** What each hazard does to you, in words (toast) and to the friend (bubble). */
export const HAZARD_TEXT: Record<Hazard, { toast: string; tolik?: string }> = {
  wife: { toast: "📞 ЖЕНА: «ТЫ ГДЕ, СКОТИНА? КАРТОШКА САМА СЕБЯ ВЫКОПАЕТ?»", tolik: "ПЕРЕДАВАЙ ПРИВЕТ, ПОДКАБЛУЧНИК" },
  mosquito: { toast: "🦟 КОМАРЫ ЖРУТ! КУРЕВО ИХ ОТГОНЯЕТ" },
  gopniki: { toast: "🧢 ПАЦАНЫ С РАЙОНА ОТЖАЛИ ПИВО", tolik: "ЗДАРОВА, МУЖИКИ! ЭТО ЕГО, НЕ МОЁ" },
  jetski: { toast: "🚤 МАЖОР НА ГИДРОЦИКЛЕ РАСПУГАЛ ВСЮ РЫБУ" },
  neighbors: { toast: "🎸 СОСЕДИ ОРУТ «ГРУППУ КРОВИ». ТРЕТИЙ РАЗ", tolik: "О, МОЯ ЛЮБИМАЯ! КРОВЬ НА РУКАВЕ!" },
  dump: { toast: "🏭 СБРОС ВОДЫ! РЫБА УШЛА НА ГЛУБИНУ" },
  ashot: { toast: "👮 АШОТ: «СО СВОИМ ПИВОМ НЕЛЬЗЯ, ДОРОГОЙ! ШТРАФ 300»" },
  tolikCheat: { toast: "💸 ТОЛИК КУПИЛ У АШОТА ДВУХ КАРПОВ И ВЫДАЁТ ЗА СВОИХ", tolik: "ЧЕСТНО ПОЙМАЛ! АШОТ, ПОДТВЕРДИ" },
  iceCrack: { toast: "⚠️ ЛЁД ТРЕЩИТ… ТЫ ТЯЖЕЛЕЕШЬ ОТ ПИВА" },
  leech: { toast: "🩸 ПИЯВКА НА НОГЕ. ТРЕТЬЯ ЗА ЧАС" },
  nadzor: { toast: "🚨 РЫБНАДЗОР НА ЛОДКЕ! НЕ ПЕЙ И НЕ ТЫРЬ", tolik: "КОМАНДИР, ЭТО ВСЁ ОН!" },
  crowd: { toast: "📣 ТОЛПА СКАНДИРУЕТ: «ТО-ЛИК! ТО-ЛИК!»" },
  drone: { toast: "🛸 БЛОГЕР ЗАПУСТИЛ ДРОН. РЫБА НЕРВНИЧАЕТ, ТЫ ТОЖЕ" },
};

export const MONEY_PER_STAR = 150;

export function levelById(id: number): Level {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, id - 1))];
}

export function gearById(id: string): GearItem | undefined {
  return GEAR.find((g) => g.id === id);
}

/** Combine the equipped items into one stat block. */
export function combineStats(ids: string[], method: Method): Stats {
  const s: Stats = { ...BASE_STATS };
  for (const id of ids) {
    const g = gearById(id);
    if (!g) continue;
    if (g.methods && !g.methods.includes(method)) continue;
    const st = g.stats;
    s.window *= st.window ?? 1;
    s.zone *= st.zone ?? 1;
    s.power *= st.power ?? 1;
    s.retrieve *= st.retrieve ?? 1;
    s.bite *= st.bite ?? 1;
    s.size += st.size ?? 0;
    s.fake = Math.min(0.8, s.fake + (st.fake ?? 0));
  }
  return s;
}
