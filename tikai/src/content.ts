/**
 * Content of «Тікай!»: the route (six stages, on foot and by car), the things
 * in the way, power-ups, perks, who you can start as, and how a run ends.
 * Pure data, no rendering.
 */

export type Mode = "foot" | "car";
export type Theme = "yard" | "market" | "road" | "village" | "checkpoints" | "forest";
export type TimeOfDay = "day" | "dusk" | "night";
export type Chaser = "tck" | "police" | "guard";

export type ObstId =
  // on foot
  | "bench" | "bins" | "parked" | "kiosk" | "fence" | "laundry" | "scaffold" | "puddle" | "manhole" | "crates" | "stall"
  | "courier" | "dog" | "geese" | "hay" | "cart" | "log" | "branch" | "spot" | "roadworks" | "boomlow"
  // by car
  | "traffic" | "truck" | "bus" | "pothole" | "spikes" | "blocks" | "hedgehog" | "patrol" | "cones" | "boom";
export type PickId = "coin" | "scooter" | "hood" | "magnet" | "energy" | "nitro" | "repair";
export type DecorId = "babka" | "soldier" | "sign" | "shelter";

/** How an obstacle is passed: jump over it, slide under it, or only around it. */
export type Clear = "jump" | "slide" | "none";

export interface ObstDef {
  id: ObstId;
  mode: Mode;
  clear: Clear;
  /** Depth along the road, metres. */
  len: number;
  /** Width across the road as a share of a lane (1 = the whole lane). */
  w: number;
  /** Soft: you stumble and lose speed instead of crashing. */
  soft?: boolean;
  /** Own speed along the road (negative = coming at you), m/s, [min, max]. */
  moving?: [number, number];
  /** Parkour lets you vault it. */
  vault?: boolean;
  /** By car: costs a dent even though it is soft. */
  dent?: boolean;
  name: string;
}

