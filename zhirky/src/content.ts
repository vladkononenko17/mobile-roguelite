/**
 * Content of «З гірки!»: the slopes of a winter route home, the things in the
 * way, power-ups, the mittens (perks), who rides and on what, the Комора
 * (what the stash buys between runs) and how a run ends. Pure data.
 */

export type Theme = "yard" | "uzviz" | "dnipro" | "forest" | "polonyna" | "blackout";
/** A map node's twist on its slope. `fair` is not a slope at all: a market where the run's candies buy mittens. */
export type Mod = "none" | "storm" | "thaw" | "carols" | "fair";
export type TimeOfDay = "day" | "dusk" | "night";

export type ObstId =
  | "snowman" | "spruce" | "drift" | "bench" | "log" | "branch" | "laundry" | "boom" | "hole" | "fisher" | "parked" | "stall"
  | "tourist" | "cobbles" | "sheep" | "haystack" | "generator" | "cable" | "rock" | "ramp" | "ice" | "slush";
export type PickId = "candy" | "kid" | "sack" | "petard" | "star" | "thermos";

/**
 * How a thing on the slope is passed: jump over it, duck under it (lie flat on
 * the sled), go around it, ride up it (a ramp throws you in the air), or ride
 * through it (a zone: ice speeds you up and locks your lane, slush slows you).
 */
export type Clear = "jump" | "duck" | "none" | "ramp" | "zone";

export interface ObstDef {
  id: ObstId;
  clear: Clear;
  /** Depth along the slope, metres. */
  len: number;
  /** Width across the slope as a share of a lane. */
  w: number;
  /** Soft: you wobble and lose speed instead of crashing; the kids behind do not fall off. */
  soft?: boolean;
  /** Own speed along the slope (negative = coming up at you), m/s. */
  moving?: [number, number];
  zone?: "ice" | "slush";
  name: string;
}

export const OBSTACLES: Record<ObstId, ObstDef> = {
  snowman: { id: "snowman", clear: "none", len: 1.1, w: 0.75, name: "сніговик" },
  spruce: { id: "spruce", clear: "none", len: 1.4, w: 0.9, name: "ялинка" },
  drift: { id: "drift", clear: "jump", len: 1.6, w: 0.95, soft: true, name: "кучугура" },
  bench: { id: "bench", clear: "jump", len: 0.7, w: 0.85, name: "лавка" },
  log: { id: "log", clear: "jump", len: 0.6, w: 1, name: "колода" },
  branch: { id: "branch", clear: "duck", len: 0.5, w: 1, name: "гілка" },
  laundry: { id: "laundry", clear: "duck", len: 0.4, w: 1, name: "білизна на мотузці" },
  boom: { id: "boom", clear: "duck", len: 0.3, w: 1, name: "шлагбаум" },
  hole: { id: "hole", clear: "jump", len: 1.6, w: 0.8, name: "ополонка" },
  fisher: { id: "fisher", clear: "none", len: 1.2, w: 0.8, name: "рибалка" },
  parked: { id: "parked", clear: "none", len: 4.2, w: 0.9, name: "машина в заметі" },
  stall: { id: "stall", clear: "none", len: 2.2, w: 1, name: "ятка з сувенірами" },
  tourist: { id: "tourist", clear: "none", len: 0.8, w: 0.6, moving: [-1.6, -0.6], name: "турист із селфі-палкою" },
  cobbles: { id: "cobbles", clear: "jump", len: 2.4, w: 0.95, soft: true, name: "бруківка без снігу" },
  sheep: { id: "sheep", clear: "jump", len: 1.4, w: 0.9, soft: true, moving: [-2, -0.8], name: "вівці" },
  haystack: { id: "haystack", clear: "none", len: 2, w: 1, name: "стіг сіна" },
  generator: { id: "generator", clear: "none", len: 1.3, w: 0.8, name: "генератор" },
  cable: { id: "cable", clear: "jump", len: 0.3, w: 1, name: "кабель від генератора" },
  rock: { id: "rock", clear: "none", len: 1.6, w: 0.85, name: "камінь" },
  ramp: { id: "ramp", clear: "ramp", len: 2.4, w: 0.9, name: "трамплін" },
  ice: { id: "ice", clear: "zone", len: 9, w: 1, zone: "ice", name: "ковзанка" },
  slush: { id: "slush", clear: "zone", len: 7, w: 1, zone: "slush", name: "сльота" },
};

export interface PickDef { id: PickId; name: string; icon: string; secs: number; text: string }

