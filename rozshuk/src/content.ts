/**
 * Content for «Розшук»: the story (15 levels with a fork after level 7),
 * perks, traits, home actions and random events. Pure data — no rendering —
 * so the simulation and the node tests can import it directly.
 */

import type { MapId } from "./maps.ts";

export type Path = "common" | "border" | "legal";
export type PatrolKind = "officer" | "police" | "van" | "guard" | "drone" | "boat";
export type ObjKind = "visit" | "shop" | "pay" | "pickup" | "talk" | "river" | "booth" | "sell";
export type Weather = "clear" | "rain" | "snow" | "fog";
export type Speaker = "me" | "mama" | "siryi" | "oleg" | "valya" | "channel" | "arkadiy" | "molfar" | "reserve" | "siryiMom";

export interface Msg { from: Speaker; text: string }

export interface ObjectiveDef {
  /** Map slot digit; "2|3" picks one at random per run. */
  slot: string;
  label: string;
  icon: string;
  kind: ObjKind;
  /** Seconds standing in the zone. */
  dwell: number;
  cost?: number;
  optional?: boolean;
  /** Only opens after this slot is done. */
  after?: string;
  /** Run state changes when completed. */
  gives?: { food?: number; money?: number; nerves?: number; heat?: number; item?: string; flag?: string };
  /** A dialogue played as a choice QTE when the dwell completes. */
  talk?: string;
}

export interface PatrolDef {
  kind: PatrolKind;
  /** Waypoint letters, visited in order. */
  route: string;
  /** Back and forth instead of a loop. */
  ping?: boolean;
}

export interface LevelDef {
  id: string;
  n: number;
  path: Path;
  title: string;
  map: MapId;
  night?: boolean;
  weather: Weather;
  /** One-line task shown on the briefing card and HUD. */
  brief: string;
  objectives: ObjectiveDef[];
  patrols: PatrolDef[];
  /** Extra patrols drawn at random: one more per ~30 heat, plus run luck. */
  pool: PatrolDef[];
  /** Seconds until the curfew patrols come out (0 = never). */
  curfew: number;
  /** Train-style levels: exit only opens after surviving this long. */
  survive?: number;
  /** The last objective ends the level on the spot (river, border booth). */
  noExit?: boolean;
  /** How hard QTEs are on this level, 1..3. */
  tier: number;
  chat: Msg[];
  outro: Msg[];
}

export const SPEAKERS: Record<Speaker, { name: string; icon: string; color: string }> = {
  me: { name: "Я", icon: "🙂", color: "#b8d84a" },
  mama: { name: "Мама", icon: "👩‍🦳", color: "#f2b632" },
  siryi: { name: "Сірий", icon: "🧢", color: "#54b7c6" },
  siryiMom: { name: "Сірий (телефон)", icon: "🧢", color: "#54b7c6" },
  oleg: { name: "Олег, тімлід", icon: "💼", color: "#9a8bd8" },
  valya: { name: "Баба Валя", icon: "👵", color: "#e8602f" },
  channel: { name: "«Де бус?» чат району", icon: "🚐", color: "#d63732" },
  arkadiy: { name: "Аркадій", icon: "🕴️", color: "#c9b37a" },
  molfar: { name: "Мольфар", icon: "🌲", color: "#6fae5a" },
  reserve: { name: "Резерв±", icon: "🤖", color: "#7f8a96" },
};

// --------------------------------------------------------------- levels

