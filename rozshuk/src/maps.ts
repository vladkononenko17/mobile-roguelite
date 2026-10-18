/**
 * Outing maps for «Розшук», drawn as ASCII so they are easy to read and edit.
 * One character = one 3×3 m cell. North (row 0) is the far side of the screen;
 * the camera looks from the south, so the player usually starts at the bottom.
 *
 * Terrain
 *   #  building / wall (tall, blocks walking and sight)
 *   G  garage (blocks both)        K  kiosk / shop / booth (blocks both)
 *   Y  dense trees (blocks both)   ~  water (blocks walking; boats sail it)
 *   %  fence (blocks walking only) ^  fence you can vault (QTE)
 *   &  parked car (blocks both)    W  stall / desk / seats (blocks walking only)
 *   B  bench with a babusia        D  dog kennel (barks when you come close)
 *   *  bush / hiding spot          +  doorway / toilet / closet (hiding spot)
 *   T  tree (decoration)           L  street lamp (decoration)
 *   =  road  -  rails / zebra  :  pavement / tiles  .  ground / grass
 * Markers
 *   @  start (and exit, unless the map has !)    !  exit
 *   1-9 objective slots (level config gives them meaning)
 *   a-z patrol waypoints (level config strings them into routes)
 */

export type MapId =
  | "dvir" | "street" | "market" | "night" | "park" | "center" | "office"
  | "station" | "train" | "village" | "forest" | "river" | "checkpoint";

export interface MapDef {
  rows: string[];
  /** Visual set: outdoor town, indoor rooms, train carriage, woods. */
  look: "town" | "indoor" | "train" | "woods";
}

export const CELL = 3;

