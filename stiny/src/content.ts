/**
 * Content for «Чотири стіни»: the sixteen seasons from winter 2023 to autumn
 * 2026, what the flat lets you do, the habits that help you through, the
 * friends and what happens to them, and the thoughts that come when it gets
 * bad. Pure data, no rendering imports, so the tests can load it directly.
 */

// ------------------------------------------------------------------ seasons

export const SEASON_NAMES = ["ЗИМА", "ВЕСНА", "ЛІТО", "ОСІНЬ"] as const;
export const SEASONS = 16;

export interface YearDef {
  year: number;
  /** Chance that the van is parked in the courtyard on a given day. */
  bus: number;
  /** Chance of an air-raid alert during the day. */
  alert: number;
  /** Share of alerts that are ballistic (seconds to reach the corridor). */
  ballistic: number;
  /** Prices multiplier (delivery, bills). */
  prices: number;
  /** How much remote work there still is. */
  market: number;
  /** Psyche lost per season just by the year being what it is. */
  pressure: number;
  /** Heat (attention of the draft office) added per season. */
  heat: number;
  /** How often someone knocks, before heat. */
  knock: number;
}

export const YEARS: YearDef[] = [
  { year: 2023, bus: 0.04, alert: 0.55, ballistic: 0.1, prices: 1, market: 1, pressure: 2, heat: 2, knock: 0.08 },
  { year: 2024, bus: 0.18, alert: 0.65, ballistic: 0.25, prices: 1.2, market: 0.85, pressure: 4, heat: 5, knock: 0.15 },
  { year: 2025, bus: 0.45, alert: 0.8, ballistic: 0.4, prices: 1.45, market: 0.72, pressure: 7, heat: 8, knock: 0.25 },
  { year: 2026, bus: 0.7, alert: 0.9, ballistic: 0.55, prices: 1.7, market: 0.6, pressure: 10, heat: 10, knock: 0.35 },
];

export interface SeasonDef {
  title: string;
  intro: string;
  /** Hours without power in a day: 0, ~4 (two windows) or ~8. */
  blackout: 0 | 1 | 2;
  /** Water cut for part of the day. */
  water: boolean;
  /** Short facts shown on the season card. */
  facts: string[];
}

