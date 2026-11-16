import "@fontsource/special-elite/latin-400.css";
import "@fontsource/permanent-marker/latin-400.css";

/**
 * The paper look of the start screen (ui/MainMenu.ts), carried to every menu that opens over it or
 * over the game: the sheets (heroes, quests, settings, install, save code), the upgrades shop, the
 * credits, and the in-game screens (shop, loadout, weapon bench, level-up, chests, pause, the end
 * of a run). A page of the survivor's notebook: paper, index cards, typewriter text, marker names,
 * red rubber stamps for prices and buttons.
 *
 * It is one stylesheet of overrides: each screen keeps its own layout CSS, and every rule here is
 * prefixed `html body` so it wins whatever order the screens' own (lazily added) styles load in.
 * The HUD in play is not themed: it has to read at a glance over the 3D scene.
 */
const INK = "42, 33, 24";
const PAPER = `background-color: #dccfab; background-image: radial-gradient(ellipse at 25% 8%, rgba(255, 250, 230, 0.6), transparent 60%), radial-gradient(ellipse at 85% 96%, rgba(120, 90, 40, 0.3), transparent 55%),
  repeating-linear-gradient(0deg, rgba(60, 45, 20, 0.05) 0 1px, transparent 1px 28px), repeating-linear-gradient(90deg, rgba(60, 45, 20, 0.05) 0 1px, transparent 1px 28px);`;
const CARD = `background: #f6f1e4; border: 1px solid rgba(${INK}, 0.24); border-radius: 2px; box-shadow: 0 2px 5px rgba(40, 25, 5, 0.25); color: #2a2118;`;
const MARKER = `"Permanent Marker", cursive`;
const TYPE = `"Special Elite", "Courier New", monospace`;
/** A red rubber stamp (the main button of a screen). */
const STAMP = `background: rgba(246, 241, 228, 0.5); color: #a3271c; border: 3px solid #a3271c; border-radius: 5px; box-shadow: inset 0 0 0 2px #dccfab, inset 0 0 0 3.5px #a3271c;
  font: 400 18px/1 ${TYPE}; letter-spacing: 0.06em; text-transform: uppercase; padding-top: 4px;`;

const S = "html body #sheet", M = "html body #meta", C = "html body #credits", O = "html body #overlay";