export const LEVELS: LevelDef[] = [
  // ======================= common trunk: days 1–14
  {
    id: "1", n: 1, path: "common", title: "Повістка в ящику", map: "dvir", weather: "clear", tier: 1, curfew: 0,
    brief: "Винеси сміття до баків і повернись додому.",
    objectives: [{ slot: "1", label: "Сміття до баків", icon: "🗑️", kind: "visit", dwell: 1.5, gives: { nerves: -5 } }],
    patrols: [{ kind: "officer", route: "cdfe" }],
    pool: [{ kind: "officer", route: "bg", ping: true }],
    chat: [
      { from: "reserve", text: "Шановний користувачу! Вас оголошено в розшук. Гарного дня 🙂" },
      { from: "mama", text: "Андрійку, у тебе все добре? Сусідка каже, у ваш двір приходили якісь у пікселі" },
      { from: "me", text: "Все ок, ма. Посиджу вдома трохи" },
      { from: "siryi", text: "Брат, не виходь без потреби. Місяць пересидиш — а там видно буде" },
      { from: "channel", text: "Двоє в пікселі ходять колом по двору на Шевченка. Біля гаражів не видно" },
      { from: "me", text: "…а сміття вже тиждень стоїть" },
    ],
    outro: [{ from: "siryi", text: "Красава. Перша вилазка — найстрашніша. Далі буде… теж страшно" }],
  },
  {
    id: "2", n: 2, path: "common", title: "Порожній холодильник", map: "street", weather: "rain", tier: 1, curfew: 0,
    brief: "Купи їжі в «Копійці» і повернись.",
    objectives: [{ slot: "2", label: "Купити їжу", icon: "🛒", kind: "shop", dwell: 3, cost: 1400, gives: { food: 4 } }],
    patrols: [{ kind: "officer", route: "ab", ping: true }, { kind: "van", route: "ijkl", ping: true }],
    pool: [{ kind: "officer", route: "eghf" }, { kind: "officer", route: "cd", ping: true }],
    chat: [
      { from: "me", text: "У холодильнику пів цибулини і гірчиця" },
      { from: "mama", text: "Їж нормально! Я б передала посилку, але біля пошти вони стоять" },
      { from: "channel", text: "По проспекту курсує білий бус. Не плутати з маршруткою: маршрутка зупиняється, де просиш" },
      { from: "siryi", text: "У «Копійці» охоронець свій. Головне — дійти" },
    ],
    outro: [{ from: "mama", text: "Купив? Молодець. Гречку не забув?" }],
  },
  {
    id: "3", n: 3, path: "common", title: "Ноутбук помер", map: "street", weather: "clear", tier: 1, curfew: 150,
    brief: "Забери зарядку з поштомату. Аптека — за бажанням.",
    objectives: [
      { slot: "3", label: "Поштомат: зарядка", icon: "📦", kind: "pickup", dwell: 2.5, gives: { flag: "laptop" } },
      { slot: "1", label: "Аптека: заспокійливе", icon: "💊", kind: "shop", dwell: 2.5, cost: 300, optional: true, gives: { nerves: -20 } },
    ],
    patrols: [{ kind: "officer", route: "eghf" }, { kind: "van", route: "ijkl", ping: true }],
    pool: [{ kind: "officer", route: "ab", ping: true }, { kind: "officer", route: "cd", ping: true }, { kind: "police", route: "gh", ping: true }],
    chat: [
      { from: "oleg", text: "Андрію, ти на дейлі? Тебе третій день не чути" },
      { from: "me", text: "Олеже, ноут здох. Зарядка згоріла" },
      { from: "oleg", text: "Замов нову в поштомат. Без роботи ми тебе довго не втримаємо 😬" },
      { from: "channel", text: "Біля поштомату вчора пакували курʼєра. Прямо з посилкою" },
    ],
    outro: [{ from: "oleg", text: "О, зʼявився онлайн! Тримай тікети, їх накопичилось 47" }],
  },
  {
    id: "4", n: 4, path: "common", title: "Блекаут", map: "night", night: true, weather: "clear", tier: 1, curfew: 0,
    brief: "Візьми зарядну станцію в пункті незламності (школа).",
    objectives: [
      { slot: "1", label: "Пункт незламності", icon: "🔋", kind: "pickup", dwell: 3, gives: { item: "powerbank" } },
      { slot: "2", label: "Кіоск: свічки", icon: "🕯️", kind: "shop", dwell: 2, cost: 200, optional: true, gives: { nerves: -10 } },
    ],
    patrols: [{ kind: "officer", route: "bdec" }, { kind: "officer", route: "fghi" }],
    pool: [{ kind: "officer", route: "a" }, { kind: "police", route: "di", ping: true }],
    chat: [
      { from: "channel", text: "Світла не буде до ранку. ТЦК ходять з ліхтариками" },
      { from: "mama", text: "У школі пункт незламності, там дають зарядні станції. Ти ж без світла не попрацюєш" },
      { from: "siryi", text: "Вночі тебе гірше видно. Але й ти їх не бачиш, поки ліхтар не світне. Через паркан школи можна перелізти" },
    ],
    outro: [{ from: "oleg", text: "Бачу, ти на звʼязку навіть у блекаут. Цінуємо!" }],
  },
  {
    id: "5", n: 5, path: "common", title: "Баба Валя", map: "dvir", weather: "rain", tier: 2, curfew: 160,
    brief: "Купи ліки в кіоску й віднеси бабі Валі.",
    objectives: [
      { slot: "2", label: "Кіоск: валідол", icon: "💊", kind: "shop", dwell: 2.5, cost: 250 },
      { slot: "3", label: "Віддати бабі Валі", icon: "👵", kind: "visit", dwell: 2, after: "2", gives: { flag: "valya", heat: -10 } },
    ],
    patrols: [{ kind: "officer", route: "cdfe" }, { kind: "van", route: "ah", ping: true }],
    pool: [{ kind: "officer", route: "bg", ping: true }, { kind: "police", route: "ef", ping: true }],
    chat: [
      { from: "valya", text: "Синку, я все бачу. Ти чого вдома сидиш, як усі на роботі?" },
      { from: "me", text: "Бабо Валю, я на удальонці" },
      { from: "valya", text: "Ну-ну. Принеси мені валідолу з кіоску. Тоді, може, і не бачила я тебе" },
      { from: "channel", text: "У дворах працюють бабусі-інформатори. Біля лавок не світіться" },
    ],
    outro: [{ from: "valya", text: "Дякую, синку. Я дівчатам скажу, щоб тебе не бачили 😉" }],
  },
  {
    id: "6", n: 6, path: "common", title: "Сірого забрали", map: "market", weather: "fog", tier: 2, curfew: 170,
    brief: "Забери кота Сірого з його кіоску на ринку.",
    objectives: [
      { slot: "1|2", label: "Кіт Сірого", icon: "🐈", kind: "pickup", dwell: 3, gives: { flag: "cat" } },
      { slot: "3", label: "Ноут Сірого (продати)", icon: "💻", kind: "pickup", dwell: 2, optional: true, gives: { money: 6000 } },
    ],
    patrols: [{ kind: "officer", route: "bc", ping: true }, { kind: "officer", route: "de", ping: true }, { kind: "van", route: "hi", ping: true }],
    pool: [{ kind: "officer", route: "afg" }, { kind: "police", route: "fg", ping: true }, { kind: "officer", route: "ab", ping: true }],
    chat: [
      { from: "channel", text: "ОБЛАВА НА РИНКУ. Пакують усіх підряд. Сірого з пʼятого підʼїзду — в бус" },
      { from: "mama", text: "Андрійку, Сірого забрали. Його мама плаче" },
      { from: "me", text: "Блін…" },
      { from: "siryiMom", text: "Це мама Сергія. Його кіт лишився в кіоску на ринку. Забереш? Ключ під ковриком" },
    ],
    outro: [{ from: "siryiMom", text: "Дякую, Андрію. Корми його двічі на день. Він любить, коли чешуть за вухом" }],
  },
  {
    id: "7", n: 7, path: "common", title: "Розвилка", map: "park", weather: "clear", tier: 2, curfew: 180,
    brief: "Зустрінься з Аркадієм (кавʼярня) і Мольфаром (гаражі).",
    objectives: [
      { slot: "1", label: "Аркадій у кавʼярні", icon: "🕴️", kind: "talk", dwell: 2, talk: "arkadiy" },
      { slot: "2", label: "Мольфар у гаражах", icon: "🌲", kind: "talk", dwell: 2, talk: "molfar" },
    ],
    patrols: [{ kind: "officer", route: "bcde" }, { kind: "van", route: "fg", ping: true }],
    pool: [{ kind: "officer", route: "ab", ping: true }, { kind: "police", route: "de", ping: true }],
    chat: [
      { from: "channel", text: "Кажуть, є двоє, хто «вирішує». Один — офіційно, другий — через гори" },
      { from: "arkadiy", text: "Добрий день. Мені вас порекомендували. Бронювання, відрядження, виїзд. Офіційно. Дорого. Кавʼярня в парку" },
      { from: "molfar", text: "Йо. Я по лісах. Дешевше, ніж у костюма, але мокро. Гаражі за парком" },
      { from: "me", text: "Ще 16 днів так не висиджу. Треба вирішувати" },
    ],
    outro: [{ from: "me", text: "Офіційно чи через ліс… Думай, голово" }],
  },

  // ======================= path A: border (illegal), days 15–30
  {
    id: "8a", n: 8, path: "border", title: "Спорядження", map: "market", weather: "rain", tier: 2, curfew: 190,
    brief: "Купи рюкзак, термоковдру і гермомішок на ринку.",
    objectives: [
      { slot: "3", label: "Рюкзак", icon: "🎒", kind: "shop", dwell: 2, cost: 3500, gives: { item: "backpack" } },
      { slot: "4", label: "Термоковдра", icon: "🪩", kind: "shop", dwell: 2, cost: 2500, gives: { item: "blanket" } },
      { slot: "1|2", label: "Гермомішок", icon: "🛍️", kind: "shop", dwell: 2, cost: 2000, gives: { item: "drybag" } },
    ],
    patrols: [{ kind: "officer", route: "bc", ping: true }, { kind: "officer", route: "de", ping: true }, { kind: "van", route: "hi", ping: true }],
    pool: [{ kind: "officer", route: "afg" }, { kind: "police", route: "fg", ping: true }, { kind: "officer", route: "ab", ping: true }],
    chat: [
      { from: "molfar", text: "Список: рюкзак, термоковдра, гермомішок. Усе є на ринку" },
      { from: "molfar", text: "Над лісом літає дрон із тепловізором. Під термоковдрою стоїш і не рухаєшся — він тебе не бачить" },
      { from: "channel", text: "На ринку знову облава, бус біля входу" },
    ],
    outro: [{ from: "molfar", text: "Тепер гроші. 60 тисяч, наперед. Не я такий — ліс такий" }],
  },
  {
    id: "9a", n: 9, path: "border", title: "Гроші на провідника", map: "street", weather: "rain", tier: 2, curfew: 160,
    brief: "Здай речі в ломбард і закупи їжі в дорогу.",
    objectives: [
      { slot: "3", label: "Ломбард", icon: "💍", kind: "sell", dwell: 3, gives: { money: 9000 } },
      { slot: "2", label: "Їжа в дорогу", icon: "🥫", kind: "shop", dwell: 2.5, cost: 1500, gives: { food: 4 } },
    ],
    patrols: [{ kind: "officer", route: "eghf" }, { kind: "officer", route: "ab", ping: true }, { kind: "van", route: "ijkl", ping: true }],
    pool: [{ kind: "officer", route: "cd", ping: true }, { kind: "police", route: "gh", ping: true }, { kind: "officer", route: "ef", ping: true }],
    chat: [
      { from: "siryi", text: "Брат, я в учебці. Телефон дали на 10 хвилин. Ти як?" },
      { from: "me", text: "Збираюсь. Через ліс" },
      { from: "siryi", text: "Ну… це твій вибір. Кота не забудь комусь віддати. Бережи себе" },
      { from: "molfar", text: "Продай усе, що не береш із собою. Ломбард на розі" },
    ],
    outro: [{ from: "mama", text: "Ти куди це зібрався? Не кажи по телефону. Я молитимусь" }],
  },
  {
    id: "10a", n: 10, path: "border", title: "Вокзал", map: "station", weather: "fog", tier: 2, curfew: 0,
    brief: "Купи квиток у касі й сядь у свій вагон.",
    objectives: [
      { slot: "3", label: "Каса: квиток", icon: "🎫", kind: "shop", dwell: 3, cost: 900 },
      { slot: "1|2", label: "Твій вагон", icon: "🚃", kind: "visit", dwell: 2, after: "3" },
    ],
    patrols: [{ kind: "officer", route: "ab", ping: true }, { kind: "officer", route: "cd", ping: true }, { kind: "police", route: "e" }],
    pool: [{ kind: "officer", route: "fg", ping: true }, { kind: "officer", route: "acdb" }, { kind: "police", route: "cd", ping: true }],
    noExit: true,
    chat: [
      { from: "molfar", text: "Нічний потяг на захід. На вокзалі пасуть кожен вагон, але квиток купиш — і ти пасажир" },
      { from: "channel", text: "На вокзалі патрулі на обох пероні. Підземний перехід не працює" },
    ],
    outro: [{ from: "me", text: "Сів. Серце калатає так, що чути на весь вагон" }],
  },
  {
    id: "11a", n: 11, path: "border", title: "Нічний потяг", map: "train", night: true, weather: "clear", tier: 2, curfew: 0, survive: 70,
    brief: "Рейд у потязі. Протримайся до станції і вийди в тамбур.",
    objectives: [],
    patrols: [{ kind: "officer", route: "abcd", ping: true }],
    pool: [{ kind: "police", route: "dcba", ping: true }, { kind: "officer", route: "cb", ping: true }],
    chat: [
      { from: "channel", text: "У нічному потязі рейд: ідуть вагонами, будять усіх" },
      { from: "molfar", text: "Ховайся між полицями або в туалеті. Біля станції — у тамбур і на вихід" },
    ],
    outro: [{ from: "molfar", text: "Вийшов? Добре. Далі пішки, село за пагорбом" }],
  },
  {
    id: "12a", n: 12, path: "border", title: "Село", map: "village", weather: "fog", tier: 3, curfew: 0,
    brief: "Знайди хату Мольфара і заплати йому.",
    objectives: [
      { slot: "1", label: "Заплатити Мольфару", icon: "💵", kind: "pay", dwell: 2.5, cost: 60000, gives: { flag: "guide" } },
      { slot: "2", label: "Сільмаг", icon: "🥖", kind: "shop", dwell: 2, cost: 700, optional: true, gives: { food: 3 } },
    ],
    patrols: [{ kind: "police", route: "bcgf", ping: false }, { kind: "guard", route: "ade", ping: true }],
    pool: [{ kind: "guard", route: "fe", ping: true }, { kind: "guard", route: "bc", ping: true }],
    chat: [
      { from: "molfar", text: "Хата за синім парканом, ліворуч. Собак не бійся, вони добрі. Майже" },
      { from: "channel", text: "У прикордонних селах ходить дільничний і прикордонники. Чужих видно здалеку" },
    ],
    outro: [{ from: "molfar", text: "Гроші отримав. Завтра — схрон у лісі" }],
  },
  {
    id: "13a", n: 13, path: "border", title: "Схрон", map: "forest", weather: "fog", tier: 3, curfew: 0,
    brief: "Забери речі зі схрону і йди лісом далі.",
    objectives: [{ slot: "1", label: "Схрон", icon: "🪵", kind: "pickup", dwell: 3, gives: { food: 2, nerves: -10 } }],
    patrols: [{ kind: "guard", route: "bdgh" }, { kind: "drone", route: "acef" }],
    pool: [{ kind: "guard", route: "ce", ping: true }, { kind: "guard", route: "fgh" }],
    chat: [
      { from: "molfar", text: "Схрон під поваленою ялиною. Дрон над лісом — термоковдра, не рухайся" },
    ],
    outro: [{ from: "molfar", text: "Остання ніч перед річкою. Поспи, якщо зможеш" }],
  },
  {
    id: "14a", n: 14, path: "border", title: "Ліс", map: "forest", night: true, weather: "snow", tier: 3, curfew: 0,
    brief: "Перейди нічний ліс до річки.",
    objectives: [],
    patrols: [{ kind: "guard", route: "bdgh" }, { kind: "guard", route: "ce", ping: true }, { kind: "drone", route: "afeb" }],
    pool: [{ kind: "guard", route: "fgh" }, { kind: "drone", route: "hg", ping: true }],
    chat: [
      { from: "molfar", text: "Далі сам. Я ближче не підходжу — мене знають" },
      { from: "mama", text: "Сину. Просто напиши, що живий" },
    ],
    outro: [{ from: "me", text: "Чую воду" }],
  },
  {
    id: "15a", n: 15, path: "border", title: "Річка", map: "river", night: true, weather: "snow", tier: 3, curfew: 0, noExit: true,
    brief: "Дійди до броду і перепливи.",
    objectives: [{ slot: "1", label: "Переправа", icon: "🌊", kind: "river", dwell: 1 }],
    patrols: [{ kind: "guard", route: "ceh" }, { kind: "boat", route: "ab", ping: true }, { kind: "drone", route: "dfg" }],
    pool: [{ kind: "guard", route: "fe", ping: true }, { kind: "guard", route: "gh", ping: true }],
    chat: [
      { from: "molfar", text: "Вода крижана. Пливи навскіс до течії. І не думай" },
      { from: "channel", text: "…" },
    ],
    outro: [],
  },

  // ======================= path B: legal (expensive), days 15–30
  {
    id: "8b", n: 8, path: "legal", title: "Співбесіда", map: "office", weather: "clear", tier: 2, curfew: 0,
    brief: "Пройди співбесіду й оплати оформлення.",
    objectives: [
      { slot: "1", label: "Співбесіда в HR", icon: "🤝", kind: "talk", dwell: 2, talk: "hr" },
      { slot: "2", label: "Бухгалтерія: оформлення", icon: "💵", kind: "pay", dwell: 2.5, cost: 25000, after: "1", gives: { flag: "job" } },
      { slot: "3", label: "Кулер з водою", icon: "🚰", kind: "visit", dwell: 1.5, optional: true, gives: { nerves: -8 } },
    ],
    patrols: [{ kind: "police", route: "abc", ping: true }],
    pool: [{ kind: "officer", route: "cde", ping: true }, { kind: "officer", route: "ab", ping: true }],
    chat: [
      { from: "arkadiy", text: "Є підприємство з критичним статусом. Вас оформлять «аналітиком даних». Віддалено. Співбесіда завтра" },
      { from: "arkadiy", text: "Оформлення — 25 тисяч у бухгалтерії. Охорона в бізнес-центрі звичайна. Майже" },
      { from: "oleg", text: "Ти що, звільняєшся?! Ну… удачі. Пиши, якщо що" },
    ],
    outro: [{ from: "arkadiy", text: "Вітаю з новою роботою. Зарплата вища, але і мої послуги теж" }],
  },
  {
    id: "9b", n: 9, path: "legal", title: "ЦНАП", map: "center", weather: "rain", tier: 2, curfew: 170,
    brief: "Отримай довідку в ЦНАПі.",
    objectives: [
      { slot: "1", label: "ЦНАП: довідка", icon: "📄", kind: "pickup", dwell: 6, gives: { flag: "cert" } },
      { slot: "3", label: "Кавʼярня", icon: "☕", kind: "shop", dwell: 2, cost: 90, optional: true, gives: { nerves: -12 } },
    ],
    patrols: [{ kind: "officer", route: "ab", ping: true }, { kind: "officer", route: "cd", ping: true }, { kind: "van", route: "ef", ping: true }],
    pool: [{ kind: "police", route: "gh", ping: true }, { kind: "officer", route: "acdb" }, { kind: "officer", route: "gh", ping: true }],
    chat: [
      { from: "arkadiy", text: "Потрібна довідка з ЦНАПу. Так, біля ЦНАПу завжди стоїть бус. Ні, інакше не можна" },
      { from: "channel", text: "Біля ЦНАПу двоє в пікселі, бус за фонтаном" },
    ],
    outro: [{ from: "arkadiy", text: "Довідку отримав. Наступний крок — перший транш" }],
  },
  {
    id: "10b", n: 10, path: "legal", title: "Перший транш", map: "street", weather: "clear", tier: 2, curfew: 160,
    brief: "Переведи Аркадію 60 000 ₴ через банк.",
    objectives: [
      { slot: "1", label: "Банк: переказ", icon: "🏦", kind: "pay", dwell: 4, cost: 60000, gives: { flag: "paid1" } },
      { slot: "2", label: "Купити їжу", icon: "🛒", kind: "shop", dwell: 2.5, cost: 1500, optional: true, gives: { food: 4 } },
    ],
    patrols: [{ kind: "officer", route: "ab", ping: true }, { kind: "officer", route: "eghf" }, { kind: "van", route: "ijkl", ping: true }],
    pool: [{ kind: "officer", route: "cd", ping: true }, { kind: "police", route: "gh", ping: true }],
    chat: [
      { from: "arkadiy", text: "60 тисяч через банк. Готівкою не беру, я ж офіційно" },
      { from: "mama", text: "Сину, а він точно не шахрай? По телевізору показували…" },
    ],
    outro: [{ from: "arkadiy", text: "Надійшло. Тепер — оновлення даних" }],
  },
  {
    id: "11b", n: 11, path: "legal", title: "Оновити дані", map: "office", weather: "clear", tier: 3, curfew: 0,
    brief: "Оновити дані… особисто. У ТЦК. Не попадись у коридорі.",
    objectives: [
      { slot: "1", label: "Вікно реєстрації", icon: "🪪", kind: "talk", dwell: 3, talk: "tck" },
      { slot: "3", label: "ВЛК: печатка", icon: "🩺", kind: "visit", dwell: 4, after: "1", gives: { flag: "vlk" } },
    ],
    patrols: [{ kind: "officer", route: "abc", ping: true }, { kind: "officer", route: "cde", ping: true }],
    pool: [{ kind: "officer", route: "ab", ping: true }, { kind: "officer", route: "ce", ping: true }],
    chat: [
      { from: "arkadiy", text: "Для броні треба оновити дані. Особисто. У ТЦК" },
      { from: "me", text: "Ви знущаєтесь?" },
      { from: "arkadiy", text: "У вас запис на 10:40, вікно №1. Ідіть прямо до вікна, по коридорах не гуляйте" },
    ],
    outro: [{ from: "me", text: "Я вийшов із ТЦК. Сам. Ногами. Ніхто не повірить" }],
  },
  {
    id: "12b", n: 12, path: "legal", title: "Бронь", map: "center", weather: "snow", tier: 3, curfew: 170,
    brief: "Віднеси другий транш в офіс Аркадія й забери бронь.",
    objectives: [
      { slot: "3", label: "Офіс Аркадія: бронь", icon: "🛡️", kind: "pay", dwell: 4, cost: 50000, gives: { item: "bron" } },
      { slot: "2", label: "Банкомат", icon: "🏧", kind: "visit", dwell: 2, optional: true, gives: { nerves: -5 } },
    ],
    patrols: [{ kind: "officer", route: "ab", ping: true }, { kind: "officer", route: "cd", ping: true }, { kind: "van", route: "ef", ping: true }],
    pool: [{ kind: "police", route: "gh", ping: true }, { kind: "officer", route: "acdb" }, { kind: "officer", route: "gh", ping: true }],
    chat: [
      { from: "arkadiy", text: "Бронь готова. Друга частина — 50 тисяч. Офіс на площі, праворуч від фонтану" },
      { from: "arkadiy", text: "З броньою при перевірці документів просто показуйте її. Зазвичай працює" },
    ],
    outro: [{ from: "arkadiy", text: "Залишилось відрядження. Я на звʼязку. Майже завжди" }],
  },
  {
    id: "13b", n: 13, path: "legal", title: "Аркадій зник", map: "market", weather: "fog", tier: 3, curfew: 180,
    brief: "Аркадій не відповідає. Знайди його на ринку.",
    objectives: [{ slot: "1|2", label: "Знайти Аркадія", icon: "🕵️", kind: "talk", dwell: 3, talk: "arkadiyFound" }],
    patrols: [{ kind: "officer", route: "bc", ping: true }, { kind: "officer", route: "de", ping: true }, { kind: "van", route: "hi", ping: true }],
    pool: [{ kind: "officer", route: "afg" }, { kind: "police", route: "fg", ping: true }, { kind: "officer", route: "ab", ping: true }],
    chat: [
      { from: "channel", text: "У місті затримали «вирішувачів» — двох у костюмах і одного в пікселі" },
      { from: "me", text: "Аркадію? Аркадію!!!" },
      { from: "reserve", text: "Абонент тимчасово недоступний 🙂" },
      { from: "mama", text: "Може, він просто у відпустці? Сусідка бачила його на ринку біля кіосків" },
    ],
    outro: [{ from: "arkadiy", text: "Не пишіть мені більше з цього номера. Наказ про відрядження буде. Чекайте" }],
  },
  {
    id: "14b", n: 14, path: "legal", title: "Відрядження", map: "station", weather: "rain", tier: 3, curfew: 0,
    brief: "Забери наказ у курʼєра, заплати і купи квиток.",
    objectives: [
      { slot: "1|2", label: "Курʼєр: наказ", icon: "📜", kind: "pay", dwell: 3, cost: 35000, gives: { flag: "trip" } },
      { slot: "3", label: "Каса: квиток", icon: "🎫", kind: "shop", dwell: 3, cost: 900 },
    ],
    patrols: [{ kind: "officer", route: "ab", ping: true }, { kind: "officer", route: "cd", ping: true }, { kind: "police", route: "e" }],
    pool: [{ kind: "officer", route: "fg", ping: true }, { kind: "officer", route: "acdb" }],
    chat: [
      { from: "arkadiy", text: "Наказ про відрядження — 35 тисяч, курʼєр чекає на пероні. Квиток купите самі" },
      { from: "oleg", text: "Чув, ти їдеш? Привези сирок, якщо що 😅" },
    ],
    outro: [{ from: "me", text: "Папери в рюкзаку. Перевіряю їх кожні пʼять хвилин" }],
  },
  {
    id: "15b", n: 15, path: "legal", title: "КПП", map: "checkpoint", weather: "clear", tier: 3, curfew: 0, noExit: true,
    brief: "Пройди попередню перевірку і віконце прикордонника.",
    objectives: [
      { slot: "2", label: "Попередня перевірка", icon: "🧾", kind: "visit", dwell: 4 },
      { slot: "1", label: "Віконце прикордонника", icon: "🛂", kind: "booth", dwell: 2, after: "2" },
    ],
    patrols: [{ kind: "guard", route: "ac", ping: true }, { kind: "guard", route: "bd", ping: true }, { kind: "officer", route: "ef", ping: true }],
    pool: [{ kind: "guard", route: "ab", ping: true }, { kind: "officer", route: "cd", ping: true }],
    chat: [
      { from: "arkadiy", text: "На кордоні відповідайте чітко, по документах. Удачі. Чек я не виписую" },
      { from: "mama", text: "Я поставила свічку. Дві" },
    ],
    outro: [],
  },
];