export const SEASON_DEFS: SeasonDef[] = [
  {
    title: "Світло за графіком", blackout: 2, water: false,
    intro: "Січень. Генератори гудуть під кожною кавʼярнею. Друзі кличуть: «Ходімо на каву, всі ходять». Ти кажеш, що багато роботи. Насправді ти просто вирішив не ризикувати. Поки що.",
    facts: ["Відключення: двічі на день", "Бус у дворі: майже ніколи", "Друзі ще всі тут"],
  },
  {
    title: "Каштани", blackout: 0, water: false,
    intro: "Каштани цвітуть. У дворі діти, на лавках сусідки. Повістки роздають біля метро, але в чаті пишуть, що на Позняках тихо. Ти дивишся на все це з вікна.",
    facts: ["Світло є", "Тривоги — вночі частіше", "Місто живе. Без тебе"],
  },
  {
    title: "Тераси", blackout: 0, water: false,
    intro: "Київ живе: тераси, концерти на збір, фото з Труханова. Ти не був на вулиці пів року. Ти кажеш собі: це тимчасово.",
    facts: ["Спека", "Друзі кличуть на шашлики", "Ти відповідаєш «наступного разу»"],
  },
  {
    title: "«А ти як?»", blackout: 0, water: false,
    intro: "Хтось із друзів уже служить. Хтось виїхав. Ти розучився відповідати на питання «а ти як?».",
    facts: ["Листя жовтіє за вікном", "Повідомлень менше", "Рік без вулиці"],
  },
  {
    title: "Рахунок днів", blackout: 0, water: false,
    intro: "Рік. Ти закреслюєш дні на календарі, бо інакше вони зливаються в один. У чаті «Де бус?» нових повідомлень дедалі більше.",
    facts: ["Сніг у дворі", "Ціни ростуть", "Роботи менше"],
  },
  {
    title: "Новий закон", blackout: 0, water: false,
    intro: "Новий закон про мобілізацію. Всі оновлюють дані. Ти — ні. Тепер навіть кур'єр під дверима здається пасткою.",
    facts: ["Даних немає — ти нелегал", "Кур'єрам страшно теж", "Бус частіше"],
  },
  {
    title: "Спека і темрява", blackout: 2, water: false,
    intro: "Спека і графіки — по чотири години без світла. Холодильник тече, ноутбук сідає. Вентилятор — розкіш.",
    facts: ["Відключення: двічі на день", "Без світла — без роботи", "Їжа псується"],
  },
  {
    title: "Бус у дворі", blackout: 1, water: false,
    intro: "Бус уперше став у вашому дворі. Постояв годину й поїхав. Ти відійшов від вікна тільки ввечері.",
    facts: ["Бус у дворі: буває", "Балкон — ризик", "Сусідки стежать"],
  },
  {
    title: "Скотч на вікнах", blackout: 2, water: true,
    intro: "Масовані атаки щотижня. Вікна заклеєні скотчем навхрест. Ти знаєш звук шахеда краще, ніж голос власного батька.",
    facts: ["Відключення: двічі на день", "Вода — за графіком", "Балістика"],
  },
  {
    title: "Під дверима", blackout: 1, water: false,
    intro: "Ловлять у дворах, біля підʼїздів, у ліфтах. Кур'єри просять вийти до них. Ти просиш залишити під дверима.",
    facts: ["Бус у дворі: часто", "Підробні кур'єри", "Стук у двері"],
  },
  {
    title: "Запах дощу", blackout: 1, water: false,
    intro: "Два з половиною роки. Ти забув, як пахне вулиця після дощу. Ти памʼятаєш тільки, як вона виглядає з пʼятого поверху.",
    facts: ["Спека", "Тиша в чатах", "Ти вже не рахуєш"],
  },
  {
    title: "Менше друзів", blackout: 1, water: false,
    intro: "Друзів стає менше. Не тому, що ви посварились.",
    facts: ["Бус у дворі: часто", "Похоронки в сторіз", "Листя за вікном"],
  },
  {
    title: "Найтемніша зима", blackout: 2, water: true,
    intro: "Найтемніша зима. Немає світла, немає води, немає тепла. Є тільки квартира, і вона стає меншою.",
    facts: ["Відключення: двічі на день", "Вода — за графіком", "Холодно"],
  },
  {
    title: "Третій день", blackout: 1, water: true,
    intro: "Бус стоїть у дворі третій день. Водій курить біля дитячого майданчика. Ти вивчив його розклад краще, ніж свій.",
    facts: ["Бус у дворі: майже завжди", "Вода — за графіком", "Доставки дорожчі"],
  },
  {
    title: "Дзеркало", blackout: 1, water: false,
    intro: "Ти вже не памʼятаєш, ким був до. Дзеркало теж не памʼятає.",
    facts: ["Спека", "Тиша", "Чотири стіни"],
  },
  {
    title: "Чотири роки", blackout: 1, water: false,
    intro: "Чотири роки. Ще один сезон. Ще один день, такий самий, як девʼяносто попередніх.",
    facts: ["Останній сезон?", "Ніхто не знає, що далі", "Двері зачинені"],
  },
];

export function seasonName(i: number): string {
  return `${SEASON_NAMES[i % 4]} ${2023 + Math.floor(i / 4)}`;
}
export function yearOf(i: number): YearDef {
  return YEARS[Math.min(3, Math.floor(i / 4))];
}

// ------------------------------------------------------------------ places in the flat

export type PlaceId =
  | "desk" | "fridge" | "stove" | "bed" | "window" | "balcony" | "bath" | "mirror" | "plant" | "mat" | "shelf"
  | "trash" | "door" | "calendar" | "corridor" | "cat" | "photos";