export const OBSTACLES: Record<ObstId, ObstDef> = {
  bench: { id: "bench", mode: "foot", clear: "jump", len: 0.7, w: 0.8, name: "лавка" },
  bins: { id: "bins", mode: "foot", clear: "none", len: 1.4, w: 0.9, vault: true, name: "сміттєві баки" },
  parked: { id: "parked", mode: "foot", clear: "none", len: 4.2, w: 0.9, vault: true, name: "припаркована машина" },
  kiosk: { id: "kiosk", mode: "foot", clear: "none", len: 3, w: 1, name: "МАФ" },
  fence: { id: "fence", mode: "foot", clear: "jump", len: 0.3, w: 1, name: "огорожа" },
  laundry: { id: "laundry", mode: "foot", clear: "slide", len: 0.4, w: 1, name: "білизна на мотузці" },
  scaffold: { id: "scaffold", mode: "foot", clear: "slide", len: 1.2, w: 1, name: "риштування" },
  puddle: { id: "puddle", mode: "foot", clear: "jump", len: 2.2, w: 0.9, soft: true, name: "калюжа" },
  manhole: { id: "manhole", mode: "foot", clear: "jump", len: 1.1, w: 0.7, name: "відкритий люк" },
  crates: { id: "crates", mode: "foot", clear: "jump", len: 1, w: 0.85, name: "ящики з картоплею" },
  stall: { id: "stall", mode: "foot", clear: "none", len: 2.4, w: 1, name: "ятка" },
  courier: { id: "courier", mode: "foot", clear: "none", len: 1.6, w: 0.7, moving: [-6, -4], name: "кур'єр на самокаті" },
  dog: { id: "dog", mode: "foot", clear: "jump", len: 0.9, w: 0.6, soft: true, moving: [-5, -3], name: "пес" },
  geese: { id: "geese", mode: "foot", clear: "jump", len: 1.6, w: 0.9, soft: true, moving: [-1.5, -0.5], name: "гуси" },
  hay: { id: "hay", mode: "foot", clear: "none", len: 2, w: 1, name: "копиця сіна" },
  cart: { id: "cart", mode: "foot", clear: "none", len: 3, w: 1, vault: true, name: "віз" },
  log: { id: "log", mode: "foot", clear: "jump", len: 0.6, w: 1, name: "колода" },
  branch: { id: "branch", mode: "foot", clear: "slide", len: 0.5, w: 1, name: "гілка" },
  spot: { id: "spot", mode: "foot", clear: "none", len: 3, w: 1, soft: true, moving: [1, 3], name: "прожектор дрона" },
  roadworks: { id: "roadworks", mode: "foot", clear: "jump", len: 1.4, w: 1, soft: true, name: "розкопана плитка" },
  boomlow: { id: "boomlow", mode: "foot", clear: "slide", len: 0.3, w: 1, name: "шлагбаум" },

  traffic: { id: "traffic", mode: "car", clear: "none", len: 4.2, w: 0.62, moving: [12, 22], name: "машина" },
  truck: { id: "truck", mode: "car", clear: "none", len: 9, w: 0.72, moving: [11, 16], name: "фура" },
  bus: { id: "bus", mode: "car", clear: "none", len: 5.2, w: 0.66, moving: [9, 14], name: "маршрутка" },
  pothole: { id: "pothole", mode: "car", clear: "none", len: 1.6, w: 0.5, soft: true, name: "яма" },
  spikes: { id: "spikes", mode: "car", clear: "none", len: 1, w: 1, soft: true, dent: true, name: "шипи" },
  blocks: { id: "blocks", mode: "car", clear: "none", len: 1.6, w: 1, name: "бетонні блоки" },
  hedgehog: { id: "hedgehog", mode: "car", clear: "none", len: 1.8, w: 1, name: "протитанкові їжаки" },
  patrol: { id: "patrol", mode: "car", clear: "none", len: 4.4, w: 0.9, name: "патрульна машина" },
  cones: { id: "cones", mode: "car", clear: "none", len: 1, w: 0.8, soft: true, name: "конуси" },
  boom: { id: "boom", mode: "car", clear: "none", len: 0.3, w: 1, soft: true, name: "шлагбаум" },
};

export interface PickDef { id: PickId; mode: Mode | "both"; name: string; icon: string; secs: number; text: string }

export const PICKUPS: Record<PickId, PickDef> = {
  coin: { id: "coin", mode: "both", name: "гривня", icon: "₴", secs: 0, text: "" },
  scooter: { id: "scooter", mode: "foot", name: "Самокат", icon: "🛴", secs: 14, text: "Швидше. Одна аварія — і самокату кінець, а не тобі." },
  hood: { id: "hood", mode: "foot", name: "Капюшон", icon: "🧥", secs: 9, text: "Тебе не впізнають: погоня відстає, бабусі не дзвонять." },
  magnet: { id: "magnet", mode: "both", name: "Монобанка", icon: "🫙", secs: 11, text: "Гривні самі летять у банку." },
  energy: { id: "energy", mode: "foot", name: "Енергетик", icon: "⚡", secs: 6, text: "Біжиш як від повістки. Бо так і є. Пробиваєш усе." },
  nitro: { id: "nitro", mode: "car", name: "Каністра", icon: "🛢️", secs: 0, text: "+1 нітро. Свайп угору — газ у підлогу." },
  repair: { id: "repair", mode: "car", name: "Скотч і молитва", icon: "🔧", secs: 0, text: "+1 до цілості машини." },
};

export interface StageDef {
  id: string;
  title: string;
  sub: string;
  mode: Mode;
  theme: Theme;
  time: TimeOfDay;
  chaser: Chaser;
  /** Metres to the safe spot. */
  length: number;
  /** Target speed at the start and at the end, m/s. */
  speed: [number, number];
  /** Rows of obstacles per 100 m at the start and the end. */
  density: [number, number];
  obstacles: Partial<Record<ObstId, number>>;
  /** Chance per row that a babusia sits by the road. */
  babka: number;
  /** Metres between blockposts, 0 for none. */
  blockposts: number;
  intro: string;
  goal: string;
}

