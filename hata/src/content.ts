/**
 * «Хата з краю» — game data. Pure TypeScript, no rendering imports, so the
 * rules can be tested with `node --test`.
 */

export type ToolId = "hands" | "washer" | "mower" | "leaves" | "net" | "mop" | "squeegee" | "paint" | "detector";

/** What a surface or job needs to be cleaned with. */
export type WorkKind = "wash" | "mop" | "glass" | "lawn" | "leaves" | "pool" | "paint" | "dig" | "pick" | "dish" | "fix" | "wipe";

export interface ToolLevel {
  name: string;
  /** Price of this level; 0 = owned from the start. */
  price: number;
  /** Brush radius on the surface, metres. */
  radius: number;
  /** Cleaning strength: dirt units removed per second at the brush centre. */
  rate: number;
  /** How far the tool reaches from the eye, metres. */
  range: number;
  /** Walking speed multiplier while the tool is out (the mower is slower). */
  walk?: number;
  blurb: string;
}

export interface ToolDef {
  id: ToolId;
  name: string;
  /** Short label on the hotbar. */
  short: string;
  works: WorkKind[];
  levels: ToolLevel[];
}

export const TOOLS: Record<ToolId, ToolDef> = {
  hands: {
    id: "hands", name: "Руки і ганчірка", short: "Руки", works: ["pick", "fix", "dish", "wipe"],
    levels: [{ name: "Руки і ганчірка", price: 0, radius: 0.14, rate: 2.0, range: 2.4, blurb: "Підняти сміття, протерти, помити посуд, полатати дах." }],
  },
  washer: {
    id: "washer", name: "Мийка високого тиску", short: "Мийка", works: ["wash"],
    levels: [
      { name: "Міні-мийка 90 бар", price: 0, radius: 0.18, rate: 1.6, range: 4.5, blurb: "Стара, але ще миє." },
      { name: "Мийка 140 бар", price: 1800, radius: 0.24, rate: 2.6, range: 5, blurb: "Ширший струмінь, утричі менше нервів." },
      { name: "Бензинова 200 бар", price: 5200, radius: 0.32, rate: 4.0, range: 5.5, blurb: "Мох з даху злітає сам." },
      { name: "Промислова 250 бар", price: 12000, radius: 0.42, rate: 6.0, range: 6.5, blurb: "Можна мити сусідів через паркан." },
    ],
  },
  mower: {
    id: "mower", name: "Косарка", short: "Косарка", works: ["lawn"],
    levels: [
      { name: "Ручна барабанна", price: 0, radius: 0.2, rate: 1, range: 0, walk: 0.7, blurb: "Тихо, повільно, вузька смуга." },
      { name: "Електрокосарка", price: 1500, radius: 0.24, rate: 1, range: 0, walk: 0.85, blurb: "Ширше і швидше, але кабель." },
      { name: "Бензокосарка", price: 4500, radius: 0.3, rate: 1, range: 0, walk: 1.0, blurb: "Широка дека, ходиш як звичайно." },
      { name: "Райдер-трактор", price: 14000, radius: 0.55, rate: 1, range: 0, walk: 1.5, blurb: "Їдеш сидячи. Смуга метр десять." },
    ],
  },
  leaves: {
    id: "leaves", name: "Листя", short: "Листя", works: ["leaves"],
    levels: [
      { name: "Граблі", price: 0, radius: 0.55, rate: 14, range: 2.2, blurb: "Гребеш і гребеш." },
      { name: "Повітродувка-пилосос", price: 1400, radius: 0.9, rate: 40, range: 3.2, blurb: "Затягує листя просто в мішок." },
      { name: "Ранцевий пилосос", price: 4800, radius: 1.35, rate: 90, range: 4.2, blurb: "Двигун на спині, листя в повітрі." },
    ],
  },
  net: {
    id: "net", name: "Сачок для басейну", short: "Сачок", works: ["pool"],
    levels: [
      { name: "Сачок", price: 0, radius: 0.4, rate: 12, range: 4.2, blurb: "Виловлює листя з води." },
      { name: "Телескопічний сачок", price: 900, radius: 0.6, rate: 24, range: 6.5, blurb: "Дістає до середини басейну." },
    ],
  },
  mop: {
    id: "mop", name: "Швабра", short: "Швабра", works: ["mop"],
    levels: [
      { name: "Швабра з відром", price: 0, radius: 0.28, rate: 1.7, range: 3.0, blurb: "Класика." },
      { name: "Пароочисник", price: 2200, radius: 0.36, rate: 3.0, range: 3.1, blurb: "Пара бере навіть жир." },
      { name: "Миюча машина", price: 7000, radius: 0.55, rate: 4.6, range: 3.3, blurb: "Їздить сама, ти тільки направляєш." },
    ],
  },
  squeegee: {
    id: "squeegee", name: "Склоочисник", short: "Вікна", works: ["glass"],
    levels: [
      { name: "Склоочисник", price: 0, radius: 0.14, rate: 2.2, range: 2.4, blurb: "Гума і відро мильної води." },
      { name: "Телескопічний склоочисник", price: 700, radius: 0.2, rate: 3.4, range: 4.0, blurb: "Не треба лізти на підвіконня." },
    ],
  },
  paint: {
    id: "paint", name: "Фарбування", short: "Фарба", works: ["paint"],
    levels: [
      { name: "Шпатель і пензель", price: 600, radius: 0.13, rate: 1.4, range: 2.4, blurb: "Зішкребти стару фарбу, потім фарбувати." },
      { name: "Шліфмашинка і валик", price: 2600, radius: 0.2, rate: 2.4, range: 2.4, blurb: "Удвічі швидше." },
      { name: "Фарбопульт", price: 8000, radius: 0.34, rate: 3.8, range: 3.5, blurb: "Хмара фарби, рівний шар." },
    ],
  },
  detector: {
    id: "detector", name: "Металошукач", short: "Шукач", works: ["dig"],
    levels: [
      { name: "Металошукач", price: 1200, radius: 0.6, rate: 1, range: 4, blurb: "Пищить частіше, коли ближче." },
      { name: "Металошукач Pro", price: 4000, radius: 0.6, rate: 1.6, range: 8, blurb: "Показує напрямок і копає швидше." },
    ],
  },
};