export const levelById = (id: string): LevelDef | undefined => LEVELS.find((l) => l.id === id);

/** The level that follows `id` on `path` (null after the finale). */
export function nextLevelId(id: string, path: Path): string | null {
  const cur = levelById(id);
  if (!cur) return null;
  if (cur.n >= 15) return null;
  const want = cur.n + 1;
  const p = want <= 7 ? "common" : path;
  return LEVELS.find((l) => l.n === want && l.path === p)?.id ?? null;
}

// --------------------------------------------------------------- dialogues

export interface TalkOption { id: string; label: string; good: boolean; effect?: { money?: number; nerves?: number; heat?: number; flag?: string } }
export interface Talk { who: Speaker; line: string; options: TalkOption[] }

export const TALKS: Record<string, Talk> = {
  arkadiy: {
    who: "arkadiy", line: "Бронь, відрядження, виїзд. Усе по закону. Близько 170 тисяч. Цікаво?",
    options: [
      { id: "ok", label: "Розкажіть детальніше", good: true, effect: { nerves: -5 } },
      { id: "haggle", label: "А знижки є?", good: true, effect: { flag: "haggle" } },
      { id: "rude", label: "Ви шахрай?", good: false, effect: { nerves: 5 } },
    ],
  },
  molfar: {
    who: "molfar", line: "Ліс, село, річка. 60 тисяч і твої ноги. Не страшно?",
    options: [
      { id: "ok", label: "Страшно. Але згоден слухати", good: true, effect: { nerves: -5 } },
      { id: "brave", label: "Я в армії не служив, але в походи ходив", good: true },
      { id: "rude", label: "А якщо ти мене кинеш?", good: false, effect: { nerves: 5 } },
    ],
  },
  hr: {
    who: "arkadiy", line: "HR: «Чому ви хочете працювати саме в нас?»",
    options: [
      { id: "truth", label: "Ваш критичний статус надихає", good: true },
      { id: "skills", label: "Я Excel знаю. Майже", good: true },
      { id: "rude", label: "Бо мене шукає ТЦК", good: false, effect: { heat: 5 } },
    ],
  },
  tck: {
    who: "reserve", line: "Працівниця ТЦК: «Дата народження? Місце проживання? Чого не оновились вчасно?»",
    options: [
      { id: "calm", label: "Оновлююсь зараз, ось запис", good: true },
      { id: "docs", label: "Ось довідка з ЦНАПу", good: true },
      { id: "panic", label: "Я… просто мимо проходив", good: false, effect: { heat: 15, nerves: 15 } },
    ],
  },
  arkadiyFound: {
    who: "arkadiy", line: "Тихо! Не кричіть. За мною стежать. Справи йдуть, але треба ще 10 тисяч «на ризики»",
    options: [
      { id: "pay", label: "Добре, ось 10 тисяч", good: true, effect: { money: -10000 } },
      { id: "press", label: "Ні. Ви вже отримали 115", good: true, effect: { nerves: 10 } },
      { id: "threat", label: "Я все розкажу в чаті району!", good: false, effect: { heat: 10 } },
    ],
  },
};