export const MAPS: Record<MapId, MapDef> = {
  dvir: {
    look: "town",
    rows: [
      "####=a==h####",
      "####=====####",
      "..T.=====.T..",
      "&&..::b::..&&",
      "..*.:...:..*.",
      "##+#:...:#+##",
      "####:.*.:####",
      "####:...:####",
      ".T..c...d..T.",
      "..*.:.B.:.*..",
      ".1..:.3.:....",
      "GGG.:.T.:.KKK",
      "GGG.e...f.KKK",
      "..*.:...:.:2:",
      "....:.g.:....",
      "..T..:@:..T..",
      "######+######",
    ],
  },
  street: {
    look: "town",
    rows: [
      "###::===::###",
      "###:a===b:###",
      "KKK1:=i=:2KKK",
      "KKK.:===:.KKK",
      "###*:===:*###",
      "###:&===&:###",
      "##+:c=j=d:+##",
      "###::===::###",
      "T*.::---::.*T",
      "###::===::###",
      "###.&===.:###",
      "KKK3:===:.###",
      "KKK.:=k=:*+##",
      "###e:===:f###",
      "###:&===::###",
      "TT.*:===:..T.",
      "###:B===::###",
      "###g:=l=:h###",
      "####.:@:.####",
      "######+######",
    ],
  },
  market: {
    look: "town",
    rows: [
      "##KKK###KKK##",
      "##K1K:a:K2K##",
      "..:.:...:.:..",
      ".WW*WW.WW*WW.",
      "..b.........c",
      ".WW.WW*WW.WW.",
      "*.....3......",
      ".WW*WW.WW*WW.",
      "d...........e",
      ".WW.WW.WW.WW*",
      "..:...B...:..",
      "GGG.:...:.GGG",
      "GGG.f...g.GGG",
      "..*.:.4.:..*.",
      "..T.:...:.T..",
      "&&..=====..&&",
      "====h=====i==",
      "=============",
      "..T..:@:..T..",
      "######+######",
    ],
  },
  night: {
    look: "town",
    rows: [
      "#############",
      "####KKKKK####",
      "....KK1KK....",
      "..T.:...:.T..",
      "%%%%:.a.:%%^%",
      "..*.:...:..*.",
      "&&..b...c..&&",
      "====d===e====",
      "=============",
      "..T.:...:.*..",
      "##+#:.B.:#+##",
      "####:...:####",
      "####f...g####",
      "..*.:.*.:.2..",
      "GGG.:...:....",
      "GGG.h.T.i..T.",
      "..T..:@:.....",
      "######+######",
    ],
  },
  park: {
    look: "town",
    rows: [
      "YYYYYYYYYYYYY",
      "Y..T.....T..Y",
      "Y.KKK...GGG.Y",
      "Y.K1K.a.G2G.Y",
      "Y..:..:..:..Y",
      "Y*.:b.:.c:.*Y",
      "Y..:::~:::..Y",
      "Y.T:.~~~.:T.Y",
      "Y..:::~:::..Y",
      "Y*.d..B..e.*Y",
      "Y..T..:..T..Y",
      "Y.**..:..**.Y",
      "YYYY..:..YYYY",
      "====f=:=g====",
      "=============",
      "..T..:@:..T..",
      "######+######",
    ],
  },
  center: {
    look: "town",
    rows: [
      "#############",
      "#####+1+#####",
      "..T..:::..T..",
      "&&..:a:b:..&&",
      "###.:::::.###",
      "##2.::~::.###",
      "###.:~~~:.3##",
      "###.c:~:d.###",
      "..*.:::::.*..",
      "..T..:B:..T..",
      "====e===f====",
      "=============",
      "&&..:...:..&&",
      "..*.g.T.h.*..",
      "..T..:@:..T..",
      "######+######",
    ],
  },
  office: {
    look: "indoor",
    rows: [
      "###########",
      "#W1W#:#W2W#",
      "#:::#:#:::#",
      "#*:::a:::*#",
      "#####:#####",
      "#:::#:#:::#",
      "#W3W#b#WWW#",
      "#:::::::*:#",
      "#####:#####",
      "#*W::c::W*#",
      "#:::::::::#",
      "###:::::###",
      "###d:@:e###",
      "#####+#####",
    ],
  },
  station: {
    look: "town",
    rows: [
      "-------------",
      "&&&&&&&&&&&&&",
      ":::1:::::2:::",
      ":a:*:::*::b::",
      "-------------",
      "--&&&&---&&&-",
      "-------------",
      ":c::*:::*::d:",
      "::::::B::::::",
      "####+:::+####",
      "####K:3:K####",
      "####::e::####",
      "..*.:::::.*..",
      "&&..f===g..&&",
      "=============",
      "..T..:@:..T..",
      "######+######",
    ],
  },
  train: {
    look: "train",
    rows: [
      "#######",
      "#+:!:+#",
      "#::a::#",
      "#WW:WW#",
      "#*:::*#",
      "#WW:WW#",
      "#::b::#",
      "#WW:WW#",
      "#*:::*#",
      "#WW:WW#",
      "#::c::#",
      "#WW:WW#",
      "#*:::*#",
      "#WW:WW#",
      "#::d::#",
      "#+:@:+#",
      "#######",
    ],
  },
  village: {
    look: "woods",
    rows: [
      "YYYYYY!YYYYYY",
      "YT....:....TY",
      "Y%%%%.:.%%%%Y",
      "Y%KK%.a.%KK%Y",
      "Y%K1..:..2K%Y",
      "Y%D.%.:.%.D%Y",
      "Y%%^%.:.%^%%Y",
      "Y*...b:c...*Y",
      "YYY..:=:..YYY",
      "Y%%%%:=:%%%%Y",
      "Y%KK%.=.%KK%Y",
      "Y%D...=...D%Y",
      "Y%%^%d=e%^%%Y",
      "Y.T..:=:..T.Y",
      "YY.*.f=g.*.YY",
      "Y....:@:....Y",
      "YYYYYYYYYYYYY",
    ],
  },
  forest: {
    look: "woods",
    rows: [
      "YYYY..!..YYYY",
      "YY*..T...*.YY",
      "Y..YY.a.YY..Y",
      "Y*.Y.....Y.*Y",
      "Y..b.YY*..c.Y",
      "YY...YY...*YY",
      "Y*.T..1..T..Y",
      "Y..YYY.YYY..Y",
      "Yd...*.*...eY",
      "YYY.......YYY",
      "Y*..YY.YY.*.Y",
      "Y...Y.f.Y...Y",
      "Y.*.....*...Y",
      "YY..g.Y.h..YY",
      "Y*..YY.YY..*Y",
      "Y.....@.....Y",
      "YYYYYYYYYYYYY",
    ],
  },
  river: {
    look: "woods",
    rows: [
      "~~~~~~~~~~~~~",
      "~~~~~~~~~~~~~",
      "~~a~~~~~~~b~~",
      "~~~~~~~~~~~~~",
      "..*.T.1.T.*..",
      "Y*...c...d.*Y",
      "YY..YY.YY..YY",
      "Y*..e...f..*Y",
      "Y..YY.*.YY..Y",
      "Y.*.......*.Y",
      "YY.g.YYY.h.YY",
      "Y*.........*Y",
      "Y..YY.@.YY..Y",
      "YYYYYYYYYYYYY",
    ],
  },
  checkpoint: {
    look: "town",
    rows: [
      "=============",
      "======!======",
      "%%%%%K1K%%%%%",
      ":::::::::::::",
      ":a:%%%:%%%:b:",
      ":::%:::::%:::",
      ":c:%%%:%%%:d:",
      ":::::2:::::::",
      "&&&::::::&&&&",
      "===e=====f===",
      "=============",
      "KK..:::::..KK",
      "##+3:::::.+##",
      "####::@::####",
      "#############",
    ],
  },
};

const BLOCK_MOVE = new Set(["#", "G", "K", "Y", "~", "%", "^", "&", "W", "B", "D"]);
const BLOCK_SIGHT = new Set(["#", "G", "K", "Y", "&"]);
const HIDE = new Set(["*", "+"]);

export const blocksMove = (ch: string): boolean => BLOCK_MOVE.has(ch);
export const blocksSight = (ch: string): boolean => BLOCK_SIGHT.has(ch);
export const isHide = (ch: string): boolean => HIDE.has(ch);
export const isWaypoint = (ch: string): boolean => ch >= "a" && ch <= "z";
export const isSlot = (ch: string): boolean => ch >= "1" && ch <= "9";

/** Ground under markers, guessed from the neighbours so roads stay roads. */
export function floorOf(rows: string[], r: number, c: number): string {
  const ch = rows[r][c];
  if (!isWaypoint(ch) && !isSlot(ch) && ch !== "@" && ch !== "!" && ch !== "B" && ch !== "D") return ch;
  const counts = new Map<string, number>();
  for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const n = rows[r + dr]?.[c + dc];
    if (n === "=" || n === ":" || n === "." || n === "-") counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  let best = ".";
  let bestN = 0;
  for (const [k, v] of counts) if (v > bestN || (v === bestN && k === ":")) { best = k; bestN = v; }
  return best;
}