export const PICKUPS: Record<PickId, PickDef> = {
  candy: { id: "candy", name: "цукерка", icon: "🍬", secs: 0, text: "" },
  kid: { id: "kid", name: "дитина", icon: "🧒", secs: 0, text: "" },
  sack: { id: "sack", name: "Мішок Миколая", icon: "🎁", secs: 10, text: "Цукерки самі летять у мішок." },
  petard: { id: "petard", name: "Петарда", icon: "🧨", secs: 5, text: "Ракетою вниз: пробиваєш усе, ватагу не зачепить." },
  star: { id: "star", name: "Зірка колядників", icon: "⭐", secs: 0, text: "Колядники з зіркою чіпляються до ватаги: +2." },
  thermos: { id: "thermos", name: "Термос з чаєм", icon: "🫖", secs: 0, text: "Зігрівся: +1 серце." },
};

export interface ThemeDef {
  id: Theme;
  title: string;
  sub: string;
  time: TimeOfDay;
  length: number;
  /** Target speed at the top and at the bottom, m/s. */
  speed: [number, number];
  /** Rows of things per 100 m at the top and the bottom. */
  density: [number, number];
  obstacles: Partial<Record<ObstId, number>>;
  /** Chance per row of a kid waving to join. */
  kids: number;
  /** Chance per row of a ramp. */
  ramps: number;
  /** Chance per row of an ice patch. */
  ice: number;
  intro: string;
  finish: string;
}

export const THEMES: Record<Theme, ThemeDef> = {
  yard: {
    id: "yard", title: "ДВІР ХРУЩОВКИ", sub: "Гірка за гаражами", time: "day", length: 650, speed: [10, 12.5], density: [5, 6.4],
    obstacles: { snowman: 3, bench: 3, parked: 2, laundry: 2, drift: 2, spruce: 1, boom: 1 }, kids: 0.22, ramps: 0.08, ice: 0.05,
    intro: "Мама сказала: до шостої — у бабусі, на кутю. Найкоротший шлях — з гірки. Сусідські діти вже чекають.",
    finish: "ГАРАЖІ · КІНЕЦЬ ДВОРУ",
  },
  uzviz: {
    id: "uzviz", title: "АНДРІЇВСЬКИЙ УЗВІЗ", sub: "Бруківка, туристи, ятки", time: "day", length: 800, speed: [11, 13.5], density: [5.6, 7],
    obstacles: { stall: 3, tourist: 3, cobbles: 3, snowman: 2, bench: 2, laundry: 1, drift: 1 }, kids: 0.2, ramps: 0.1, ice: 0.08,
    intro: "Найкрутіший узвіз у Києві. Туристи фотографуються посеред дороги, а бруківка подекуди без снігу.",
    finish: "ПОДІЛ",
  },
  dnipro: {
    id: "dnipro", title: "ЗАМЕРЗЛИЙ ДНІПРО", sub: "Лід, ополонки, рибалки", time: "day", length: 900, speed: [12, 14], density: [5, 6.4],
    obstacles: { hole: 3, fisher: 3, drift: 3, rock: 1, snowman: 1 }, kids: 0.2, ramps: 0.12, ice: 0.3,
    intro: "Через ріку навпростець. Лід тримає, але рибалки на ящиках сидять де заманеться, а ополонки ніхто не огороджує.",
    finish: "ЛІВИЙ БЕРЕГ",
  },
  forest: {
    id: "forest", title: "КАРПАТСЬКИЙ ЛІС", sub: "Смереки й колоди", time: "day", length: 950, speed: [11.5, 14], density: [6, 7.6],
    obstacles: { spruce: 4, log: 4, branch: 4, rock: 2, drift: 2 }, kids: 0.16, ramps: 0.14, ice: 0.06,
    intro: "Стежка між смереками. Гілки низько, колоди впоперек — лягай і стрибай вчасно.",
    finish: "ЛІСНИЧІВКА",
  },
  polonyna: {
    id: "polonyna", title: "ПОЛОНИНА", sub: "Вівці, стоги, колиби", time: "dusk", length: 950, speed: [12, 14.5], density: [5.6, 7],
    obstacles: { haystack: 3, sheep: 3, drift: 3, log: 2, rock: 2, boom: 1 }, kids: 0.18, ramps: 0.18, ice: 0.06,
    intro: "Відкритий схил і захід сонця. Вівці переходять дорогу, вівчар махає рукою. Тут найкращі трампліни.",
    finish: "КОЛИБА",
  },
  blackout: {
    id: "blackout", title: "БЛЕКАУТ", sub: "Ніч, гірлянди від генераторів", time: "night", length: 1000, speed: [12.5, 15], density: [5.6, 7.2],
    obstacles: { generator: 3, cable: 3, snowman: 2, bench: 2, parked: 2, drift: 2, laundry: 1 }, kids: 0.18, ramps: 0.1, ice: 0.1,
    intro: "Останній спуск — у бабусине селище. Світла нема, світять лише гірлянди від генераторів і твій ліхтарик.",
    finish: "БАБУСИНА ХАТА",
  },
};