export const STAGES: StageDef[] = [
  {
    id: "yard", title: "ДВІР", sub: "Вийшов винести сміття", mode: "foot", theme: "yard", time: "day", chaser: "tck",
    length: 650, speed: [8.5, 11], density: [5.2, 6.6], babka: 0.2, blockposts: 0,
    obstacles: { bench: 3, bins: 3, parked: 3, laundry: 2, puddle: 2, fence: 2, manhole: 1, kiosk: 1 },
    intro: "Пакет зі сміттям ще в руці, а з-за рогу вже виїжджає бус. Двоє в пікселі побачили тебе першими.",
    goal: "Добіжи до підземного переходу",
  },
  {
    id: "market", title: "РИНОК", sub: "Між рядами", mode: "foot", theme: "market", time: "day", chaser: "tck",
    length: 800, speed: [9.5, 12], density: [6, 7.4], babka: 0.3, blockposts: 0,
    obstacles: { stall: 4, crates: 3, kiosk: 2, courier: 2, scaffold: 2, puddle: 1, laundry: 1, bins: 1, roadworks: 1 },
    intro: "Через ринок — найкоротший шлях до кума з машиною. Продавчині все бачать і все розкажуть.",
    goal: "Добіжи до кума на парковці",
  },
  {
    id: "road", title: "ОБ'ЇЗНА", sub: "Кумова «копійка»", mode: "car", theme: "road", time: "day", chaser: "police",
    length: 2400, speed: [24, 31], density: [2.6, 3.4], babka: 0, blockposts: 0,
    obstacles: { traffic: 6, truck: 2, bus: 2, pothole: 2, cones: 1 },
    intro: "Кум дав ключі й сказав «не подряпай». За першим поворотом — патруль. Сирена. Газ у підлогу.",
    goal: "Вирвись з міста",
  },
  {
    id: "village", title: "СЕЛО", sub: "Машину кинув у посадці", mode: "foot", theme: "village", time: "dusk", chaser: "tck",
    length: 900, speed: [10, 12.5], density: [6.2, 7.6], babka: 0.35, blockposts: 0,
    obstacles: { dog: 3, geese: 2, hay: 3, cart: 2, fence: 3, puddle: 2, laundry: 2, log: 1 },
    intro: "Пішки через село. Пси гавкають, гуси шиплять, а з бусу знову висипались ті самі двоє.",
    goal: "Добіжи до трактора за селом",
  },
  {
    id: "checkpoints", title: "БЛОКПОСТИ", sub: "Трактор — теж транспорт", mode: "car", theme: "checkpoints", time: "night", chaser: "police",
    length: 2800, speed: [24, 30], density: [2.2, 2.9], babka: 0, blockposts: 420,
    obstacles: { traffic: 4, truck: 3, pothole: 3, cones: 2, spikes: 1 },
    intro: "Ніч, траса, блокпост за блокпостом. Шукай вільну смугу між бетоном і їжаками. Шлагбаум — це не стіна.",
    goal: "Проскоч усі блокпости",
  },
  {
    id: "forest", title: "ЛІС", sub: "Останній кілометр", mode: "foot", theme: "forest", time: "night", chaser: "guard",
    length: 1100, speed: [10.5, 13], density: [6.4, 8], babka: 0, blockposts: 0,
    obstacles: { log: 4, branch: 4, puddle: 2, spot: 3, fence: 1, boomlow: 1 },
    intro: "Трактор заглох у полі. Далі — ліс, дрон з тепловізором і прикордонники з ліхтарями. Попереду шумить річка.",
    goal: "Добіжи до річки",
  },
];

// -------------------------------------------------------------- perks

export type PerkId =
  | "sneakers" | "pie" | "parkour" | "hoodie" | "powerbank" | "lawyer" | "chat" | "dog" | "scooterstart"
  | "taxi" | "nitro" | "tint" | "tires" | "stash" | "lucky";

