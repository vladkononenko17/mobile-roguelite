import { CHARACTERS, DEFAULT_CHARACTER, type CharacterId } from "./config";
import { audio } from "./audio/Audio";
import { Game } from "./Game";
import { DEV_MODE } from "./devMode";
import { TEST_ARSENAL } from "./ui/ArsenalPanel";
import { menuWanted, showMainMenu } from "./ui/MainMenu";
import { LoadingScreen } from "./ui/LoadingScreen";
import { pickBiome, type BiomeId } from "./world/level/Biomes";
import { heroFor } from "./gameplay/profile";
import { pendingDaily } from "./gameplay/daily";

const canvas = document.querySelector<HTMLCanvasElement>("#app-canvas")!;
const loadingScreen = new LoadingScreen();
const modelSelect = document.querySelector<HTMLSelectElement>("[data-model]")!;

// Versioned so a remembered choice from before the Survivor (V3) became the default does not stick.
const MODEL_KEY = "dustline3d.model.v3";
const isCharacterId = (value: string | null): value is CharacterId => value !== null && value in CHARACTERS;

// Dev: ?model=<id> wins, then the last tune-panel choice. Players: the body of the hero they picked on
// the title screen (the daily run's hero on a daily); every hero id is also a character id.
function pickCharacter(biome: string): CharacterId {
  // The ?arsenal=1 test panel switches heroes through ?model= too.
  if (TEST_ARSENAL) {
    const fromUrl = new URLSearchParams(location.search).get("model");
    if (isCharacterId(fromUrl)) return fromUrl;
  }
  if (DEV_MODE) {
    const fromUrl = new URLSearchParams(location.search).get("model");
    if (isCharacterId(fromUrl)) return fromUrl;
    try {
      const saved = localStorage.getItem(MODEL_KEY);
      if (isCharacterId(saved)) return saved;
    } catch { /* storage unavailable */ }
  }
  const hero = pendingDaily()?.hero ?? heroFor(biome);
  return isCharacterId(hero) ? hero : DEFAULT_CHARACTER;
}

let character: CharacterId = DEFAULT_CHARACTER;
// Switching reloads the page so only one character's textures are ever in GPU memory.
modelSelect.addEventListener("change", () => {
  try { localStorage.setItem(MODEL_KEY, modelSelect.value); } catch { /* storage unavailable */ }
  const url = new URL(location.href);
  url.searchParams.set("model", modelSelect.value);
  location.replace(url);
});

/** Title screen (unless the link names a map), then the game. */
async function main(): Promise<void> {
  audio.init(import.meta.env.BASE_URL);
  // No "tap to start" gate: sound unlocks on the player's first touch in the game (Audio.init).
  const wantsMenu = menuWanted();
  const biome: BiomeId = wantsMenu ? await showMainMenu() : pickBiome();
  character = pickCharacter(biome);
  for (const [id, model] of Object.entries(CHARACTERS)) modelSelect.add(new Option(model.label, id, false, id === character));

  // The loading screen wears the chapter's art, number and name.
  loadingScreen.showChapter(biome);

  const game = new Game({
    canvas,
    debugRoot: document.querySelector<HTMLElement>("#debug")!,
    character,
    biome,
    onProgress: (loaded, total) => loadingScreen.progress(loaded, total),
  });

  game.start().then(
    () => loadingScreen.done(),
    (error: unknown) => {
      console.error(error);
      loadingScreen.failed(error instanceof Error ? error.message : String(error));
    },
  );

  // Handy for poking at the prototype from the devtools console.
  (window as unknown as { game: Game }).game = game;
}

void main();
