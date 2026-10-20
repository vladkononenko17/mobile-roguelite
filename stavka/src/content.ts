/**
 * «Ставка» — everything the rules read: places, threats, air defence, targets,
 * weapons, allies, decisions, perks and advisors. Pure data plus a couple of
 * helpers, no DOM, so the simulation and the tests can import it.
 *
 * Positions are lon/lat; the simulation works in kilometres on a flat map
 * centred on 32°E 48°N (`km()`), which is close enough at this scale.
 * Ranges, speeds and probabilities are game numbers, not real specifications.
 */

export const LON0 = 32;
export const LAT0 = 48;
const KX = Math.cos((LAT0 * Math.PI) / 180) * 111.32;
const KY = 110.57;
export interface Km { x: number; y: number }
export const km = (lon: number, lat: number): Km => ({ x: (lon - LON0) * KX, y: (lat - LAT0) * KY });
export const lonlat = (p: Km): [number, number] => [p.x / KX + LON0, p.y / KY + LAT0];
export const dist = (a: Km, b: Km) => Math.hypot(a.x - b.x, a.y - b.y);

export const WEEKS = 16;
export const HOURS_PER_DAY = 4;

// ================================================================ Ukraine

export type SectorId =
  | "kyiv" | "chernihiv" | "sumy" | "kharkiv" | "poltava" | "dnipro" | "zaporizhzhia"
  | "kryvyi" | "mykolaiv" | "odesa" | "vinnytsia" | "lviv";

export interface SectorDef {
  id: SectorId;
  name: string;
  /** Genitive-ish label for lines like «удар по Харківщині». */
  region: string;
  city: [number, number];
  /** Where the power plant / substation sits. */
  power: [number, number];
  /** Defence industry (drone and missile workshops), 0..3. */
  industry: number;
  /** Population weight for morale. */
  pop: number;
  /** A strike-drone airstrip lives here. */
  strip?: boolean;
}

export const SECTORS: readonly SectorDef[] = [
  { id: "kyiv", name: "Київ", region: "Київщина", city: [30.52, 50.45], power: [30.2, 50.6], industry: 3, pop: 4, strip: false },
  { id: "chernihiv", name: "Чернігів", region: "Чернігівщина", city: [31.29, 51.5], power: [31.6, 51.35], industry: 0, pop: 1, strip: true },
  { id: "sumy", name: "Суми", region: "Сумщина", city: [34.8, 50.91], power: [34.5, 50.75], industry: 0, pop: 1, strip: true },
  { id: "kharkiv", name: "Харків", region: "Харківщина", city: [36.23, 49.99], power: [36.0, 49.85], industry: 2, pop: 3 },
  { id: "poltava", name: "Полтава", region: "Полтавщина", city: [34.55, 49.59], power: [33.4, 49.1], industry: 1, pop: 1, strip: true },
  { id: "dnipro", name: "Дніпро", region: "Дніпропетровщина", city: [35.05, 48.46], power: [34.6, 48.6], industry: 3, pop: 3 },
  { id: "zaporizhzhia", name: "Запоріжжя", region: "Запоріжжя", city: [35.14, 47.84], power: [35.05, 47.6], industry: 2, pop: 2 },
  { id: "kryvyi", name: "Кривий Ріг", region: "Криворіжжя", city: [33.39, 47.91], power: [33.1, 47.75], industry: 1, pop: 1 },
  { id: "mykolaiv", name: "Миколаїв", region: "Миколаївщина", city: [31.99, 46.97], power: [31.6, 47.1], industry: 1, pop: 1 },
  { id: "odesa", name: "Одеса", region: "Одещина", city: [30.73, 46.48], power: [30.5, 46.65], industry: 1, pop: 3, strip: true },
  { id: "vinnytsia", name: "Вінниця", region: "Вінниччина", city: [28.47, 49.23], power: [28.7, 49.0], industry: 1, pop: 1 },
  { id: "lviv", name: "Львів", region: "Львівщина", city: [24.03, 49.84], power: [24.4, 50.0], industry: 2, pop: 2 },
];
export const sectorById = (id: SectorId) => SECTORS.find((s) => s.id === id)!;

/**
 * The front line, north to south, as of the start of the run (game
 * simplification). Each point can be pushed west (enemy gains) or east (we
 * gain) along `dir`, in km; the simulation keeps one offset per point.
 */
