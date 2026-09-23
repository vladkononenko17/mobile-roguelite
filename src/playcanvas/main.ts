import { Game } from "./Game";

const canvas = document.querySelector<HTMLCanvasElement>("#app-canvas")!;
const loading = document.querySelector<HTMLElement>("#loading")!;
const loadingText = document.querySelector<HTMLElement>("#loading-text")!;
const loadingBar = document.querySelector<HTMLElement>("#loading-bar")!;

const game = new Game({
  canvas,
  debugRoot: document.querySelector<HTMLElement>("#debug")!,
  onProgress: (loaded, total) => {
    const mb = (loaded / 1048576).toFixed(1);
    if (total > 0) {
      loadingBar.style.transform = `scaleX(${loaded / total})`;
      loadingText.textContent = `Loading character… ${mb} / ${(total / 1048576).toFixed(1)} MB`;
    } else {
      loadingText.textContent = `Loading character… ${mb} MB`;
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