export const PLACE_LABELS: Record<PlaceId, string> = {
  desk: "Ноутбук", fridge: "Холодильник", stove: "Плита", bed: "Ліжко", window: "Вікно", balcony: "Балкон",
  bath: "Ванна", mirror: "Дзеркало", plant: "Фікус", mat: "Килимок", shelf: "Полиця", trash: "Сміття",
  door: "Вхідні двері", calendar: "Календар", corridor: "Коридор", cat: "Кіт", photos: "Фото друзів",
};

// ------------------------------------------------------------------ actions

export type ActionId =
  | "work" | "game" | "therapy"
  | "eat" | "cook" | "drink"
  | "sleep" | "stare"
  | "look" | "air" | "balcony" | "tomatoes"
  | "shower" | "wash_bottle" | "mirror"
  | "water_plant" | "exercise" | "read" | "journal" | "guitar"
  | "tidy" | "go_out" | "break_out" | "peephole" | "calendar" | "pet" | "photos" | "shelter"
  | "chat" | "news" | "friends" | "mom" | "order";

export interface Effects {
  psyche?: number;
  energy?: number;
  satiety?: number;
  food?: number;
  money?: number;
  apathy?: number;
  body?: number;
  heat?: number;
  clutter?: number;
  plant?: number;
}

export interface ActionDef {
  id: ActionId;
  place: PlaceId | "phone";
  label: string;
  icon: string;
  minutes: number;
  fx: Effects;
  /** Shown under the button. */
  hint: string;
  /** Needs power (light, or the power station for the laptop). */
  power?: boolean;
  water?: boolean;
  perk?: PerkId;
  once?: boolean;
}