export const FRONT: readonly { at: [number, number]; dir: [number, number] }[] = [
  { at: [37.95, 50.25], dir: [-0.75, -0.66] },
  { at: [37.75, 49.75], dir: [-0.9, -0.42] },
  { at: [37.95, 49.2], dir: [-0.95, -0.3] },
  { at: [37.9, 48.75], dir: [-0.97, -0.2] },
  { at: [37.35, 48.35], dir: [-0.95, -0.3] },
  { at: [37.05, 47.95], dir: [-0.85, 0.5] },
  { at: [36.5, 47.75], dir: [-0.6, 0.8] },
  { at: [35.9, 47.5], dir: [-0.4, 0.92] },
  { at: [35.25, 47.45], dir: [-0.25, 0.97] },
  { at: [34.55, 47.35], dir: [-0.1, 1] },
  { at: [33.7, 46.95], dir: [0.3, 0.95] },
  { at: [33.0, 46.7], dir: [0.3, 0.95] },
  { at: [32.35, 46.5], dir: [0.3, 0.95] },
  { at: [31.6, 46.42], dir: [0.4, 0.92] },
];
/** Behind-the-line corner points that close the occupied mask polygon (east and south of the front). */
export const OCCUPIED_BACK: readonly [number, number][] = [[31.2, 46.2], [31.0, 43.8], [44, 43.8], [44, 51.2], [38.6, 51.2]];

// ================================================================ threats

export type ThreatKind = "shahed" | "gerbera" | "kh101" | "kalibr" | "iskander" | "kinzhal";
export interface ThreatDef {
  kind: ThreatKind;
  name: string;
  short: string;
  /** km per game-second (a night is ~2 minutes of play). */
  speed: number;
  /** Cruising height for the picture, km-ish units. */
  alt: number;
  ballistic?: boolean;
  decoy?: boolean;
  /** Damage on arrival: power %, morale, industry. */
  dmg: { power: number; morale: number; industry: number };
}
export const THREATS: Record<ThreatKind, ThreatDef> = {
  shahed: { kind: "shahed", name: "Shahed-136", short: "Shahed", speed: 11, alt: 2.2, dmg: { power: 5, morale: 0.6, industry: 0.1 } },
  gerbera: { kind: "gerbera", name: "Гербера (приманка)", short: "Shahed?", speed: 11.5, alt: 2.2, decoy: true, dmg: { power: 0, morale: 0, industry: 0 } },
  kh101: { kind: "kh101", name: "Х-101", short: "Х-101", speed: 34, alt: 1.0, dmg: { power: 11, morale: 1.4, industry: 0.3 } },
  kalibr: { kind: "kalibr", name: "Калібр", short: "Калібр", speed: 36, alt: 1.0, dmg: { power: 10, morale: 1.4, industry: 0.3 } },
  iskander: { kind: "iskander", name: "Іскандер-М", short: "Іскандер", speed: 0, alt: 0, ballistic: true, dmg: { power: 8, morale: 2, industry: 0.5 } },
  kinzhal: { kind: "kinzhal", name: "Кинджал", short: "Кинджал", speed: 0, alt: 0, ballistic: true, dmg: { power: 12, morale: 2.2, industry: 0.6 } },
};

/** Where things are launched from. */
export const SHAHED_SITES: readonly [number, number][] = [[36.1, 51.8], [34.5, 52.85], [36.0, 52.95], [38.2, 46.05], [37.8, 48.0], [35.85, 45.0]];
export const KH101_SITES: readonly [number, number][] = [[44.8, 47.2], [45.5, 48.6], [43.5, 46.3]];
export const KALIBR_SITES: readonly [number, number][] = [[37.0, 44.15], [36.2, 44.0], [38.0, 44.3]];
export const ISKANDER_SITES: readonly [number, number][] = [[36.6, 50.6], [36.2, 51.6], [34.4, 45.3], [38.3, 47.4]];
export const KINZHAL_SITES: readonly [number, number][] = [[39.6, 52.6], [37.9, 46.6]];

// ================================================================ our air defence

