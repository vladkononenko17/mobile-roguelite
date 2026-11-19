/**
 * English text for the data in content.ts. Applied in place by
 * `applyContentLang`, so every module that imported the arrays sees the
 * current language without knowing about it. Ukrainian stays the original.
 */
import {
  ACTIONS, DOOR_LINES, ENDINGS, FRIEND_NEWS, MIRROR_LINES, PERKS, PLACE_LABELS, SEASON_DEFS, THOUGHTS, TRAITS, WINDOW_LINES,
  type ActionId, type EndingId, type FriendState, type PerkId, type PlaceId, type TraitId,
} from "./content.ts";
import { setLangValue, type Lang } from "./i18n.ts";

const SEASONS_EN: Array<{ title: string; intro: string; facts: string[] }> = [
  { title: "Power by the schedule", intro: "January. Generators hum under every café. Friends call: “Let's grab a coffee, everyone's going.” You say you've got a lot of work. Really, you've just decided not to risk it. For now.", facts: ["Blackouts: twice a day", "The van in the yard: almost never", "All your friends are still here"] },
  { title: "Chestnuts", intro: "The chestnuts are in bloom. Kids in the yard, old women on the benches. Summonses are handed out by the metro, but the chat says Pozniaky is quiet. You watch it all from the window.", facts: ["The power is on", "Alerts — more often at night", "The city lives. Without you"] },
  { title: "Terraces", intro: "Kyiv is alive: terraces, fundraiser concerts, photos from Trukhaniv Island. You haven't been outside in half a year. You tell yourself it's temporary.", facts: ["Heat", "Friends invite you to a barbecue", "You answer “next time”"] },
  { title: "“How are you?”", intro: "One of your friends is already serving. Someone has left. You've forgotten how to answer “how are you?”.", facts: ["Leaves turning yellow outside", "Fewer messages", "A year without the street"] },
  { title: "Counting days", intro: "A year. You cross the days off on the calendar, because otherwise they blur into one. The “Where's the van?” chat gets more new messages every day.", facts: ["Snow in the yard", "Prices are rising", "Less work"] },
  { title: "The new law", intro: "A new mobilisation law. Everyone is updating their records. You aren't. Now even the courier at the door looks like a trap.", facts: ["No records — you're off the grid", "Couriers are scared too", "The van comes more often"] },
  { title: "Heat and darkness", intro: "Heat and schedules — four hours at a time without power. The fridge leaks, the laptop dies. A fan is a luxury.", facts: ["Blackouts: twice a day", "No power — no work", "Food goes off"] },
  { title: "The van in the yard", intro: "For the first time the van parked in your yard. It stood there an hour and left. You didn't step away from the window until evening.", facts: ["The van in the yard: it happens", "The balcony is a risk", "The neighbours are watching"] },
  { title: "Tape on the windows", intro: "Massive attacks every week. The windows are taped crosswise. You know the sound of a Shahed better than your own father's voice.", facts: ["Blackouts: twice a day", "Water — by the schedule", "Ballistic missiles"] },
  { title: "At the door", intro: "They catch men in yards, by entrances, in lifts. Couriers ask you to come out to them. You ask them to leave it at the door.", facts: ["The van in the yard: often", "Fake couriers", "Knocks on the door"] },
  { title: "The smell of rain", intro: "Two and a half years. You've forgotten how the street smells after rain. You only remember how it looks from the fifth floor.", facts: ["Heat", "Silence in the chats", "You don't count any more"] },
  { title: "Fewer friends", intro: "There are fewer friends. Not because you fell out.", facts: ["The van in the yard: often", "Funeral notices in the stories", "Leaves outside the window"] },
  { title: "The darkest winter", intro: "The darkest winter. No power, no water, no heat. There is only the flat, and it's getting smaller.", facts: ["Blackouts: twice a day", "Water — by the schedule", "Cold"] },
  { title: "Day three", intro: "The van has stood in the yard for three days. The driver smokes by the playground. You know his schedule better than your own.", facts: ["The van in the yard: almost always", "Water — by the schedule", "Delivery costs more"] },
  { title: "The mirror", intro: "You no longer remember who you were before. The mirror doesn't remember either.", facts: ["Heat", "Silence", "Four walls"] },
  { title: "Four years", intro: "Four years. One more season. One more day, the same as the ninety before it.", facts: ["The last season?", "Nobody knows what's next", "The door is shut"] },
];