const CSS = `
/* ---- sheets over the start screen: heroes, quests, settings, install, save code; upgrades; credits ---- */
${S}, ${M}, ${C} { background: rgba(20, 14, 6, 0.7); font: 400 13.5px/1.35 ${TYPE}; color: #2a2118; }
${S} .box, ${M} .sheet, ${C} .sheet { ${PAPER} border: 0; border-radius: 3px; box-shadow: 0 14px 34px rgba(0, 0, 0, 0.6); color: #2a2118; }
${S} h2, ${M} h2, ${C} h2 { font: 400 30px/1 ${MARKER}; letter-spacing: 0; }
${S} h3, ${C} h3 { font: 400 13px/1.2 ${TYPE}; letter-spacing: 0.04em; color: #a3271c; opacity: 1; text-decoration: underline; text-underline-offset: 3px; }
${S} .sub { opacity: 0.85; }
${S} .row, ${M} .row, ${S} .set, ${S} .steps div { ${CARD} }
${S} .row b, ${M} .row b, ${S} .set b, ${S} .steps b { font: 400 17px/1.15 ${MARKER}; letter-spacing: 0; }
${S} .row small, ${M} .row small, ${S} .set small { opacity: 0.85; }
${S} .row .tag, ${S} .set .act { background: none; color: rgba(${INK}, 0.8); border: 1.5px solid rgba(${INK}, 0.5); border-radius: 3px; padding: 5px 7px 1px; font: 400 12px/1 ${TYPE}; letter-spacing: 0.04em; }
${S} .row.on { border-color: #a3271c; box-shadow: inset 0 0 0 1.5px #a3271c, 0 2px 5px rgba(40, 25, 5, 0.25); }
${S} .row.on .tag { background: none; color: #a3271c; border-color: #a3271c; }
${S} .row.done .tag { background: none; color: #2f6b3a; border-color: #2f6b3a; }
${S} .row .minus { color: #a3271c; }
${S} .row .face { border: 3px solid #fff; border-radius: 1px; box-shadow: 0 1px 4px rgba(40, 25, 5, 0.45); }
${S} .row .ic { background: none; color: #2a2118; border: 2px solid #2a2118; box-sizing: border-box; }
${S} .row.done .ic { color: #2f6b3a; border-color: #2f6b3a; }
${S} .row .face.ic { border: 3px solid #fff; }
${S} .row.locked .ic { background: rgba(${INK}, 0.15); color: #2a2118; }
${S} .bar { background: rgba(${INK}, 0.15); }
${S} .bar i { background: #2f6b3a; }
${S} .close, ${M} .close, ${C} button { ${STAMP} height: 46px; }
/* settings */
${S} .set output { color: #a3271c; font: 400 15px/1 ${TYPE}; }
${S} .set input[type=range]::-webkit-slider-runnable-track { background: linear-gradient(90deg, #a3271c var(--v, 50%), rgba(${INK}, 0.2) var(--v, 50%)); }
${S} .set input[type=range]::-moz-range-track { background: linear-gradient(90deg, #a3271c var(--v, 50%), rgba(${INK}, 0.2) var(--v, 50%)); }
${S} .set input[type=range]::-webkit-slider-thumb { background: #f6f1e4; border: 2px solid #2a2118; }
${S} .set input[type=range]::-moz-range-thumb { background: #f6f1e4; border: 2px solid #2a2118; }
${S} .set .sw { background: rgba(${INK}, 0.22); }
${S} .set .sw::after { background: #f6f1e4; }
${S} .set.on .sw { background: #a3271c; }
${S} .save textarea { background: #f6f1e4; color: #2a2118; border: 1px solid rgba(${INK}, 0.35); border-radius: 2px; }
${S} .save .go { background: none; color: #a3271c; border: 2.5px solid #a3271c; border-radius: 4px; font: 400 15px/1 ${TYPE}; letter-spacing: 0.06em; padding-top: 3px; }
${S} .save .msg { color: #2f6b3a; }
${S} .save .msg.bad { color: #a3271c; }
${S} .back { border: 0; color: #2a2118; font: 400 14px/1 ${TYPE}; letter-spacing: 0; text-decoration: underline; text-underline-offset: 3px; text-transform: lowercase; }
${S} .steps div::before { background: #a3271c; color: #f6f1e4; font: 400 18px/1 ${MARKER}; }
${S} .note { background: none; color: #2a2118; border: 1.5px dashed rgba(${INK}, 0.5); border-radius: 2px; }
/* upgrades (Dust) */
${M} .bal { font: 400 21px/1.1 ${MARKER}; letter-spacing: 0; color: #1f5fae; }
${M} .bal small { font: 400 12px ${TYPE}; color: #2a2118; opacity: 0.75; }
${M} .pips i { background: rgba(${INK}, 0.18); }
${M} .pips i.on { background: #1f5fae; }
${M} .row button { background: none; color: #a3271c; border: 2.5px solid #a3271c; border-radius: 4px; font: 400 15px/1 ${TYPE}; letter-spacing: 0.04em; padding-top: 3px; }
${M} .row button:disabled { background: none; color: rgba(${INK}, 0.45); border-color: rgba(${INK}, 0.3); }
${C} li { opacity: 0.92; }

/* ---- screens over the game: shop, loadout, bench, level-up, chest, pause, end of a run ---- */
${O} { background: rgba(20, 14, 6, 0.6); font: 400 14px/1.3 ${TYPE}; color: #2a2118; }
${O} .panel { ${PAPER} box-sizing: border-box; padding: 16px 14px 14px; border-radius: 3px; box-shadow: 0 14px 34px rgba(0, 0, 0, 0.6); }
${O} .panel h2, ${O} .panel.chest h2, ${O} .panel.levelup h2 { font: 400 32px/1 ${MARKER}; letter-spacing: 0; color: #2a2118; text-shadow: none; }
${O} .panel.levelup h2, ${O} .panel.chest h2 { color: #a3271c; font-size: 38px; }
${O} .panel p, ${O} .panel.levelup p { font: 400 13.5px/1.3 ${TYPE}; letter-spacing: 0; opacity: 0.88; }
${O} .cards .card, ${O} .panel.levelup .card, ${O} .panel.chest .card { ${CARD} }
${O} .cards .card b, ${O} .cards.compact .card:not(.has-art) b, ${O} .cards .card.has-art b, ${O} .panel.levelup .cards .card b { font: 400 16px/1.12 ${MARKER}; letter-spacing: 0; text-transform: none; }
${O} .panel.levelup .cards .card b { font-size: 19px; }
${O} .cards .card small { opacity: 0.88; font-weight: 400; }
${O} .cards .card .ci { border-color: rgba(${INK}, 0.55); box-shadow: 0 1px 3px rgba(40, 25, 5, 0.45); }
${O} .cards .card .tag { font: 400 11px/1.2 ${TYPE}; letter-spacing: 0.04em; color: rgba(${INK}, 0.75); }
${O} .card .price { background: none; color: #a3271c; border: 2px solid #a3271c; border-radius: 3px; padding: 5px 8px 1px; font: 400 15px/1 ${TYPE}; letter-spacing: 0.02em; }
${O} .card .price.sale { background: none; color: #2f6b3a; border-color: #2f6b3a; }
${O} .card .price.no { background: none; color: rgba(${INK}, 0.5); border-color: rgba(${INK}, 0.35); box-shadow: none; }
${O} .card .price.status { background: none; color: rgba(${INK}, 0.7); border: 1.5px solid rgba(${INK}, 0.4); }
${O} .card .foot em { font: 400 11px/1.15 ${TYPE}; letter-spacing: 0.02em; opacity: 0.8; }
${O} .card .foot em.sale { color: #2f6b3a; }
${O} .card .lock, ${O} .panel.levelup .card .banish { background: none; color: rgba(${INK}, 0.75); border: 1.5px solid rgba(${INK}, 0.4); border-radius: 3px; }
${O} .card .lock.on { background: rgba(163, 39, 28, 0.1); color: #a3271c; border-color: #a3271c; }
/* A gun is a small photo on its card; its stat bars are pencil. */
${O} .card.has-art .art { border: 3px solid #fff; border-radius: 1px; box-shadow: 0 1px 4px rgba(40, 25, 5, 0.45); box-sizing: border-box; }
${O} .card.has-art .bars { font: 400 10.5px/1 ${TYPE}; letter-spacing: 0.02em; }
${O} .card.has-art .bars i { background: rgba(${INK}, 0.15); }
${O} .card.has-art .bars i::after { background: #a3271c; }
${O} .card.has-art.equipped { border-color: #2f6b3a; box-shadow: inset 0 0 0 1.5px #2f6b3a; }
${O} .card.has-art.equipped .tag { color: #2f6b3a; }
${O} .panel .hint { opacity: 0.75; }
${O} .panel.shop .actions, ${O} .panel.tall .actions { bottom: -14px; padding: 16px 0 14px; background: linear-gradient(180deg, rgba(220, 207, 171, 0), #dccfab 16px); }
${O} .panel.shop .actions button, ${O} .panel.tall .actions button { background-color: #e9dfc3; }
${O} .primary { ${STAMP} padding: 13px 20px 8px; }
${O} .actions button.minor { background: none; color: #2a2118; border: 2px solid rgba(${INK}, 0.5); box-shadow: none; }
/* level-up: the rarity is the colour of the card's edge and of its tag, in pen colours. */
${O} .panel.levelup .card { --r: rgba(${INK}, 0.4); border: 2px solid var(--r); box-shadow: 0 2px 5px rgba(40, 25, 5, 0.25); }
${O} .panel.levelup .card.rare { --r: #1f5fae; }
${O} .panel.levelup .card.epic { --r: #7a35c2; }
${O} .panel.levelup .card.evolution { --r: #b07a00; }
${O} .panel.levelup .card .tag { color: var(--r); font: 400 11px/1.2 ${TYPE}; letter-spacing: 0.06em; }
${O} .panel.levelup .card.common .tag { color: rgba(${INK}, 0.7); opacity: 1; }
${O} .panel.levelup .card .tags i, ${O} .panel.levelup .syn { background: none; color: #2a2118; border: 1.5px solid var(--c); font: 400 10.5px/1.2 ${TYPE}; letter-spacing: 0.04em; padding: 3px 5px 0; }
${O} .panel.levelup .reroll { background: none; color: #2a2118; border: 2px solid #2a2118; border-radius: 4px; font: 400 15px/1 ${TYPE}; letter-spacing: 0.04em; }
${O} .panel.levelup .banish-left { font: 400 12px ${TYPE}; letter-spacing: 0; opacity: 0.75; }
/* end of a run */
${O} .panel.summary .grid div { ${CARD} }
${O} .panel.summary .grid b { font: 400 19px/1.1 ${MARKER}; white-space: nowrap; }
${O} .panel.summary .grid small { font: 400 11px ${TYPE}; letter-spacing: 0.02em; opacity: 0.8; }
${O} .panel.summary .dust { font: 400 20px/1.1 ${MARKER}; letter-spacing: 0; color: #1f5fae; }
${O} .panel.summary .dmg i { box-shadow: inset 0 0 0 1px rgba(${INK}, 0.35); }
`;

/** Adds the paper theme (once, at boot). */
export function installPaperTheme(): void {
  if (document.getElementById("paper-css")) return;
  const style = document.createElement("style");
  style.id = "paper-css";
  style.textContent = CSS;
  document.head.append(style);
}