export type AdKind = "patriot" | "samp" | "irist" | "nasams" | "gepard" | "mobile";
export interface AdDef {
  kind: AdKind;
  name: string;
  /** km */
  range: number;
  /** Missiles (or bursts) per night. */
  ammo: number;
  /** Seconds between shots. */
  reload: number;
  /** Fires on its own at what it can see (else only when tapped). */
  auto: boolean;
  /** Hit chance by threat (absent = cannot engage). */
  pk: Partial<Record<ThreatKind, number>>;
  /** Where it comes from; domestic units can be bought. */
  from: "domestic" | AllyId;
  color: number;
}
export const AD: Record<AdKind, AdDef> = {
  patriot: { kind: "patriot", name: "Patriot", range: 150, ammo: 8, reload: 1.4, auto: false, pk: { iskander: 0.82, kinzhal: 0.72, kh101: 0.92, kalibr: 0.92, shahed: 0.95, gerbera: 0.95 }, from: "usa", color: 0x4da3ff },
  samp: { kind: "samp", name: "SAMP/T", range: 130, ammo: 6, reload: 1.6, auto: false, pk: { iskander: 0.75, kinzhal: 0.6, kh101: 0.9, kalibr: 0.9, shahed: 0.92, gerbera: 0.92 }, from: "fr", color: 0x7aa7ff },
  irist: { kind: "irist", name: "IRIS-T SLM", range: 75, ammo: 8, reload: 1.0, auto: false, pk: { kh101: 0.88, kalibr: 0.88, shahed: 0.93, gerbera: 0.93 }, from: "de", color: 0x6fc8ff },
  nasams: { kind: "nasams", name: "NASAMS", range: 60, ammo: 6, reload: 1.0, auto: false, pk: { kh101: 0.85, kalibr: 0.85, shahed: 0.9, gerbera: 0.9 }, from: "usa", color: 0x8fd0ff },
  gepard: { kind: "gepard", name: "Gepard", range: 22, ammo: 30, reload: 0.5, auto: true, pk: { shahed: 0.45, gerbera: 0.45, kh101: 0.18, kalibr: 0.18 }, from: "de", color: 0xa6e07a },
  mobile: { kind: "mobile", name: "Мобільна вогнева група", range: 18, ammo: 40, reload: 0.45, auto: true, pk: { shahed: 0.33, gerbera: 0.33 }, from: "domestic", color: 0x6fd36a },
};
/** Interceptor drones: a global stock, launched from the nearest city at a tapped Shahed. */
export const INTERCEPTOR = { name: "Дрон-перехоплювач", pk: 0.72, range: 160, speed: 28 };

// ================================================================ our strike weapons

export type WeaponId = "liutyi" | "neptune" | "flamingo" | "storm" | "atacms";
export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** km */
  range: number;
  /** km per game-second in flight. */
  speed: number;
  /** How easily enemy air defence kills it (1 = a slow drone). */
  vuln: number;
  /** Hits it counts for against a target's hp. */
  power: number;
  from: "domestic" | AllyId;
  /** Domestic: budget per unit, $bn. */
  cost: number;
  blurb: string;
}
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  liutyi: { id: "liutyi", name: "Лютий", range: 1400, speed: 22, vuln: 1, power: 1, from: "domestic", cost: 0.05, blurb: "Далекобійний дрон: дешевий, повільний, багато збивають." },
  neptune: { id: "neptune", name: "Довгий Нептун", range: 1000, speed: 60, vuln: 0.45, power: 3, from: "domestic", cost: 0.35, blurb: "Крилата ракета: дорожча, пробиває середню ППО." },
  flamingo: { id: "flamingo", name: "Фламінго", range: 3000, speed: 55, vuln: 0.4, power: 6, from: "domestic", cost: 0.6, blurb: "Важка крилата ракета великої дальності." },
  storm: { id: "storm", name: "Storm Shadow", range: 260, speed: 65, vuln: 0.3, power: 4, from: "uk", cost: 0, blurb: "Від Британії. По території РФ — лише з дозволу." },
  atacms: { id: "atacms", name: "ATACMS", range: 300, speed: 140, vuln: 0.15, power: 3, from: "usa", cost: 0, blurb: "Від США. По території РФ — лише з дозволу." },
};
/** A decoy drone flies ahead of a strike and soaks up enemy air defence. */
export const DECOY = { name: "Приманка", cost: 0.015 };

// ================================================================ targets in Russia / occupied land

export type TargetKind = "refinery" | "airbase" | "depot" | "factory" | "port" | "radar" | "bridge" | "rail" | "launchers";
export interface TargetDef {
  id: string;
  name: string;
  kind: TargetKind;
  at: [number, number];
  /** Hits needed to knock it out. */
  hp: number;
  /** Occupied Ukrainian land: allies don't count it as striking Russia, little escalation. */
  occupied?: boolean;
  /** Escalation added by a strike on it. */
  esc: number;
  /** What knocking it out does, for `weeks` weeks. */
  effect: Partial<Record<EnemyMod, number>>;
  weeks: number;
  text: string;
}
/** Enemy capacity modifiers (multipliers 0..1 are subtracted from 1). */
export type EnemyMod = "shahed" | "cruise" | "kalibr" | "ballistic" | "frontNorth" | "frontEast" | "frontSouth" | "econ";