export interface ModDef { id: Mod; name: string; icon: string; text: string; candy: number }

export const MODS: Record<Mod, ModDef> = {
  none: { id: "none", name: "Звичайний спуск", icon: "", text: "", candy: 1 },
  storm: { id: "storm", name: "Хуртовина", icon: "❄️", text: "Видно на кілька рядів уперед. Цукерки ×1,5.", candy: 1.5 },
  thaw: { id: "thaw", name: "Відлига", icon: "💧", text: "Сльота гальмує, кучугури важкі. Цукерки ×1,3.", candy: 1.3 },
  carols: { id: "carols", name: "Колядники", icon: "⭐", text: "+2 до ватаги на старті, діти на кожному кроці.", candy: 1 },
  fair: { id: "fair", name: "Ярмарок", icon: "🎪", text: "Не спуск: купи рукавиці за цукерки.", candy: 1 },
};

// -------------------------------------------------------------- the route

/** The rows of the route: which themes and twists each row of the map can hold. */
export const ROUTE_ROWS = 6;

// -------------------------------------------------------------- mittens (perks)

export type PerkId =
  | "varenyky" | "thermos" | "carol" | "wax" | "sweater" | "pocket" | "bell" | "rope" | "ushanka" | "bag" | "petards" | "grip";

export interface PerkDef { id: PerkId; name: string; text: string; rare?: boolean; stack?: boolean }

export const PERKS: PerkDef[] = [
  { id: "varenyky", name: "Бабусині вареники", text: "+1 серце до максимуму й одразу +1.", stack: true },
  { id: "thermos", name: "Термос з узваром", text: "Після кожного спуску відновлює одне серце." },
  { id: "carol", name: "Гучна колядка", text: "Перший удар по хвосту на кожному спуску відриває лише одну дитину.", rare: true },
  { id: "wax", name: "Вощені полози", text: "+6% швидкості, а на льоду ще +15%.", stack: true },
  { id: "sweater", name: "Светр з оленями", text: "Сальто дають на 60% більше цукерок.", stack: true },
  { id: "pocket", name: "Кишеня для цукерок", text: "+25% цукерок з усього.", stack: true },
  { id: "bell", name: "Дзвіночок на санках", text: "Діти чують тебе здалеку: підбираєш їх і з сусідньої смуги." },
  { id: "rope", name: "Довга мотузка", text: "+3 місця у ватазі.", stack: true },
  { id: "ushanka", name: "Татова вушанка", text: "Перша аварія на кожному спуску не забирає серце.", rare: true },
  { id: "bag", name: "Мішок побільше", text: "Мішок Миколая діє вдвічі довше й тягне здалеку." },
  { id: "petards", name: "Петарди в кишені", text: "Кожен спуск починаєш з петардою, і горять вони довше." },
  { id: "grip", name: "Рукавиці на резинці", text: "Ватага тримається міцніше: діти швидше повторюють твої повороти.", rare: true },
];

export const perkById = (id: PerkId): PerkDef => PERKS.find((p) => p.id === id)!;

// -------------------------------------------------------------- who rides, and on what

export type HeroId = "solomiia" | "ostap" | "hanna" | "brovko";
export type RideId = "sled" | "nochvy" | "tube" | "plywood";

export interface HeroDef {
  id: HeroId; name: string; text: string; price: number;
  look: { coat: number; pants: number; hat: number; scarf: number; dog?: boolean; old?: boolean };
}

export const HEROES: HeroDef[] = [
  { id: "solomiia", name: "Соломійка", price: 0, text: "Старшенька з п'ятого поверху: починає з двома дітьми у ватазі.", look: { coat: 0xd63732, pants: 0x2b3550, hat: 0xf2b632, scarf: 0x54b7c6 } },
  { id: "ostap", name: "Остап", price: 2000, text: "Знає всі трюки з YouTube: сальто дають удвічі більше цукерок.", look: { coat: 0x2b5a9a, pants: 0x1d1d22, hat: 0x151316, scarf: 0xe8602f } },
  { id: "hanna", name: "Бабця Ганя", price: 5000, text: "Вперта: +1 серце і завжди їде на своїх ночвах, навіть якщо їх нема в коморі.", look: { coat: 0x6a3f6a, pants: 0x3a2f3a, hat: 0xc8463a, scarf: 0xc8463a, old: true } },
  { id: "brovko", name: "Пес Бровко", price: 10000, text: "Сам тягне санки: швидші повороти, а діти тримаються міцніше.", look: { coat: 0xc99a62, pants: 0xc99a62, hat: 0xc99a62, scarf: 0xd63732, dog: true } },
];