export const ACTIONS: ActionDef[] = [
  { id: "work", place: "desk", label: "Працювати", icon: "💻", minutes: 180, fx: { energy: -18, psyche: -3 }, hint: "Гроші. Закрий таски.", power: true },
  { id: "game", place: "desk", label: "Пограти", icon: "🎮", minutes: 120, fx: { psyche: 7, apathy: 3, energy: -4 }, hint: "Забутися на дві години", power: true, perk: "console" },
  { id: "therapy", place: "desk", label: "Сесія з терапевткою", icon: "🗣️", minutes: 60, fx: { psyche: 13, apathy: -10, money: -1200 }, hint: "1200 ₴ · онлайн", power: true, perk: "therapist", once: true },

  { id: "eat", place: "fridge", label: "Поїсти", icon: "🥪", minutes: 20, fx: { food: -1, satiety: 45, psyche: 1 }, hint: "−1 запас" },
  { id: "drink", place: "fridge", label: "Випити", icon: "🍺", minutes: 30, fx: { psyche: 10, apathy: 6, energy: -8 }, hint: "Стає легше. Ненадовго.", perk: "alcohol" },
  { id: "cook", place: "stove", label: "Приготувати нормально", icon: "🍳", minutes: 75, fx: { food: -1, satiety: 65, psyche: 5, energy: -4 }, hint: "Потрібні світло і вода", power: true, water: true },

  { id: "sleep", place: "bed", label: "Спати", icon: "🛏️", minutes: 0, fx: {}, hint: "Кінець дня" },
  { id: "stare", place: "bed", label: "Лежати й дивитися в стелю", icon: "🫥", minutes: 120, fx: { energy: 14, psyche: -2, apathy: 5 }, hint: "Нічого не робити" },

  { id: "look", place: "window", label: "Подивитися у двір", icon: "🪟", minutes: 15, fx: {}, hint: "Що там сьогодні?" },
  { id: "air", place: "window", label: "Відчинити кватирку", icon: "🌬️", minutes: 10, fx: { psyche: 2 }, hint: "Подих вулиці", once: true },
  { id: "balcony", place: "balcony", label: "Постояти на балконі", icon: "☀️", minutes: 30, fx: { psyche: 7 }, hint: "Сонце. Але тебе видно." , once: true },
  { id: "tomatoes", place: "balcony", label: "Полити помідори", icon: "🍅", minutes: 20, fx: { psyche: 3 }, hint: "Щось росте", perk: "tomatoes", water: true, once: true },

  { id: "shower", place: "bath", label: "Душ", icon: "🚿", minutes: 30, fx: { psyche: 5, energy: 6 }, hint: "Потрібна вода", water: true, once: true },
  { id: "wash_bottle", place: "bath", label: "Помитися з баклажки", icon: "🪣", minutes: 30, fx: { psyche: 2, energy: 3 }, hint: "Води немає", perk: "bottles", once: true },
  { id: "mirror", place: "mirror", label: "Подивитися в дзеркало", icon: "🪞", minutes: 5, fx: {}, hint: "Хто це?", once: true },

  { id: "water_plant", place: "plant", label: "Полити фікус", icon: "🪴", minutes: 5, fx: { plant: 30, psyche: 1 }, hint: "Він теж тут застряг", water: true, once: true },
  { id: "exercise", place: "mat", label: "Зарядка, віджимання", icon: "💪", minutes: 40, fx: { energy: -14, psyche: 5, body: 12, apathy: -3 }, hint: "Тіло ще твоє", once: true },
  { id: "read", place: "shelf", label: "Читати", icon: "📖", minutes: 90, fx: { psyche: 5, apathy: -3 }, hint: "Чужі життя" },
  { id: "journal", place: "shelf", label: "Писати щоденник", icon: "✍️", minutes: 30, fx: { psyche: 5, apathy: -2 }, hint: "Вийняти думки з голови", perk: "journal", once: true },
  { id: "guitar", place: "shelf", label: "Грати на гітарі", icon: "🎸", minutes: 60, fx: { psyche: 8, energy: -4 }, hint: "Тихо, щоб сусіди не чули", perk: "guitar" },

  { id: "tidy", place: "trash", label: "Прибрати", icon: "🧹", minutes: 45, fx: { clutter: -3, psyche: 3, energy: -8 }, hint: "Сміття не винесеш. Тільки в пакети." },
  { id: "go_out", place: "door", label: "Вийти на вулицю", icon: "🚪", minutes: 40, fx: { psyche: -5 }, hint: "Просто вийти" },
  { id: "break_out", place: "door", label: "Вийти. Просто вийти.", icon: "🚪", minutes: 0, fx: {}, hint: "Більше не можу" },
  { id: "peephole", place: "door", label: "Глянути в глазок", icon: "👁️", minutes: 2, fx: {}, hint: "Сходи" },
  { id: "calendar", place: "calendar", label: "Закреслити день", icon: "🗓️", minutes: 2, fx: { psyche: 1 }, hint: "Ще один", once: true },
  { id: "pet", place: "cat", label: "Погладити кота", icon: "🐈", minutes: 15, fx: { psyche: 5 }, hint: "Він не знає про війну", perk: "cat" },
  { id: "photos", place: "photos", label: "Подивитися на фото", icon: "🖼️", minutes: 10, fx: {}, hint: "Ваше літо 2021", once: true },
  { id: "shelter", place: "corridor", label: "Сісти між двох стін", icon: "🧱", minutes: 30, fx: {}, hint: "Правило двох стін" },

  { id: "chat", place: "phone", label: "Чат «Де бус?»", icon: "🚐", minutes: 15, fx: { psyche: -2 }, hint: "Де вони сьогодні" },
  { id: "news", place: "phone", label: "Гортати новини", icon: "📰", minutes: 60, fx: { psyche: 2, apathy: 3 }, hint: "Ще одну. І ще одну." },
  { id: "friends", place: "phone", label: "Написати друзям", icon: "💬", minutes: 30, fx: {}, hint: "Хто відповість?", once: true },
  { id: "mom", place: "phone", label: "Подзвонити мамі", icon: "📞", minutes: 30, fx: { psyche: 6 }, hint: "Вона хвилюється", once: true },
  { id: "order", place: "phone", label: "Замовити доставку", icon: "🛵", minutes: 10, fx: {}, hint: "Продукти · під двері" },
];

export function actionById(id: ActionId): ActionDef {
  const a = ACTIONS.find((x) => x.id === id);
  if (!a) throw new Error(`no action ${id}`);
  return a;
}

// ------------------------------------------------------------------ perks: what helped this season