export const TARGETS: readonly TargetDef[] = [
  { id: "kursk-radar", name: "Радар С-400 «Курськ»", kind: "radar", at: [36.15, 51.55], hp: 2, esc: 2, effect: {}, weeks: 4, text: "Слабшає ППО Курщини на 4 тижні." },
  { id: "belgorod-depot", name: "Арсенал «Бєлгород»", kind: "depot", at: [36.85, 50.8], hp: 3, esc: 3, effect: { ballistic: 0.25, frontNorth: 0.3 }, weeks: 3, text: "Менше Іскандерів, слабший тиск на Харківщину." },
  { id: "kursk-launchers", name: "Пускові «Іскандер» (Курщина)", kind: "launchers", at: [35.6, 51.35], hp: 2, esc: 3, effect: { ballistic: 0.35 }, weeks: 2, text: "Менше балістики по Сумах і Харкову." },
  { id: "bryansk-factory", name: "Завод «Кремній Ел» (Брянськ)", kind: "factory", at: [34.4, 53.25], hp: 3, esc: 5, effect: { shahed: 0.12, cruise: 0.12 }, weeks: 4, text: "Мікроелектроніка для ракет і дронів." },
  { id: "millerovo", name: "Аеродром «Міллерово»", kind: "airbase", at: [40.35, 48.95], hp: 3, esc: 4, effect: { frontEast: 0.3 }, weeks: 3, text: "Менше КАБів по Донеччині." },
  { id: "morozovsk", name: "Аеродром «Морозовськ»", kind: "airbase", at: [41.8, 48.35], hp: 3, esc: 4, effect: { frontEast: 0.35 }, weeks: 3, text: "База Су-34: менше КАБів по фронту." },
  { id: "novoshakhtinsk", name: "НПЗ «Новошахтинськ»", kind: "refinery", at: [39.95, 47.78], hp: 3, esc: 4, effect: { econ: 0.1, frontEast: 0.15 }, weeks: 3, text: "Пальне для фронту." },
  { id: "tuapse", name: "НПЗ «Туапсе»", kind: "refinery", at: [39.08, 44.1], hp: 4, esc: 5, effect: { econ: 0.14 }, weeks: 4, text: "Експорт пального: гроші на війну." },
  { id: "ryazan", name: "НПЗ «Рязань»", kind: "refinery", at: [39.7, 54.6], hp: 4, esc: 7, effect: { econ: 0.16, frontNorth: 0.1 }, weeks: 4, text: "Великий НПЗ під Москвою." },
  { id: "tikhoretsk", name: "Арсенал «Тихорецьк»", kind: "depot", at: [40.1, 45.85], hp: 3, esc: 5, effect: { frontSouth: 0.25, ballistic: 0.1 }, weeks: 3, text: "Боєприпаси для півдня." },
  { id: "toropets", name: "Арсенал «Торопець»", kind: "depot", at: [31.6, 56.5], hp: 4, esc: 6, effect: { ballistic: 0.25, frontNorth: 0.2, frontEast: 0.15 }, weeks: 4, text: "Найбільший склад ракет і снарядів." },
  { id: "novorossiysk", name: "Порт «Новоросійськ»", kind: "port", at: [37.78, 44.72], hp: 4, esc: 6, effect: { kalibr: 0.6 }, weeks: 3, text: "Носії «Калібрів»." },
  { id: "engels", name: "Аеродром «Енгельс» (Ту-95)", kind: "airbase", at: [46.2, 51.48], hp: 4, esc: 9, effect: { cruise: 0.4 }, weeks: 3, text: "Стратегічні бомбардувальники: менше Х-101." },
  { id: "alabuga", name: "Завод Shahed «Алабуга»", kind: "factory", at: [52.05, 55.75], hp: 5, esc: 10, effect: { shahed: 0.4 }, weeks: 4, text: "Головний завод «Герані»." },
  { id: "bridge", name: "Кримський міст", kind: "bridge", at: [36.5, 45.3], hp: 6, esc: 6, effect: { frontSouth: 0.4 }, weeks: 4, text: "Логістика до Криму і півдня." },
  { id: "dzhankoi", name: "Залізничний вузол «Джанкой»", kind: "rail", at: [34.4, 45.7], hp: 2, occupied: true, esc: 1, effect: { frontSouth: 0.15 }, weeks: 2, text: "Окупований Крим: дозвіл не потрібен." },
  { id: "saky", name: "Аеродром «Саки»", kind: "airbase", at: [33.6, 45.08], hp: 2, occupied: true, esc: 1, effect: { frontSouth: 0.12, kalibr: 0.1 }, weeks: 2, text: "Окупований Крим: авіація півдня." },
  { id: "donetsk-depot", name: "Склад БК «Донецьк»", kind: "depot", at: [37.95, 47.9], hp: 2, occupied: true, esc: 0, effect: { frontEast: 0.2 }, weeks: 2, text: "Окупована Донеччина: дозвіл не потрібен." },
];
export const targetById = (id: string) => TARGETS.find((t) => t.id === id);