export const TOOL_ORDER: ToolId[] = ["hands", "washer", "mower", "leaves", "net", "mop", "squeegee", "paint", "detector"];

/** Which tool does a kind of work. */
export const TOOL_FOR: Record<WorkKind, ToolId> = {
  wash: "washer", mop: "mop", glass: "squeegee", lawn: "mower", leaves: "leaves", pool: "net",
  paint: "paint", dig: "detector", pick: "hands", dish: "hands", fix: "hands", wipe: "hands",
};

/** Pay for 100% of a surface of this kind, per square metre. */
export const PAY_PER_M2: Partial<Record<WorkKind, number>> = {
  wash: 24, mop: 16, glass: 50, paint: 34, lawn: 2.2, wipe: 40,
};

export const PAY = {
  /** Per leaf collected from the lawn and deck. */
  leaf: 0.12,
  /** Per leaf fished out of the pool. */
  poolLeaf: 0.45,
  /** Pool chemistry after it is skimmed. */
  poolChem: 300,
  dish: 25,
  trash: 15,
  roofTile: 60,
  /** Lost item found with the detector (keys, ring). */
  lostItem: 400,
  /** Extra on completing a surface, as a share of its value. */
  finishBonus: 0.1,
};

/** Surface counts as done at this share clean (the rest is wiped with a sparkle). */
export const DONE_AT = 0.975;

/** Per-surface toughness: how much longer it takes than plain siding. */
export const TOUGH: Record<string, number> = {
  siding: 1, driveway: 1.5, path: 1.2, deck: 1.3, coping: 1.2, roof: 1.8, floor: 1, bath: 1.2,
  glass: 1, fence: 1, counter: 1.2, dish: 0.8, tiles: 1.1, fixture: 1.3, cabinets: 1,
};