const PLACES_EN: Record<PlaceId, string> = {
  desk: "Laptop", fridge: "Fridge", stove: "Stove", bed: "Bed", window: "Window", balcony: "Balcony",
  bath: "Bath", mirror: "Mirror", plant: "Ficus", mat: "Mat", shelf: "Shelf", trash: "Rubbish",
  door: "Front door", calendar: "Calendar", corridor: "Corridor", cat: "Cat", photos: "Friends' photos",
};

const ACTIONS_EN: Record<ActionId, { label: string; hint: string }> = {
  work: { label: "Work", hint: "Money. Close the tickets." },
  game: { label: "Play games", hint: "Forget yourself for two hours" },
  therapy: { label: "Session with the therapist", hint: "1200 ₴ · online" },
  eat: { label: "Eat", hint: "−1 supplies" },
  drink: { label: "Have a drink", hint: "It gets easier. For a while." },
  cook: { label: "Cook properly", hint: "Needs power and water" },
  sleep: { label: "Sleep", hint: "End of the day" },
  stare: { label: "Lie and stare at the ceiling", hint: "Do nothing" },
  look: { label: "Look into the yard", hint: "What's out there today?" },
  air: { label: "Open the vent window", hint: "A breath of the street" },
  balcony: { label: "Stand on the balcony", hint: "Sunlight. But they can see you." },
  tomatoes: { label: "Water the tomatoes", hint: "Something is growing" },
  shower: { label: "Shower", hint: "Needs water" },
  wash_bottle: { label: "Wash from a jerrycan", hint: "No water" },
  mirror: { label: "Look in the mirror", hint: "Who is that?" },
  water_plant: { label: "Water the ficus", hint: "It's stuck here too" },
  exercise: { label: "Workout, push-ups", hint: "Your body is still yours" },
  read: { label: "Read", hint: "Other people's lives" },
  journal: { label: "Write in the journal", hint: "Get the thoughts out of your head" },
  guitar: { label: "Play the guitar", hint: "Quietly, so the neighbours don't hear" },
  tidy: { label: "Tidy up", hint: "You can't take the rubbish out. Only bag it." },
  go_out: { label: "Go outside", hint: "Just go out" },
  break_out: { label: "Go out. Just go out.", hint: "I can't any more" },
  peephole: { label: "Look through the peephole", hint: "The stairwell" },
  calendar: { label: "Cross off the day", hint: "One more" },
  pet: { label: "Pet the cat", hint: "He doesn't know about the war" },
  photos: { label: "Look at the photos", hint: "Your summer of 2021" },
  shelter: { label: "Sit between two walls", hint: "The two-wall rule" },
  chat: { label: "“Where's the van?” chat", hint: "Where are they today" },
  news: { label: "Scroll the news", hint: "One more. And one more." },
  friends: { label: "Text your friends", hint: "Who will answer?" },
  mom: { label: "Call mom", hint: "She's worried" },
  order: { label: "Order delivery", hint: "Groceries · at the door" },
};

const PERKS_EN: Record<PerkId, { name: string; text: string }> = {
  station: { name: "Power station", text: "The laptop works during blackouts. Charges while the power is on." },
  powerbank: { name: "Power bank", text: "Your phone doesn't die in the dark." },
  bottles: { name: "Water jerrycans", text: "You can wash and water the ficus when there's no water." },
  dumbbells: { name: "Dumbbells", text: "Workouts give more. The body holds the head together." },
  cat: { name: "A shelter cat", text: "A volunteer left him at the door. Black, cheeky. Now you're not alone." },
  therapist: { name: "Online therapist", text: "A session once a day. Expensive. It helps." },
  books: { name: "A stack of books", text: "Reading gives more, even by candlelight." },
  guitar: { name: "Guitar", text: "Old, from the old flat. You still remember four chords." },
  headphones: { name: "Noise-cancelling headphones", text: "Explosions hit your nerves less. But you'll hear a knock worse." },
  alcohol: { name: "A crate of beer", text: "You can drink. Easier right away, worse later." },
  client: { name: "A client from Europe", text: "Work pays 40% better." },
  volunteer: { name: "A volunteer you know", text: "Brings a parcel once a day. Free, and not scary to open the door." },
  buschat: { name: "Paid “Where's the van” channel", text: "You always know if the van is in the yard. A fake courier is obvious through the peephole." },
  tomatoes: { name: "Tomatoes on the balcony", text: "Something is growing. Sometimes — food." },
  journal: { name: "Journal", text: "Write the thoughts down — fewer of them in your head." },
  meds: { name: "Antidepressants", text: "The mind falls more slowly. Joy is muted too." },
  neighbor: { name: "Petrovych, the neighbour", text: "Calls to warn you when the TCC is in the building." },
  console: { name: "Game console", text: "Two hours of oblivion. Apathy creeps in." },
};