/** Enemy air defence zones (strike interception). Some start unknown. */
export interface ZoneDef { id: string; name: string; at: [number, number]; r: number; power: number; known: boolean }
export const ZONES: readonly ZoneDef[] = [
  { id: "kursk", name: "С-400 Курськ", at: [36.1, 51.7], r: 120, power: 1.2, known: true },
  { id: "belgorod", name: "С-400 Бєлгород", at: [36.6, 50.6], r: 95, power: 1.1, known: true },
  { id: "bryansk", name: "С-300 Брянськ", at: [34.4, 53.2], r: 90, power: 0.9, known: false },
  { id: "voronezh", name: "С-400 Воронеж", at: [39.2, 51.7], r: 95, power: 1.0, known: false },
  { id: "moscow", name: "Кільце Москви", at: [37.6, 55.75], r: 170, power: 1.8, known: true },
  { id: "rostov", name: "С-400 Ростов", at: [39.7, 47.25], r: 110, power: 1.2, known: true },
  { id: "crimea", name: "ППО Криму", at: [34.0, 45.1], r: 130, power: 1.1, known: true },
  { id: "novoross", name: "Новоросійськ", at: [37.8, 44.75], r: 80, power: 1.0, known: false },
  { id: "engels", name: "Енгельс", at: [46.2, 51.48], r: 90, power: 1.1, known: false },
  { id: "kazan", name: "ППО Татарстану", at: [51.5, 55.7], r: 110, power: 0.8, known: false },
  { id: "tver", name: "С-300 Твер", at: [33.5, 56.6], r: 90, power: 0.8, known: false },
  { id: "kuban", name: "Пантирі Кубані", at: [39.5, 45.3], r: 90, power: 0.8, known: false },
];

// ================================================================ allies

export type AllyId = "usa" | "de" | "uk" | "fr" | "pl";
export interface AllyDef {
  id: AllyId;
  name: string;
  flag: string[]; // horizontal stripes, top to bottom (CSS colours)
  /** Escalation the public will stomach (0..100). */
  tolerance: number;
  /** What they care about. */
  wants: "results" | "restraint" | "reforms" | "purchases";
  temper: string;
  /** Week of elections, when the temper may flip. */
  election?: number;
  /** Weekly aid when trust ≥ 45 ($bn). */
  money: number;
  /** Their weapons need a permission before hitting Russia proper. */
  redLine: boolean;
}
export const ALLIES: readonly AllyDef[] = [
  { id: "usa", name: "США", flag: ["#3c3b6e", "#ffffff", "#b22234"], tolerance: 55, wants: "results", temper: "Прагматик: дає, коли бачить результат", election: 11, money: 0.3, redLine: true },
  { id: "de", name: "Німеччина", flag: ["#111111", "#dd0000", "#ffcc00"], tolerance: 40, wants: "restraint", temper: "Обережний партнер", election: 9, money: 0.3, redLine: true },
  { id: "uk", name: "Британія", flag: ["#012169", "#ffffff", "#c8102e"], tolerance: 75, wants: "results", temper: "Рішучий союзник", money: 0.15, redLine: true },
  { id: "fr", name: "Франція", flag: ["#0055a4", "#ffffff", "#ef4135"], tolerance: 60, wants: "purchases", temper: "Хоче контрактів для своєї промисловості", election: 13, money: 0.15, redLine: true },
  { id: "pl", name: "Польща", flag: ["#ffffff", "#dc143c"], tolerance: 85, wants: "reforms", temper: "Логістичний хаб: від неї залежить, як швидко доходить допомога", money: 0.1, redLine: false },
];
export const allyById = (id: AllyId) => ALLIES.find((a) => a.id === id)!;