/** Questions at the border booth for the legal ending; each needs a paper. */
export const BOOTH: Array<{ q: string; paper: string; right: string; wrong: string[] }> = [
  { q: "Мета виїзду?", paper: "trip", right: "Службове відрядження, ось наказ", wrong: ["Відпочинок", "Ну… до тітки"] },
  { q: "Підстава для перетину?", paper: "bron", right: "Бронювання від критичного підприємства", wrong: ["Я тут випадково", "А що, треба?"] },
  { q: "Де працюєте?", paper: "job", right: "Аналітик даних, ось трудовий договір", wrong: ["Фрилансер", "Ніде, але шукаю"] },
];

// --------------------------------------------------------------- perks & traits

export type PerkId =
  | "sneakers" | "hoodie" | "intel" | "dog" | "parkour" | "calm" | "stash" | "scooter" | "laptop"
  | "station" | "lawyer" | "quiet" | "noodles" | "coffee" | "babki" | "tongue" | "lungs" | "courier";

export interface Perk { id: PerkId; name: string; icon: string; text: string; once?: boolean }

export const PERKS: Perk[] = [
  { id: "sneakers", name: "КРОСІВКИ З РИНКУ", icon: "👟", text: "Витривалість для бігу +35%, тиснути на QTE-кнопку легше." },
  { id: "hoodie", name: "ЧОРНЕ ХУДІ", icon: "🥷", text: "Тебе бачать з меншої відстані (−20%)." },
  { id: "intel", name: "ПІДПИСКА «ДЕ БУС?»", icon: "📡", text: "Стрілки на краю екрана показують патрулі за кадром." },
  { id: "dog", name: "ПЕС БАРБОС", icon: "🐕", text: "Чоловік із собакою підозрілий менше (−25%). Відмазка «вигулюю пса» при перевірці." },
  { id: "parkour", name: "ПАРКУР", icon: "🤸", text: "Зелені зони в QTE на 40% ширші." },
  { id: "calm", name: "ХОЛОДНА ГОЛОВА", icon: "🧊", text: "Нерви накопичуються на 40% повільніше." },
  { id: "stash", name: "ЗАНАЧКА", icon: "💰", text: "+12 000 ₴ одразу. Знайшов у зимовій куртці.", once: true },
  { id: "scooter", name: "ЕЛЕКТРОСАМОКАТ", icon: "🛴", text: "Швидкість ходьби +15%." },
  { id: "laptop", name: "ІГРОВИЙ НОУТ", icon: "💻", text: "Заробіток з віддаленки +30%." },
  { id: "station", name: "ЗАРЯДНА СТАНЦІЯ+", icon: "🔌", text: "Працюєш навіть у блекаут, і ще +1 дія вдома в такі дні." },
  { id: "lawyer", name: "АДВОКАТ НА ШВИДКОМУ", icon: "⚖️", text: "Один раз витягне тебе з бусу.", once: true },
  { id: "quiet", name: "МʼЯКІ КЕДИ", icon: "🩰", text: "Біг чути вдвічі тихіше." },
  { id: "noodles", name: "МІВІНА ОПТОМ", icon: "🍜", text: "+6 запасів їжі. Ситість падає на 25% повільніше." },
  { id: "coffee", name: "КАВА 3-В-1", icon: "☕", text: "+1 дія вдома щодня." },
  { id: "babki", name: "ДРУЖБА З БАБЦЯМИ", icon: "🧶", text: "Бабусі на лавках тебе «не бачать»." },
  { id: "tongue", name: "ЯЗИК БЕЗ КІСТОК", icon: "👅", text: "«Заговорити зуби» коротше, на відповіді більше часу." },
  { id: "lungs", name: "ДИХАЛКА", icon: "🫁", text: "Затамувати подих і пливти — значно легше." },
  { id: "courier", name: "КУРʼЄРСЬКИЙ РЮКЗАК", icon: "🟨", text: "Перші 1,5 с тебе сприймають як курʼєра і не підозрюють." },
];