export type PerkId =
  | "station" | "powerbank" | "bottles" | "dumbbells" | "cat" | "therapist" | "books" | "guitar" | "headphones"
  | "alcohol" | "client" | "volunteer" | "buschat" | "tomatoes" | "journal" | "meds" | "neighbor" | "console";

export interface PerkDef {
  id: PerkId;
  icon: string;
  name: string;
  text: string;
  /** Not offered before this season. */
  from?: number;
}

export const PERKS: PerkDef[] = [
  { id: "station", icon: "🔋", name: "Зарядна станція", text: "Ноутбук працює під час відключень. Заряджається, коли є світло." },
  { id: "powerbank", icon: "🪫", name: "Павербанк", text: "Телефон не сідає в темряві." },
  { id: "bottles", icon: "🪣", name: "Баклажки з водою", text: "Можна помитися й полити фікус, коли води немає." },
  { id: "dumbbells", icon: "🏋️", name: "Гантелі", text: "Зарядка дає більше. Тіло тримає голову." },
  { id: "cat", icon: "🐈", name: "Кіт із притулку", text: "Волонтерка привезла під двері. Чорний, наглий. Тепер ти не один." },
  { id: "therapist", icon: "🗣️", name: "Терапевтка онлайн", text: "Раз на день — сесія. Дорого. Допомагає." },
  { id: "books", icon: "📚", name: "Стос книжок", text: "Читання дає більше, навіть при свічці." },
  { id: "guitar", icon: "🎸", name: "Гітара", text: "Стара, зі старої квартири. Чотири акорди ще памʼятаєш." },
  { id: "headphones", icon: "🎧", name: "Навушники з шумодавом", text: "Вибухи б'ють по нервах слабше. Але стук у двері почуєш гірше." },
  { id: "alcohol", icon: "🍺", name: "Ящик пива", text: "Можна випити. Легше одразу, гірше потім." },
  { id: "client", icon: "💶", name: "Клієнт з Європи", text: "Робота оплачується краще на 40%." },
  { id: "volunteer", icon: "🧡", name: "Знайома волонтерка", text: "Раз на день привозить передачку. Безкоштовно і не страшно відчиняти." },
  { id: "buschat", icon: "📡", name: "Платний канал «Де бус»", text: "Завжди знаєш, чи бус у дворі. Підробного кур'єра видно в глазок." , from: 4 },
  { id: "tomatoes", icon: "🍅", name: "Помідори на балконі", text: "Щось росте. Іноді — їжа." },
  { id: "journal", icon: "✍️", name: "Щоденник", text: "Записати думки — менше їх у голові." },
  { id: "meds", icon: "💊", name: "Антидепресанти", text: "Психіка падає повільніше. Радість теж приглушена." },
  { id: "neighbor", icon: "👴", name: "Сусід Петрович", text: "Попереджає дзвінком, коли ТЦК в підʼїзді." , from: 4 },
  { id: "console", icon: "🎮", name: "Приставка", text: "Дві години забуття. Апатія підкрадається." },
];

export function perkById(id: PerkId): PerkDef {
  const p = PERKS.find((x) => x.id === id);
  if (!p) throw new Error(`no perk ${id}`);
  return p;
}

// ------------------------------------------------------------------ who you were

export type TraitId = "it" | "student" | "musician" | "teacher";

export interface TraitDef {
  id: TraitId;
  name: string;
  text: string;
  money: number;
  /** ₴ earned for one good work session (a typical day of that season). */
  wage: number;
  psyche: number;
  /** Help from home per season (parents), ₴. */
  support: number;
  /** Seasons survived in total, across runs, to unlock. */
  unlock: number;
  perk?: PerkId;
}