/** What can be asked for at the table. */
export type AskId = "patriotAmmo" | "battery" | "money" | "permission" | "intel" | "longRange";
export interface AskDef { id: AskId; label: string; from: AllyId[] }
export const ASKS: readonly AskDef[] = [
  { id: "patriotAmmo", label: "Ракети до ППО", from: ["usa", "de", "fr"] },
  { id: "battery", label: "Нова батарея ППО", from: ["usa", "de", "fr"] },
  { id: "money", label: "Фінансування", from: ["usa", "de", "uk", "fr", "pl"] },
  { id: "permission", label: "Дозвіл бити по РФ", from: ["usa", "uk", "fr"] },
  { id: "intel", label: "Супутникова розвідка", from: ["usa", "uk"] },
  { id: "longRange", label: "Далекобійні ракети", from: ["usa", "uk", "fr"] },
];
export type ConditionId = "noDeep" | "noMoscow" | "reform" | "purchase" | "none";
export const CONDITIONS: Record<ConditionId, string> = {
  noDeep: "2 тижні не бити глибше 500 км",
  noMoscow: "Не бити по Москві і Підмосков'ю",
  reform: "Звіт про антикорупційну реформу",
  purchase: "Контракт для їхньої промисловості ($0,3 млрд)",
  none: "Без умов",
};

// ================================================================ advisors, perks, decisions

export type AdvisorId = "general" | "diplomat" | "engineer" | "economist";
export interface AdvisorDef { id: AdvisorId; name: string; role: string; text: string; unlock: number }
export const ADVISORS: readonly AdvisorDef[] = [
  { id: "general", name: "Генерал ППО", role: "Оборона", text: "+1 батарея IRIS-T, +4 ракети Patriot, мобільні групи дешевші.", unlock: 0 },
  { id: "engineer", name: "Інженер-дронщик", role: "Удари", text: "+8 Лютих на старті, Лютий на 30% дешевший, +1 Нептун.", unlock: 0 },
  { id: "diplomat", name: "Дипломат", role: "Союзники", text: "+15 довіри всіх союзників, торг вдається частіше.", unlock: 1 },
  { id: "economist", name: "Економіст", role: "Тил", text: "+$0,35 млрд на тиждень, ескалація спадає вдвічі швидше.", unlock: 2 },
];

export type PerkId =
  | "pickups" | "nordicRadars" | "decoySwarm" | "undergroundSubs" | "feed" | "liutyiLine"
  | "partnerIntel" | "nightHunters" | "patriotAuto" | "generators" | "diplomats" | "longNeptune"
  | "flamingo" | "coldHead" | "engineers" | "dispersal";
export interface PerkDef { id: PerkId; name: string; text: string; tag: "ППО" | "Удари" | "Тил" | "Дипломатія" }
export const PERKS: readonly PerkDef[] = [
  { id: "pickups", name: "Мобільні групи на пікапах", text: "Мобільні групи і Gepard б'ють на 35% далі.", tag: "ППО" },
  { id: "nordicRadars", name: "Радари від Скандинавії", text: "Приманки «Гербера» видно на карті — не витрачай на них ракети.", tag: "ППО" },
  { id: "decoySwarm", name: "Рій-приманка", text: "+6 приманок щотижня для ударів.", tag: "Удари" },
  { id: "undergroundSubs", name: "Підземні підстанції", text: "Влучання по енергетиці на 35% слабші.", tag: "Тил" },
  { id: "feed", name: "Стрічка в соцмережах", text: "Кожні 10 збитих за ніч: +1 мораль.", tag: "Тил" },
  { id: "liutyiLine", name: "Конвеєр Лютих", text: "+4 Лютих щотижня безкоштовно.", tag: "Удари" },
  { id: "partnerIntel", name: "Розвідка партнерів", text: "Усі зони ППО ворога відкриті.", tag: "Удари" },
  { id: "nightHunters", name: "Нічні мисливці", text: "Дрони-перехоплювачі влучають у 88% випадків і +10 щотижня.", tag: "ППО" },
  { id: "patriotAuto", name: "Автоматика Patriot", text: "Patriot і SAMP/T самі б'ють по балістиці.", tag: "ППО" },
  { id: "generators", name: "Резервні генератори", text: "Блекаути б'ють по моралі вдвічі слабше; енергія +2% щотижня.", tag: "Тил" },
  { id: "diplomats", name: "Дипломатичний корпус", text: "Довіра союзників росте на 50% швидше.", tag: "Дипломатія" },
  { id: "longNeptune", name: "Серія Нептунів", text: "+1 Довгий Нептун щотижня.", tag: "Удари" },
  { id: "flamingo", name: "Фламінго в серію", text: "Відкриває виробництво ракет Фламінго (3000 км).", tag: "Удари" },
  { id: "coldHead", name: "Холодна голова", text: "+1 сповільнення часу на ніч.", tag: "ППО" },
  { id: "engineers", name: "Інженерні війська", text: "Фронт тримається міцніше: тиск ворога −20%.", tag: "Тил" },
  { id: "dispersal", name: "Розосередження", text: "Балістика по ППО не знищує батарею, лише виводить на ніч.", tag: "ППО" },
];
export const perkById = (id: PerkId) => PERKS.find((p) => p.id === id)!;

