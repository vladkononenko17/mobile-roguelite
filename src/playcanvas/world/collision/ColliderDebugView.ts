import { BLEND_NORMAL, Color, Entity, StandardMaterial, type AppBase } from "playcanvas";
import type { CollisionWorld } from "./CollisionWorld";

const HEIGHT = 0.6;

function debugMaterial(color: Color): StandardMaterial {
  const m = new StandardMaterial();
  m.useLighting = false;
  m.useSkybox = false;
  m.useFog = false;
  m.diffuse = new Color(0, 0, 0);
  m.emissive = color;
  m.opacity = 0.35;
  m.blendType = BLEND_NORMAL;
  m.depthWrite = false;
  m.update();
  return m;
}

/**
 * Translucent prisms showing every registered collider (orange) and the player's circle (cyan).
 * Built lazily on first enable, so it costs nothing while off (the default).
 */
export class ColliderDebugView {
  private root: Entity | null = null;
  private marker: Entity | null = null;
  private enabledState = false;

  constructor(
    private readonly app: AppBase,
    private readonly world: CollisionWorld,
    private readonly player: Entity,
    private readonly getPlayerRadius: () => number,
  ) {}

  get enabled(): boolean {
    return this.enabledState;
  }

  set enabled(value: boolean) {
    this.enabledState = value;
    if (value && !this.root) this.build();
    if (this.root) this.root.enabled = value;
    if (this.marker) this.marker.enabled = value;
  }

  /** Keeps the player circle in sync with a character-scale change. */
  update(): void {
    if (!this.enabledState || !this.marker) return;
    const d = this.getPlayerRadius() * 2;
    this.marker.setLocalScale(d, HEIGHT, d);
  }

  private build(): void {
    const root = new Entity("ColliderDebug");
    const solid = debugMaterial(new Color(1, 0.45, 0.1));
    for (const c of this.world.colliders) {
      const e = new Entity("collider-debug");
      e.addComponent("render", { type: c.kind === "box" ? "box" : "cylinder", material: solid, castShadows: false, receiveShadows: false });
      e.setLocalPosition(c.x, HEIGHT / 2, c.z);
      if (c.kind === "box") {
        e.setLocalScale(c.halfW * 2, HEIGHT, c.halfD * 2);
        e.setLocalEulerAngles(0, (Math.atan2(-c.axisZ, c.axisX) * 180) / Math.PI, 0);
      } else {
        e.setLocalScale(c.radius * 2, HEIGHT, c.radius * 2);
      }
      root.addChild(e);
    }
    this.app.root.addChild(root);

    const marker = new Entity("PlayerCollider");
    marker.addComponent("render", { type: "cylinder", material: debugMaterial(new Color(0.1, 0.9, 1)), castShadows: false, receiveShadows: false });
    marker.setLocalPosition(0, HEIGHT / 2, 0);
    // Parented to the player root (never scaled or tilted) so it follows the player.
    this.player.addChild(marker);
    this.root = root;
    this.marker = marker;
    this.update();
  }
}