export const TRAITS: TraitDef[] = [
  { id: "it", name: "Айтішник", text: "Віддалена робота, подушка грошей. Поки що.", money: 70000, wage: 1500, psyche: 68, support: 0, unlock: 0 },
  { id: "teacher", name: "Репетитор", text: "Уроки онлайн. Грошей мало, але учні пишуть тобі щодня.", money: 30000, wage: 1100, psyche: 74, support: 6000, unlock: 6 },
  { id: "musician", name: "Музикант", text: "Гітара з собою. Концертів не буде.", money: 25000, wage: 950, psyche: 72, support: 4000, unlock: 14, perk: "guitar" },
  { id: "student", name: "Студент", text: "Відстрочка скінчилась. Батьки допомагають. Тобі 24.", money: 15000, wage: 800, psyche: 80, support: 16000, unlock: 24 },
];

// ------------------------------------------------------------------ friends

export const FRIEND_NAMES = [
  "Сашко", "Діма", "Олег", "Макс", "Влад", "Ігор", "Тарас", "Андрій", "Женя", "Богдан", "Костя", "Сергій", "Юра", "Назар", "Артем", "Микола",
];
/** Accusative forms, same order as FRIEND_NAMES. */
export const FRIEND_ACC = [
  "Сашка", "Діму", "Олега", "Макса", "Влада", "Ігоря", "Тараса", "Андрія", "Женю", "Богдана", "Костю", "Сергія", "Юру", "Назара", "Артема", "Миколу",
];
export const FRIEND_ROLES = ["однокласник", "колега", "з універу", "сусід по гуртожитку", "двоюрідний брат", "з футболу", "друг дитинства"];

export type FriendState = "free" | "hiding" | "abroad" | "volunteered" | "taken" | "front" | "wounded" | "dead" | "home";

export interface FriendBeat {
  /** Season index when this happens (season end). */
  season: number;
  state: FriendState;
}

/** What you read about it in the chat. {n} is the name, {a} the accusative. */
export const FRIEND_NEWS: Record<FriendState, string[]> = {
  free: [],
  hiding: ["{n}: «я теж більше не виходжу. ти як тримаєшся?»"],
  abroad: ["{n} виїхав. Скинув фото з вокзалу в Перемишлі. Ти поставив вподобайку і довго дивився в стелю.", "{n} пише з Варшави: «тут нормально, тільки нікого не знаю»."],
  volunteered: ["{n} пішов сам. Написав: «не можу більше сидіти». Ти не знав, що відповісти.", "{n} підписав контракт. Скинув фото в пікселі. Посміхається."],
  taken: ["{a} забрали біля метро. Вийшов по хліб.", "{a} бусифікували у власному дворі. Мама написала в чат будинку.", "{a} зупинили на блокпосту, коли їхав до батьків. Телефон уже не в мережі."],
  front: ["{n}: «живий. тут не так, як в новинах. гірше і краще одночасно».", "{n} скинув голосове: на фоні щось гуде. «Все добре, не пиши мамі, що я сказав, де я»."],
  wounded: ["{n} поранений. Шпиталь у Дніпрі. Пише одним пальцем: «нога на місці, жартую нормально».", "{n} після контузії. Відповідає через тиждень, коротко."],
  dead: ["{n} загинув. Сторіз з його фото і свічкою. Ти не знаєш, чи маєш право ставити туди серце.", "{n} загинув під Покровськом. Похорон у суботу. Ти не підеш. Ти знаєш, що не підеш."],
  home: ["{n} повернувся — демобілізація після поранення. Пише: «приходь, посидимо». Ти мовчиш."],
};

/** Psyche hit (or help) when a friend's story moves on. */
export const FRIEND_IMPACT: Record<FriendState, number> = {
  free: 0, hiding: 2, abroad: -4, volunteered: -5, taken: -7, front: -2, wounded: -6, dead: -16, home: 2,
};

/** Possible life stories, as states with relative season offsets. */
export const FRIEND_ARCS: Array<Array<[number, FriendState]>> = [
  [[0, "volunteered"], [1, "front"], [5, "wounded"], [7, "home"]],
  [[0, "volunteered"], [2, "front"], [6, "dead"]],
  [[0, "taken"], [1, "front"], [4, "dead"]],
  [[0, "taken"], [1, "front"], [5, "wounded"], [8, "front"]],
  [[0, "taken"], [2, "front"]],
  [[0, "abroad"]],
  [[0, "hiding"], [4, "taken"], [5, "front"]],
  [[0, "hiding"], [7, "taken"], [9, "dead"]],
  [[0, "hiding"]],
  [[0, "front"], [3, "dead"]],
];