/** Day decisions. `eff` keys are applied by the simulation (see `applyEffect`). */
export interface Effect {
  budget?: number; morale?: number; energy?: number; escalation?: number; industry?: number;
  front?: number; trust?: Partial<Record<AllyId | "all", number>>;
  liutyi?: number; neptune?: number; decoys?: number; interceptors?: number; mobile?: number; patriotAmmo?: number;
  revealZone?: boolean;
}
export interface DecisionDef {
  id: string;
  from: string;
  title: string;
  text: string;
  a: { label: string; eff: Effect };
  b: { label: string; eff: Effect };
  /** Earliest week. */
  week?: number;
}
export const DECISIONS: readonly DecisionDef[] = [
  { id: "energy-ad", from: "Міненерго", title: "Віддати ППО енергетикам?", text: "Енергетики просять перекинути мобільні групи з фронтових міст до ТЕС.", a: { label: "Перекинути", eff: { energy: 6, morale: -2, front: 2 } }, b: { label: "Залишити як є", eff: { energy: -3 } } },
  { id: "procurement", from: "НАБУ", title: "Скандал із закупівлями", text: "Журналісти знайшли переплату за бронежилети. Союзники стежать.", a: { label: "Звільнити і передати в суд", eff: { morale: 3, trust: { all: 4 }, budget: -0.1 } }, b: { label: "Зам'яти", eff: { morale: -4, trust: { all: -6 } } } },
  { id: "volunteers", from: "Волонтери", title: "Збір на рій дронів", text: "Волонтери зібрали гроші і просять, щоб дрони пішли на конкретний НПЗ.", a: { label: "Прийняти, +6 Лютих", eff: { liutyi: 6, morale: 2 } }, b: { label: "Подякувати, але відмовити", eff: { morale: -1 } } },
  { id: "storm-offer", from: "Британія", title: "Ракети без права бити вглиб", text: "Лондон пропонує партію Storm Shadow, але лише по окупованих територіях.", a: { label: "Взяти", eff: { trust: { uk: 4 } } }, b: { label: "Чекати кращих умов", eff: { trust: { uk: -2 } } } },
  { id: "blackout-schedule", from: "Укренерго", title: "Графіки відключень", text: "Можна ввести жорсткі графіки — мережа відновиться швидше, але люди злі.", a: { label: "Ввести графіки", eff: { energy: 8, morale: -5 } }, b: { label: "Тримати як є", eff: { energy: -2, morale: 1 } } },
  { id: "draft-age", from: "Генштаб", title: "Резерви для фронту", text: "Генштаб просить додатковий набір. Фронт стабілізується, але суспільство напружене.", a: { label: "Погодити", eff: { front: -5, morale: -4 } }, b: { label: "Відкласти", eff: { front: 3 } } },
  { id: "grain", from: "Мінекономіки", title: "Зерновий коридор", text: "Можна прикрити порти Одеси ППО — експорт дасть гроші, але інші міста лишаться відкриті.", a: { label: "Прикрити порти", eff: { budget: 0.4, energy: -3 } }, b: { label: "ППО — містам", eff: { morale: 1 } } },
  { id: "drone-startup", from: "Brave1", title: "Стартап перехоплювачів", text: "Команда інженерів зробила дешевий дрон-перехоплювач. Потрібне замовлення.", a: { label: "Замовити ($0,2 млрд)", eff: { budget: -0.2, interceptors: 20 } }, b: { label: "Не зараз", eff: {} } },
  { id: "moscow-media", from: "ОП", title: "Удар по Москві для медіа?", text: "Радники пропонують показовий удар дронами по Москві — мораль злетить, але союзники занервують.", a: { label: "Так, показово", eff: { morale: 5, escalation: 10, trust: { de: -6, usa: -3 } } }, b: { label: "Ні, по військових цілях", eff: { trust: { de: 2 } } } },
  { id: "eu-loan", from: "ЄС", title: "Кредит під заморожені активи", text: "Брюссель готовий видати кредит, але просить прискорити реформи.", a: { label: "Погодитись", eff: { budget: 0.8, morale: -1, trust: { de: 3, fr: 3 } } }, b: { label: "Торгуватися далі", eff: { trust: { de: -2 } } } },
  { id: "refugees", from: "Мінсоцполітики", title: "Евакуація з прифронтових сіл", text: "Примусова евакуація врятує людей, але її сприймуть болісно.", a: { label: "Евакуювати", eff: { morale: -2, front: -2 } }, b: { label: "Добровільно", eff: { morale: 1, front: 1 } } },
  { id: "factory-west", from: "Мінстратегпром", title: "Перенести виробництво на захід", text: "Заводи на сході під ударами. Переїзд на Львівщину коштує грошей.", a: { label: "Переносити ($0,3 млрд)", eff: { budget: -0.3, industry: 0.15 } }, b: { label: "Ремонтувати на місці", eff: { industry: -0.05 } } },
  { id: "patriot-swap", from: "США", title: "Ракети в обмін на рідкоземи", text: "Вашингтон пропонує ракети Patriot в обмін на угоду про ресурси.", a: { label: "Підписати", eff: { patriotAmmo: 8, morale: -2, trust: { usa: 6 } } }, b: { label: "Відмовити", eff: { trust: { usa: -5 } } } },
  { id: "polish-border", from: "Польща", title: "Блокада кордону", text: "Фермери перекрили кордон. Варшава просить поступок щодо зерна.", a: { label: "Поступитися", eff: { budget: -0.15, trust: { pl: 8 } } }, b: { label: "Тиснути через ЄС", eff: { trust: { pl: -8, de: 2 } } } },
  { id: "sat-intel", from: "ГУР", title: "Знайдено нову зону ППО", text: "Розвідка може уточнити, де стоять ЗРК ворога, але засвітить джерело.", a: { label: "Використати", eff: { revealZone: true } }, b: { label: "Зберегти джерело", eff: { morale: 1 } } },
  { id: "mobile-groups", from: "ТРО", title: "Ще мобільні групи", text: "Тероборона готова сформувати нову мобільну групу, якщо дати пікапи.", a: { label: "Дати пікапи ($0,1 млрд)", eff: { budget: -0.1, mobile: 1 } }, b: { label: "Немає грошей", eff: {} } },
  { id: "telethon", from: "Медіа", title: "Єдиний марафон", text: "Продовжувати марафон чи дати каналам свободу?", a: { label: "Продовжувати", eff: { morale: 1, trust: { all: -1 } } }, b: { label: "Свобода", eff: { morale: -1, trust: { all: 2 } } } },
  { id: "decoy-plant", from: "Укроборонпром", title: "Цех приманок", text: "Можна запустити цех дешевих дронів-приманок.", a: { label: "Запустити ($0,15 млрд)", eff: { budget: -0.15, decoys: 12 } }, b: { label: "Ні", eff: {} } },
];