export type PerkId =
  | "coffee" | "pockets" | "kid" | "weather" | "radio" | "calluses" | "foreman" | "discount" | "nightshift" | "dowser";

export interface PerkDef {
  id: PerkId;
  name: string;
  text: string;
}

export const PERKS: Record<PerkId, PerkDef> = {
  coffee: { id: "coffee", name: "Термос кави", text: "Усі інструменти працюють на 15% швидше." },
  pockets: { id: "pockets", name: "Діряві кишені", text: "Знайдених монет удвічі більше." },
  kid: { id: "kid", name: "Сусідський малий", text: "Сам потроху збирає листя, поки ти зайнятий іншим." },
  weather: { id: "weather", name: "Гарна погода", text: "День довшає на дві години." },
  radio: { id: "radio", name: "Сарафанне радіо", text: "Господарі платять на 10% більше." },
  calluses: { id: "calluses", name: "Мозолі", text: "Пензель, струмінь і швабра на 12% ширші." },
  foreman: { id: "foreman", name: "Бригадир", text: "Поверхня зараховується з 95%, а не з 97,5%." },
  discount: { id: "discount", name: "Знайомий у гаражі", text: "Техніка на 15% дешевша." },
  nightshift: { id: "nightshift", name: "Нічна зміна", text: "Після заходу сонця ще година роботи з ліхтарем." },
  dowser: { id: "dowser", name: "Нюх на метал", text: "Металошукач чує вдвічі далі." },
};

export const PERK_IDS = Object.keys(PERKS) as PerkId[];

/** Star thresholds by overall completion of a house. */
export const STARS = [0.5, 0.65, 0.8, 0.9, 0.97];

export const DAY = {
  startHour: 8,
  endHour: 20,
  /** Real seconds in one working day. */
  seconds: 600,
  /** Days a client gives you before taking the house as it is. */
  deadline: 3,
};

export interface HouseStyle {
  name: string;
  owner: string;
  siding: number;
  roof: number;
  door: number;
  trim: number;
  fencePaint: number;
}

/** Clients along the street. Picked by seed; colours tint the same house. */
export const CLIENTS: HouseStyle[] = [
  { name: "Садова, 14", owner: "пан Ігор", siding: 0xe9e4d6, roof: 0x6e3e30, door: 0x2f5b73, trim: 0xe8e2d6, fencePaint: 0x5d8a5a },
  { name: "Садова, 16", owner: "пані Ганна", siding: 0xdfe6e0, roof: 0x3d4448, door: 0x7a2d2a, trim: 0xf2f0ea, fencePaint: 0x3d6a8a },
  { name: "Вишнева, 3", owner: "дід Степан", siding: 0xeedfc2, roof: 0x5a3a2a, door: 0x355a3a, trim: 0xf4ead6, fencePaint: 0x8a5a3a },
  { name: "Вишнева, 7", owner: "пані Оксана", siding: 0xd9dfe8, roof: 0x6a3a2e, door: 0x2c3e66, trim: 0xffffff, fencePaint: 0x6b6b70 },
  { name: "Польова, 21", owner: "пан Василь", siding: 0xe8d9c8, roof: 0x4a4e3a, door: 0x5a2e4a, trim: 0xf0e6d6, fencePaint: 0x4a7a6a },
  { name: "Польова, 2", owner: "пані Стефа", siding: 0xf1ece0, roof: 0x7a3a28, door: 0x1f4a4a, trim: 0xe6dccb, fencePaint: 0x7a3a3a },
];

export const LOST_ITEMS = [
  { id: "keys", name: "ключі від гаража" },
  { id: "ring", name: "обручку" },
  { id: "watch", name: "дідів годинник" },
  { id: "medal", name: "медаль «Ветеран праці»" },
];
