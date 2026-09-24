import { CHARACTERS, DEFAULT_CHARACTER, type CharacterId } from "./config";
import { Game } from "./Game";
import { pickBiome } from "./world/level/Biomes";

const canvas = document.querySelector<HTMLCanvasElement>("#app-canvas")!;
const loading = document.querySelector<HTMLElement>("#loading")!;
const loadingText = document.querySelector<HTMLElement>("#loading-text")!;
const loadingBar = document.querySelector<HTMLElement>("#loading-bar")!;
const modelSelect = document.querySelector<HTMLSelectElement>("[data-model]")!;

// Versioned so a remembered choice from before the Survivor (V3) became the default does not stick.
const MODEL_KEY = "dustline3d.model.v3";
const isCharacterId = (value: string | null): value is CharacterId => value !== null && value in CHARACTERS;

// ?model=<id> wins, then the last choice made in this browser, then the default.
function pickCharacter(): CharacterId {
  const fromUrl = new URLSearchParams(location.search).get("model");
  if (isCharacterId(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(MODEL_KEY);
    if (isCharacterId(saved)) return saved;
  } catch { /* storage unavailable */ }
  return DEFAULT_CHARACTER;
}

const character = pickCharacter();
for (const [id, model] of Object.entries(CHARACTERS)) modelSelect.add(new Option(model.label, id, false, id === character));
// Switching reloads the page so only one character's textures are ever in GPU memory.
modelSelect.addEventListener("change", () => {
  try { localStorage.setItem(MODEL_KEY, modelSelect.value); } catch { /* storage unavailable */ }
  const url = new URL(location.href);
  url.searchParams.set("model", modelSelect.value);
  location.replace(url);
});

const game = new Game({
  canvas,
  debugRoot: document.querySelector<HTMLElement>("#debug")!,
  character,
  biome: pickBiome(),
  onProgress: (loaded, total) => {
    const mb = (loaded / 1048576).toFixed(1);
    const name = CHARACTERS[character].label;
    if (total > 0) {
      loadingBar.style.transform = `scaleX(${loaded / total})`;
      loadingText.textContent = `Loading ${name}… ${mb} / ${(total / 1048576).toFixed(1)} MB`;
    } else {
      loadingText.textContent = `Loading ${name}… ${mb} MB`;
    }
  },
});

game.start().then(
  () => loading.classList.add("done"),
  (error: unknown) => {
    console.error(error);
    loadingText.textContent = `Failed to start: ${error instanceof Error ? error.message : String(error)}`;
  },
);

// Handy for poking at the prototype from the devtools console.
(window as unknown as { game: Game }).game = game;