// ================================================================ endings

export type EndingId = "strength" | "frozen" | "hardPeace" | "darkness" | "despair" | "breakthrough";
export const ENDINGS: Record<EndingId, { title: string; text: string; win: boolean }> = {
  strength: { title: "Переговори з позиції сили", text: "Фронт тримається, небо прикрите, союзники поруч. Ворог сідає за стіл, бо продовжувати йому дорожче.", win: true },
  frozen: { title: "Заморожена лінія", text: "Ніхто не переміг. Лінія застигла, міста світяться, але питання лишились відкритими.", win: true },
  hardPeace: { title: "Важкий мир", text: "Країна вистояла, але ціною територій і світла. Союзники поспішали з угодою.", win: true },
  darkness: { title: "Темрява", text: "Енергосистема впала дві ночі поспіль. Без світла і води країна не встояла.", win: false },
  despair: { title: "Зневіра", text: "Суспільство втомилося і перестало вірити. Влада не втрималась.", win: false },
  breakthrough: { title: "Прорив фронту", text: "Оборона на сході не витримала. Ворог прорвався вглиб.", win: false },
};

export const DIFFICULTY_TEXT = [
  "Звичайна війна.",
  "Хвилі на 20% більші, союзники стриманіші.",
  "Хвилі на 40% більші, ворог частіше б'є по ППО.",
  "Хвилі на 60% більші, усі зони ППО ворога приховані.",
] as const;
export const MAX_DIFFICULTY = 3;