export const perkById = (id: string): Perk | undefined => PERKS.find((p) => p.id === id);

export type TraitId = "it" | "athlete" | "quietguy" | "mamas" | "nephew";
export interface Trait { id: TraitId; name: string; icon: string; text: string; xp: number }

export const TRAITS: Trait[] = [
  { id: "it", name: "АЙТІШНИК", icon: "🧑‍💻", text: "Старт 15 000 ₴. Заробіток +25%.", xp: 0 },
  { id: "athlete", name: "СПОРТСМЕН", icon: "🏃", text: "Витривалість +40%, легші QTE на силу. Їсть більше.", xp: 25 },
  { id: "quietguy", name: "ТИХОНЯ", icon: "🤫", text: "Підозра −20%, біг тихіший. Старт 9 000 ₴.", xp: 60 },
  { id: "mamas", name: "МАМИН СИНОК", icon: "🥟", text: "Мама передає їжу і гроші. +4 запаси на старті.", xp: 110 },
  { id: "nephew", name: "ПЛЕМІННИК ДЕПУТАТА", icon: "🎩", text: "Старт 70 000 ₴, але розшук з першого дня 50.", xp: 200 },
];

// --------------------------------------------------------------- home

export type ActionId = "work" | "eat" | "sleep" | "scroll" | "mama" | "cat" | "pushups";