// ------------------------------------------------------------------ thoughts

/** Intrusive thoughts, by how bad things are (0 = mild … 2 = worst). */
export const THOUGHTS: string[][] = [
  ["Ще один такий самий день.", "Може, завтра щось зміниться.", "Скільки ще?", "Ти давно не чув свого голосу.", "Всі живуть. Ти чекаєш.", "Який сьогодні день тижня?"],
  ["Вони знають адресу.", "Це був стук? Чи здалося?", "Ти боягуз.", "А якщо мама захворіє?", "Хлопці там, а ти тут.", "Ти навіть не можеш винести сміття.", "Стіни ближче, ніж учора.", "Ти нікому не потрібен такий."],
  ["Може, вже здатися?", "Просто вийти. Що буде, те буде.", "Ти тут помреш, і ніхто не дізнається.", "Навіщо все це?", "Двері зовсім поруч.", "Ти вже не памʼятаєш, навіщо ховаєшся.", "Тиша гучніша за сирену."],
];

export const MIRROR_LINES = [
  "Ще схожий на себе. Тільки під очима синьо.",
  "Борода. Колись ти голився щоранку.",
  "Обличчя бліде, як стіна за спиною.",
  "Ти себе не впізнаєш. Цей чоловік старший за тебе.",
];

export const WINDOW_LINES = {
  people: ["У дворі діти на гойдалці. Хтось несе каву. Звичайний день. Не твій.", "Сусід вигулює собаку. Ти памʼятаєш, як пахне трава."],
  empty: ["Двір порожній. Чоловіків не видно взагалі. Тільки жінки з пакетами.", "Ворони на смітниках. Більше нікого."],
  bus: ["Бус стоїть біля підʼїзду. Двоє в пікселі курять. Ти не дихаєш, хоча до них пʼять поверхів.", "Бус у дворі. Когось ведуть під руки. Ти відходиш від вікна і знову підходиш."],
  night: ["Темний двір, вікна без світла. Десь гуде генератор.", "Ніч. Над Дніпром — спалахи ППО."],
};

export const DOOR_LINES = [
  "Ти стояв, тримаючись за ручку, сорок хвилин. Потім пішов на кухню.",
  "Ти взувся. Посидів у коридорі. Роззувся.",
  "Ти відчинив двері на ланцюжок і почув ліфт. Зачинив.",
  "Ти поклав руку на замок і уявив бус. Руку прибрав.",
];

// ------------------------------------------------------------------ endings

export type EndingId = "zryv" | "bus" | "strike" | "survived";

export const ENDINGS: Record<EndingId, { title: string; sticker: string; text: string }> = {
  zryv: {
    title: "ЗРИВ", sticker: "ДВЕРІ ВІДЧИНЕНІ",
    text: "Ти не памʼятаєш, як вийшов. Памʼятаєш тільки, що на сходах пахло фарбою, а надворі було дуже світло. Ти стояв посеред двору і плакав, і ніхто не підійшов. Далі — не має значення.",
  },
  bus: {
    title: "БУСИФІКАЦІЯ", sticker: "ВІДЧИНИВ",
    text: "Двері відчинились, і всі ці роки закінчились за пʼять секунд. Тебе вели сходами вниз, а ти думав про фікус, який тепер ніхто не поллє.",
  },
  strike: {
    title: "ПРИЛІТ", sticker: "НЕ ВСТИГ",
    text: "Ти не встиг до коридору. Чотири роки ти ховався від людей, а знайшло тебе те, від чого не сховаєшся ні в якій квартирі.",
  },
  survived: {
    title: "ДОЖИВ", sticker: "1 461 ДЕНЬ",
    text: "Осінь 2026. Ти дожив. Ти досі тут. Двері досі зачинені. Ніхто не скаже тобі, чи це було варто — і ти сам ніколи не скажеш.",
  },
};