export interface RideDef {
  id: RideId; name: string; text: string; price: number;
  /** Speed multiplier. */
  speed: number;
  /** Sideways speed, m/s. */
  side: number;
  crewMax: number;
  /** Hearts on top of the base three. */
  hearts: number;
  /** Bars for the menu, 0..1. */
  bars: [number, number];
}

export const RIDES: RideDef[] = [
  { id: "sled", name: "Санчата", price: 0, speed: 1, side: 15, crewMax: 8, hearts: 0, bars: [0.5, 0.75], text: "Чесне керування, тягнуть до 8 дітей." },
  { id: "nochvy", name: "Ночви", price: 1500, speed: 1.1, side: 10, crewMax: 6, hearts: 0, bars: [0.7, 0.3], text: "Бабусине корито. На льоду крутиться й летить ще швидше, але повертає неохоче." },
  { id: "tube", name: "Тюбінг-бублик", price: 3000, speed: 1, side: 13, crewMax: 4, hearts: 0, bars: [0.55, 0.55], text: "Відскакує від перешкод у вільну смугу замість аварії. Ватага на ньому тримається гірше." },
  { id: "plywood", name: "Лист фанери", price: 6000, speed: 1.22, side: 17, crewMax: 6, hearts: -1, bars: [0.95, 0.45], text: "Найшвидший. Але тріщить: на одне серце менше." },
];

export const heroById = (id: HeroId): HeroDef => HEROES.find((h) => h.id === id)!;
export const rideById = (id: RideId): RideDef => RIDES.find((r) => r.id === id)!;

// -------------------------------------------------------------- the Комора: what the stash buys

export type UpgradeId = "neighbor" | "mitt4" | "map" | "backpack";

export interface UpgradeDef { id: UpgradeId; name: string; text: string; prices: number[] }

export const UPGRADES: UpgradeDef[] = [
  { id: "neighbor", name: "Сусідська дитина", text: "Кожен забіг стартує з +1 у ватазі.", prices: [1500, 4000] },
  { id: "backpack", name: "Термос у рюкзаку", text: "+1 серце на старті забігу.", prices: [2500, 6000] },
  { id: "mitt4", name: "Четверта рукавиця", text: "Після спуску — вибір з чотирьох рукавиць.", prices: [3000] },
  { id: "map", name: "Мапа від дядька", text: "На маршруті видно, що чекає на два ряди вперед.", prices: [2000] },
];

// -------------------------------------------------------------- lines

export const KID_LINES = ["Йу-ху!", "Ще швидше!", "Чекай мене!", "Я з вами!", "Візьміть мене!", "Ура-а-а!"];
export const LOST_LINES = ["Мамо-о-о!", "Я в кучугурі!", "Без мене!", "Ой!"];
export const HERO_LINES = { go: "Поїхали!", trick: "Опа!", crash: "Ой-йой…", home: "Бабусю, ми вдома!" };

// -------------------------------------------------------------- endings

export type EndingId = "home" | "drift";

export interface EndingDef { id: EndingId; title: string; sticker: string; text: string }

export const ENDINGS: Record<EndingId, EndingDef> = {
  home: { id: "home", title: "ВСТИГ НА КУТЮ!", sticker: "ВДОМА", text: "Ватага ввалилася в бабусину хату за хвилину до першої зірки. Мокрі шапки на печі, кутя на столі." },
  drift: { id: "drift", title: "У КУЧУГУРІ", sticker: "ПЕРЕКИНУВСЯ", text: "Санки в одну сторону, шапка в іншу. До бабусі сьогодні вже не встигнеш — але гірка нікуди не дінеться." },
};

export const DRIFT_TEXT: Record<Theme, string> = {
  yard: "Перекинувся ще у дворі. Сусіди з балконів бачили все.",
  uzviz: "Узвіз переміг: туристи сфотографували, як ти летиш у ятку з магнітиками.",
  dnipro: "Посеред Дніпра, поруч з рибалкою. Він навіть не обернувся: клює.",
  forest: "У смереках тихо. Тільки сніг з гілок сиплеться тобі за комір.",
  polonyna: "Вівчар підняв тебе з кучугури й налив чаю. Але до бабусі вже не встигнеш.",
  blackout: "За два кроки до бабусиної хати, у темряві. Ліхтарик згас, санки — в кучугурі.",
};

/** Мороз ★: faster, denser, sweeter. */
export const MAX_FROST = 4;
export const FROST_TEXT = ["Легкий морозець", "Щипає за щоки", "Сніг рипить", "Дерева тріщать", "Різдвяний мороз"];