const TRAITS_EN: Record<TraitId, { name: string; text: string }> = {
  it: { name: "IT guy", text: "Remote work, a cushion of savings. For now." },
  teacher: { name: "Tutor", text: "Lessons online. Little money, but students write to you every day." },
  musician: { name: "Musician", text: "You have your guitar. There won't be any gigs." },
  student: { name: "Student", text: "Your deferment ran out. Your parents help. You're 24." },
};

const NEWS_EN: Record<FriendState, string[]> = {
  free: [],
  hiding: ["{n}: “I don't go out any more either. how are you holding up?”"],
  abroad: ["{n} left. Posted a photo from the station in Przemyśl. You liked it and stared at the ceiling for a long time.", "{n} writes from Warsaw: “it's fine here, I just don't know anyone”."],
  volunteered: ["{n} went on his own. Wrote: “I can't sit around any more”. You didn't know what to answer.", "{n} signed a contract. Posted a photo in camo. He's smiling."],
  taken: ["{a} was taken by the metro. He went out for bread.", "{a} was bundled into a van in his own yard. His mom wrote in the building chat.", "{a} was stopped at a checkpoint on the way to his parents. His phone is offline."],
  front: ["{n}: “alive. it's not like the news here. worse and better at the same time”.", "{n} sent a voice note: something is humming in the background. “All good, don't tell mom I said where I am”."],
  wounded: ["{n} is wounded. A hospital in Dnipro. He types with one finger: “leg's still there, jokes are fine”.", "{n} is concussed. Answers a week later, briefly."],
  dead: ["{n} is dead. A story with his photo and a candle. You don't know if you have the right to put a heart there.", "{n} was killed near Pokrovsk. The funeral is on Saturday. You won't go. You know you won't go."],
  home: ["{n} is back — discharged after his wound. Writes: “come over, let's sit”. You don't answer."],
};

const THOUGHTS_EN: string[][] = [
  ["Another day just like the last.", "Maybe tomorrow something will change.", "How much longer?", "You haven't heard your own voice in a while.", "Everyone lives. You wait.", "What day of the week is it?"],
  ["They know the address.", "Was that a knock? Or did you imagine it?", "You're a coward.", "What if mom gets sick?", "The guys are out there, and you're here.", "You can't even take the rubbish out.", "The walls are closer than yesterday.", "Nobody needs you like this."],
  ["Maybe just give up?", "Just go out. Whatever happens, happens.", "You'll die here and nobody will know.", "What is all this for?", "The door is right there.", "You don't remember why you're hiding any more.", "The silence is louder than the siren."],
];

const MIRROR_EN = [
  "Still looks like you. Just blue under the eyes.",
  "A beard. You used to shave every morning.",
  "A face as pale as the wall behind it.",
  "You don't recognise yourself. This man is older than you.",
];

const WINDOW_EN = {
  people: ["Kids on the swing in the yard. Someone carrying a coffee. An ordinary day. Not yours.", "A neighbour walking the dog. You remember how grass smells."],
  empty: ["The yard is empty. Not a single man in sight. Only women with shopping bags.", "Crows on the bins. Nobody else."],
  bus: ["The van is by the entrance. Two in camo are smoking. You're not breathing, though they're five floors down.", "The van in the yard. Someone is being led by the arms. You step away from the window and come back again."],
  night: ["A dark yard, windows without light. Somewhere a generator hums.", "Night. Flashes of air defence over the Dnipro."],
  rain: ["Rain. The yard is grey and empty, the asphalt shines. Puddles boil under the streetlight.", "Rain on the glass. The van could be down there and you wouldn't see it. For once, that's a relief."],
};

const DOOR_EN = [
  "You stood holding the handle for forty minutes. Then you went to the kitchen.",
  "You put your shoes on. Sat in the hallway. Took them off.",
  "You opened the door on the chain and heard the lift. Closed it.",
  "You put your hand on the lock and imagined the van. Took your hand away.",
];