export interface PerkDef { id: PerkId; name: string; icon: string; text: string; mode?: Mode; stack?: boolean }

export const PERKS: PerkDef[] = [
  { id: "sneakers", name: "Кросівки з ринку", icon: "👟", text: "Погоня відстає швидше (+35% відрив на бігу).", mode: "foot", stack: true },
  { id: "pie", name: "Бабусин пиріжок", icon: "🥟", text: "Після спотикання швидше набираєш швидкість.", mode: "foot" },
  { id: "parkour", name: "Паркур з YouTube", icon: "🤸", text: "Перестрибуєш баки, ящики, машини й вози.", mode: "foot" },
  { id: "hoodie", name: "Чорне худі", icon: "🥷", text: "Капюшон, самокат і енергетик діють удвічі довше.", mode: "foot" },
  { id: "powerbank", name: "Павербанк для монобанки", icon: "🔋", text: "Монобанка діє вдвічі довше й тягне здалеку." },
  { id: "lawyer", name: "Адвокат на швидкому", icon: "📞", text: "+1 шанс вирватися, коли схоплять.", stack: true },
  { id: "chat", name: "Чат «Де бус?»", icon: "💬", text: "Знаєш, хто з бабусь стукач, а на блокпостах бачиш вільну смугу заздалегідь." },
  { id: "dog", name: "Свій пес", icon: "🐕", text: "Пси тебе не чіпають. Гуси — теж, бо бояться пса.", mode: "foot" },
  { id: "scooterstart", name: "Електросамокат", icon: "🛴", text: "Кожен забіг пішки починаєш на самокаті.", mode: "foot" },
  { id: "taxi", name: "Знайомий таксист", icon: "🚕", text: "+1 до цілості машини.", mode: "car", stack: true },
  { id: "nitro", name: "Закис азоту", icon: "🔥", text: "+2 нітро на старті кожної гонки.", mode: "car", stack: true },
  { id: "tint", name: "Тонування в нуль", icon: "🕶️", text: "Поліція втрачає тебе швидше (+40% відрив у машині).", mode: "car" },
  { id: "tires", name: "Шини з кевларом", icon: "🛞", text: "Ями, шипи й конуси більше не гальмують.", mode: "car" },
  { id: "stash", name: "Заначка в шкарпетці", icon: "🧦", text: "+30% гривень з усього.", stack: true },
  { id: "lucky", name: "Ладанка від бабусі", icon: "📿", text: "Перша аварія на кожному етапі — не рахується." },
];

export const perkById = (id: PerkId): PerkDef => PERKS.find((p) => p.id === id)!;

// -------------------------------------------------------------- who you are

export type TraitId = "it" | "courier" | "taxi" | "athlete" | "nephew";

export interface TraitDef { id: TraitId; name: string; icon: string; text: string; price: number; look: { top: number; pants: number; hat: "beanie" | "cap" | "hood" | "none"; hatColor: number; bag?: number; glasses?: boolean } }

export const TRAITS: TraitDef[] = [
  { id: "it", name: "Айтішник", icon: "💻", price: 0, text: "+20% гривень. Звик тікати від дедлайнів.", look: { top: 0x2f8f88, pants: 0x3d4f6e, hat: "beanie", hatColor: 0xe8602f, bag: 0x3a3a3a } },
  { id: "courier", name: "Кур'єр", icon: "🛵", price: 2500, text: "Знає всі двори: відрив на бігу +25%, старт на самокаті.", look: { top: 0xf2b632, pants: 0x2b2b30, hat: "cap", hatColor: 0xf2b632, bag: 0xf2b632 } },
  { id: "taxi", name: "Таксист", icon: "🚖", price: 6000, text: "+1 до цілості машини, +1 нітро, бачить вільну смугу блокпоста.", look: { top: 0x3a3a44, pants: 0x2b2b30, hat: "cap", hatColor: 0x1d1d1d } },
  { id: "athlete", name: "Легкоатлет", icon: "🏃", price: 12000, text: "Паркур з самого початку і швидше встає після падіння.", look: { top: 0xd63732, pants: 0x1d2538, hat: "none", hatColor: 0 } },
  { id: "nephew", name: "Племінник депутата", icon: "🎩", price: 25000, text: "+1 шанс вирватися, погоня стартує далі. Але гривень −20%: дядько забирає.", look: { top: 0x2b2b30, pants: 0x2b2b30, hat: "none", hatColor: 0, glasses: true } },
];

