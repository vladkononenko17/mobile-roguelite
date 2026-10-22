/**
 * The job goes in stages: the front of the plot, then the back yard, then the
 * house room by room. The way into the next area stays closed until the
 * current stage is clean enough. Pure logic: rows of work in, stage state out.
 */

export interface StageDef {
  id: string;
  name: string;
  /** Row keys; a trailing ":" or "*" matches a prefix. */
  keys: string[];
}

export const STAGES: StageDef[] = [
  {
    id: "front", name: "Перед хатою",
    keys: ["facade:front", "facade:left", "facade:right", "drive", "path", "lawn:front", "lawn:side", "leaves:front", "glass:0", "glass:1", "glass:4", "glass:5", "glass:6"],
  },
  {
    id: "back", name: "Задній двір",
    keys: ["facade:back", "deck", "pool:coping", "lawn:back", "leaves:yard", "leaves:deck", "pool:leaves", "pool:chem", "glass:2", "glass:3"],
  },
  { id: "living", name: "Вітальня", keys: ["floor:living"] },
  { id: "bed", name: "Спальня", keys: ["floor:bed"] },
  { id: "kitchen", name: "Кухня", keys: ["floor:kitchen", "kitchen:*", "dishes"] },
  { id: "bath", name: "Ванна", keys: ["floor:bath", "bath:*"] },
  { id: "hall", name: "Коридор", keys: ["floor:hall"] },
];

/** A stage is done at this value-weighted share. */
export const STAGE_DONE = 0.85;

export interface StageRow {
  key: string;
  value: number;
  share: number;
}

export function matches(def: StageDef, key: string): boolean {
  return def.keys.some((k) => (k.endsWith("*") ? key.startsWith(k.slice(0, -1)) : k === key));
}

/** Value-weighted share of a stage; a stage with no rows counts as done. */
export function stageShare(def: StageDef, rows: StageRow[]): number {
  let v = 0, d = 0;
  for (const r of rows) {
    if (!matches(def, r.key)) continue;
    v += r.value;
    d += r.value * Math.min(1, Math.max(0, r.share));
  }
  return v > 0 ? d / v : 1;
}

/**
 * Index of the stage being worked on: the first one not yet done. Equals
 * STAGES.length when everything is done.
 */
export function currentStage(rows: StageRow[], done = STAGE_DONE): number {
  for (let i = 0; i < STAGES.length; i++) if (stageShare(STAGES[i], rows) < done) return i;
  return STAGES.length;
}