export interface HomeAction { id: ActionId; name: string; icon: string; text: string }

export const ACTIONS: HomeAction[] = [
  { id: "work", name: "ВІДДАЛЕНКА", icon: "💻", text: "Закривай тікети — отримуй гроші. Нерви +." },
  { id: "eat", name: "ПОЇСТИ", icon: "🍲", text: "−1 запас, ситість +45." },
  { id: "sleep", name: "ПОСПАТИ", icon: "😴", text: "Нерви −25." },
  { id: "scroll", name: "ЧАТ «ДЕ БУС?»", icon: "📡", text: "На вилазці побачиш маршрути патрулів. Нерви +6." },
  { id: "mama", name: "ПОДЗВОНИТИ МАМІ", icon: "📞", text: "Нерви −15. Інколи мама щось передає." },
  { id: "pushups", name: "ВІДЖИМАННЯ", icon: "💪", text: "На наступній вилазці +30% витривалості." },
  { id: "cat", name: "ПОГЛАДИТИ КОТА", icon: "🐈", text: "Нерви −20. Кіт не засуджує." },
];

export interface HomeEvent {
  id: string;
  title: string;
  text: string;
  icon: string;
  /** Minimum level number. */
  from: number;
  choices?: Array<{ label: string; effect: { money?: number; nerves?: number; heat?: number; food?: number; flag?: string } }>;
  effect?: { money?: number; nerves?: number; heat?: number; food?: number; flag?: string };
}