const ENDINGS_EN: Record<EndingId, { title: string; sticker: string; text: string }> = {
  zryv: { title: "BREAKDOWN", sticker: "THE DOOR IS OPEN", text: "You don't remember how you went out. You only remember that the stairwell smelled of paint, and outside it was very bright. You stood in the middle of the yard and cried, and nobody came up to you. What came next doesn't matter." },
  bus: { title: "TAKEN", sticker: "YOU OPENED", text: "The door opened, and all those years ended in five seconds. They led you down the stairs, and you were thinking about the ficus that nobody would water now." },
  strike: { title: "DIRECT HIT", sticker: "TOO LATE", text: "You didn't make it to the corridor. For four years you hid from people, and what found you was the thing no flat can hide you from." },
  survived: { title: "YOU MADE IT", sticker: "1,461 DAYS", text: "Autumn 2026. You made it. You're still here. The door is still shut. Nobody will tell you whether it was worth it — and you will never say it yourself." },
};

// ------------------------------------------------------------------ applying

type Snapshot = {
  seasons: typeof SEASONS_EN; places: Record<PlaceId, string>; actions: typeof ACTIONS_EN; perks: typeof PERKS_EN; traits: typeof TRAITS_EN;
  news: Record<FriendState, string[]>; thoughts: string[][]; mirror: string[]; window: Record<string, string[]>; door: string[]; endings: typeof ENDINGS_EN;
};

function snapshot(): Snapshot {
  return {
    seasons: SEASON_DEFS.map((s) => ({ title: s.title, intro: s.intro, facts: [...s.facts] })),
    places: { ...PLACE_LABELS },
    actions: Object.fromEntries(ACTIONS.map((a) => [a.id, { label: a.label, hint: a.hint }])) as typeof ACTIONS_EN,
    perks: Object.fromEntries(PERKS.map((p) => [p.id, { name: p.name, text: p.text }])) as typeof PERKS_EN,
    traits: Object.fromEntries(TRAITS.map((t) => [t.id, { name: t.name, text: t.text }])) as typeof TRAITS_EN,
    news: Object.fromEntries(Object.entries(FRIEND_NEWS).map(([k, v]) => [k, [...v]])) as Record<FriendState, string[]>,
    thoughts: THOUGHTS.map((t) => [...t]),
    mirror: [...MIRROR_LINES],
    window: Object.fromEntries(Object.entries(WINDOW_LINES).map(([k, v]) => [k, [...v]])),
    door: [...DOOR_LINES],
    endings: JSON.parse(JSON.stringify(ENDINGS)) as typeof ENDINGS_EN,
  };
}

const UK = snapshot();
const EN: Snapshot = {
  seasons: SEASONS_EN, places: PLACES_EN, actions: ACTIONS_EN, perks: PERKS_EN, traits: TRAITS_EN, news: NEWS_EN,
  thoughts: THOUGHTS_EN, mirror: MIRROR_EN, window: WINDOW_EN, door: DOOR_EN, endings: ENDINGS_EN,
};

const refill = (target: string[], src: string[]) => { target.splice(0, target.length, ...src); };

/** Switches every text in content.ts to `l`, in place. */
export function applyContentLang(l: Lang): void {
  setLangValue(l);
  const s = l === "en" ? EN : UK;
  SEASON_DEFS.forEach((d, i) => { d.title = s.seasons[i].title; d.intro = s.seasons[i].intro; refill(d.facts, s.seasons[i].facts); });
  Object.assign(PLACE_LABELS, s.places);
  for (const a of ACTIONS) Object.assign(a, s.actions[a.id]);
  for (const p of PERKS) Object.assign(p, s.perks[p.id]);
  for (const t of TRAITS) Object.assign(t, s.traits[t.id]);
  for (const k of Object.keys(FRIEND_NEWS) as FriendState[]) refill(FRIEND_NEWS[k], s.news[k]);
  THOUGHTS.forEach((t, i) => refill(t, s.thoughts[i]));
  refill(MIRROR_LINES, s.mirror);
  for (const k of Object.keys(WINDOW_LINES) as Array<keyof typeof WINDOW_LINES>) refill(WINDOW_LINES[k], s.window[k]);
  refill(DOOR_LINES, s.door);
  for (const k of Object.keys(ENDINGS) as EndingId[]) Object.assign(ENDINGS[k], s.endings[k]);
}
