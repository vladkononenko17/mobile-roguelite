/**
 * Third-party credits shown from the title screen (keep in sync with CREDITS.md and
 * assets-src/SOURCES.md). Each line: what, by whom, licence.
 */
export const CREDITS: { group: string; lines: string[] }[] = [
  {
    group: "Characters",
    lines: [
      "Hero: \"Zombie Apocalypse Survivor\" and \"3D Alien Monster\" by Codersan (Unity Asset Store licence)",
      "Infected (Zombie Apocalypse Kit: zombies and survivors), aliens, mechs, Ultimate Monsters: Quaternius (quaternius.com), CC0; \"Bestiary - Dungeon Monsters\" under the Quaternius Asset Licence",
      "Knights, skeletons, pirates: KayKit by Kay Lousberg, CC0",
      "Small Hearth Studios monsters and dungeon: \"Assets created by Small Hearth Studios\"",
      "Raven: opengameart.org/content/raven-0, CC0",
      "Some character animations were generated with Meshy AI (meshy.ai), CC BY 4.0",
    ],
  },
  {
    group: "Weapons",
    lines: ["\"Flat Guns East\" and \"Flat Gun Attachments\" by Pichuliru, CC0"],
  },
  {
    group: "Worlds",
    lines: [
      "Kenney (kenney.nl): Pirate, Graveyard, Nature, Space Station and Space kits, CC0",
      "KayKit by Kay Lousberg: Medieval Hexagon, Dungeon Remastered, Halloween Bits, CC0",
      "Quaternius: Zombie Apocalypse Kit, Ultimate Modular Sci-Fi, Ultimate Space Kit, CC0",
      "\"Inferno World\" (free) by ithappystudios",
      "\"Post-Apocalyptic Starter Pack\" by Atomic Realm; \"CitySurvivalLite\"",
      "\"Molten Maps SciFi\" by Moltenbolt, CC0; \"HallwayPACK\", CC0; 3dassets.dev, CC0",
      "\"LowPoly Apocalyptic Buildings\" by Majadroid, CC0",
      "\"Lowpoly alien buildings\" by smoke_th (free asset)",
      "Textures: Poly Haven (polyhaven.com), CC0",
    ],
  },
  {
    group: "Sound and music",
    lines: [
      "Kenney audio packs, CC0",
      "\"The Free Firearm Sound Library\", \"Zombies Sound Pack\", \"80 CC0 creature SFX\", \"Monster Sound Pack Vol. 1\" (OpenGameArt), CC0",
      "\"Gunshot with silencer\" by hotpin7 (Freesound), CC0; \"Zombie moans\" by darsycho, CC0",
      "Music: Juhani Junkala \"Post Apocalyptic Wastelands\", \"Epic Boss Battle\"; \"Ambience Pack 1 - Sci Fi Horror\" (OpenGameArt), CC0",
    ],
  },
  {
    group: "Code and fonts",
    lines: ["PlayCanvas engine (MIT)", "Barlow Condensed and Inter fonts (SIL Open Font Licence)"],
  },
];

const CSS = `
#credits { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: rgba(8, 6, 4, 0.86);
  font: 500 13px/1.4 system-ui, sans-serif; color: #ece3cf; -webkit-user-select: text; user-select: text; }
#credits .sheet { width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow-y: auto; box-sizing: border-box;
  padding: 18px 18px 14px; background: #17120e; border: 1px solid rgba(236, 227, 207, 0.18); border-radius: 12px; }
#credits h2 { margin: 0 0 8px; font: 800 26px/1 "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.12em; }
#credits h3 { margin: 14px 0 4px; font: 700 13px/1 "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.22em; text-transform: uppercase; color: var(--accent, #d6a23c); }
#credits ul { margin: 0; padding-left: 16px; }
#credits li { margin: 3px 0; opacity: 0.88; }
#credits button { margin-top: 16px; width: 100%; height: 44px; border: 0; border-radius: 10px; background: #d6a23c; color: #140f0b;
  font: 800 18px/1 "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.2em; }
`;

/** Opens the credits over everything; closes on the button, a tap outside or Escape. */
export function showCredits(): void {
  if (document.getElementById("credits")) return;
  if (!document.getElementById("credits-css")) {
    const style = document.createElement("style");
    style.id = "credits-css";
    style.textContent = CSS;
    document.head.append(style);
  }
  const root = document.createElement("div");
  root.id = "credits";
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  const h = document.createElement("h2");
  h.textContent = "CREDITS";
  sheet.append(h);
  for (const g of CREDITS) {
    const h3 = document.createElement("h3");
    h3.textContent = g.group;
    const ul = document.createElement("ul");
    for (const line of g.lines) {
      const li = document.createElement("li");
      li.textContent = line;
      ul.append(li);
    }
    sheet.append(h3, ul);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "CLOSE";
  sheet.append(close);
  root.append(sheet);
  const done = () => {
    window.removeEventListener("keydown", onKey, true);
    root.remove();
  };
  // While open, keys stay here (Enter / Space / arrows would drive the menu underneath).
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      done();
    }
  };
  close.addEventListener("click", done);
  root.addEventListener("click", (e) => {
    if (e.target === root) done();
  });
  window.addEventListener("keydown", onKey, true);
  document.body.append(root);
}