export const EVENTS: HomeEvent[] = [
  { id: "blackout", icon: "🕯️", title: "Графік відключень", text: "Світла не буде весь день. Без зарядної станції віддаленка не працює.", from: 2, effect: { flag: "blackout" } },
  { id: "parcel", icon: "📦", title: "Посилка від мами", text: "Сусідка принесла від мами торбу: вареники, сало, банка огірків.", from: 2, effect: { food: 3, nerves: -5 } },
  {
    id: "scam", icon: "☎️", title: "«Служба безпеки банку»", text: "«Ваша картка заблокована. Назвіть код із СМС».", from: 2,
    choices: [{ label: "Назвати код", effect: { money: -5000, nerves: 15 } }, { label: "Покласти трубку", effect: { nerves: 3 } }],
  },
  { id: "reserve", icon: "🤖", title: "Резерв±", text: "Застосунок надіслав тобі ще одну повістку. З емодзі.", from: 2, effect: { nerves: 10, heat: 4 } },
  { id: "bills", icon: "🧾", title: "Комуналка", text: "Прийшла платіжка. Тепло дали, ціни теж.", from: 3, effect: { money: -1800 } },
  { id: "tip", icon: "📡", title: "Сусід Віталік", text: "«Брат, я теж ховаюсь. Тримай схему, де вони сьогодні ходять».", from: 2, effect: { flag: "intel" } },
  { id: "bonus", icon: "💸", title: "Премія", text: "Олег виписав премію за закриті тікети. Нечувано.", from: 3, effect: { money: 4000, nerves: -5 } },
  { id: "prices", icon: "📈", title: "Ціни виросли", text: "Гречка подорожчала. Знову.", from: 4, effect: { flag: "prices" } },
  { id: "meme", icon: "😂", title: "Мем від Сірого", text: "Сірий скинув мем про бус-таксі. Смішно і страшно.", from: 2, effect: { nerves: -8 } },
  {
    id: "neighbor", icon: "🧔", title: "Сусід просить допомогти", text: "Сусід знизу просить винести шафу. На вулицю.", from: 3,
    choices: [{ label: "Допомогти (ризик)", effect: { money: 2500, heat: 8 } }, { label: "«Я на дзвінку»", effect: { nerves: 5 } }],
  },
  { id: "rain", icon: "🌧️", title: "Злива", text: "Цілий день дощ. Патрулі сидять у бусі, а ти спиш як немовля.", from: 2, effect: { nerves: -10, heat: -4 } },
  {
    id: "delivery", icon: "🛵", title: "Доставка їжі", text: "Можна замовити їжу додому. Курʼєр може бути «не курʼєр».", from: 3,
    choices: [{ label: "Замовити (1 500 ₴)", effect: { money: -1500, food: 3, heat: 5 } }, { label: "Не ризикувати", effect: {} }],
  },
];

/** Knocking on the door: the hold-your-breath QTE at home, more likely at high heat. */
export const KNOCK_TEXT = "Тук-тук-тук. «Відкривайте, ТЦК! Ми знаємо, що ви вдома»";

export const ENDINGS = {
  border: {
    title: "ТОЙ БЕРЕГ",
    text: "Ти виповз на той берег — мокрий, живий, без нічого. Мама плаче в трубку. Повернутися додому тепер буде непросто. Але місяць ти протримався.",
  },
  legal: {
    title: "ШТАМП",
    text: "Штамп. Шлагбаум. Ти за кордоном — з документами і мінус 170 тисяч. Аркадій видалив акаунт. Кіт у мами. Колись ти, може, повернешся легально.",
  },
  caught: {
    title: "БУСИФІКАЦІЯ",
    text: "Двері бусу зачинились. Далі — ВЛК, учебка і зовсім інша гра. Сірий, до речі, передає привіт.",
  },
};