export const traitById = (id: TraitId): TraitDef => TRAITS.find((t) => t.id === id)!;

// -------------------------------------------------------------- lines

export const CHASER_NAME: Record<Chaser, string> = { tck: "ТЦК", police: "Поліція", guard: "Прикордонники" };

/** Shouts from behind. Lines that exist in «Розшук» play its recordings. */
export const SHOUTS: Record<Chaser, string[]> = {
  tck: ["Стояти!", "Агов! Ти!", "Е, ну-ка стій!", "Молодий чоловік!", "Куди зібрався?", "Чоловіче, ваші документи!"],
  police: ["Водій, зупиніться!", "Пригорніться до узбіччя!", "Стояти, поліція!", "Номер бачу, не втечеш!"],
  guard: ["Стій! Прикордонна служба!", "Стояти!", "Він біжить до річки!", "Агов! Ти!"],
};
export const NEAR_LINES: Record<Chaser, string[]> = {
  tck: ["Попався!", "В бус його!"],
  police: ["Глуши мотор!", "Руки на кермо!"],
  guard: ["Попався!", "Лягай!"],
};
export const LOST_LINES: Record<Chaser, string[]> = {
  tck: ["Та де він…", "Втік, падлюка", "Ну нічого, ще побачимось"],
  police: ["Загубили його…", "Пробий номер!"],
  guard: ["Та де він…", "Шукай-шукай…"],
};
export const BABKA_LINES = ["Алло, Галю? Тут один ходить…", "Синку, а ти чого не на фронті?", "Я все бачу!"];
export const HERO_LINES = { jump: "Опа!", caught: "Ні-ні-ні, я ж на удальонці!", escaped: "Фух… відірвався", run: "Тікаю!!!" };

// -------------------------------------------------------------- endings

export type EndingId = "bus" | "protocol" | "border" | "river";

export interface EndingDef { id: EndingId; title: string; sticker: string; text: string }

export const ENDINGS: Record<EndingId, EndingDef> = {
  bus: { id: "bus", title: "БУСИФІКАЦІЯ", sticker: "СПІЙМАЛИ", text: "Двері бусу зачинились. Повістку вручили прямо в руки, разом з пакетом сміття." },
  protocol: { id: "protocol", title: "ПРОТОКОЛ", sticker: "ЗУПИНИЛИ", text: "Кумова «копійка» на штрафмайданчику, ти — в патрульній машині, а далі той самий бус." },
  border: { id: "border", title: "ПРИКОРДОННИКИ", sticker: "ЗАТРИМАЛИ", text: "До річки лишалось кілька сотень метрів. Ліхтарик в очі, обличчям у мох." },
  river: { id: "river", title: "РІЧКА", sticker: "ДОБІГ", text: "Ти стоїш по коліна в крижаній воді. Позаду ліс і шість етапів. Що далі — вже інша гра." },
};

/** Which ending a catch on a given stage means. */
export function caughtEnding(stage: StageDef): EndingId {
  return stage.chaser === "police" ? "protocol" : stage.chaser === "guard" ? "border" : "bus";
}

/** Розшук ★: harder and better paid. */
export const MAX_HEAT = 4;
export const HEAT_TEXT = ["Звичайний день", "Тебе вже шукають", "Фото на всіх стовпах", "Окремий бус під тебе", "Особистий ворог військкома"];
