import { Entity, Mat4, Quat, Vec3, type AppBase, type Asset, type ContainerResource, type RenderComponent, type StandardMaterial } from "playcanvas";
import { WEAPONS, type CharacterModel, type WeaponDef, type WeaponGrip, type WeaponId } from "../config";
import { gripMatrix } from "./GripFrame";
import { CHARACTER_LIGHT_MASK } from "../world/Environment";

export type GripSide = "right" | "left";

/**
 * Loads the weapon set once and keeps at most one weapon in the hero's right hand. Weapons are lit
 * like the hero (same light mask), so they read as part of the character.
 *
 * Hierarchy for a weapon with `grips` on a character with `hands`:
 *   RightHand bone -> WeaponSocket (the right palm grip frame) -> weapon (placed so its right grip
 *   frame, moved out to the handle surface, coincides with the socket) -> RightHandGrip /
 *   LeftHandGrip markers (the weapon's grip frames, on the handle axes).
 * The right hand leads: the weapon only ever follows the socket. Other weapons hang directly off
 * the hand bone with their legacy transform.
 */
export class WeaponHolder {
  private readonly templates = new Map<WeaponId, Entity>();
  private hand: Entity | null = null;
  /** The right palm grip frame (child of the hand bone); null for characters without `hands`. */
  private socketEntity: Entity | null = null;
  private held: Entity | null = null;
  private readonly markers = new Map<GripSide, Entity>();
  private readonly handRoll = new Quat();
  current: WeaponId | null = null;

  /** Called with the held weapon's upper-body clip (or null) whenever the weapon changes. */
  onPoseChange: (clipName: string | null) => void = () => {};
  /** Called after every equip (e.g. to show or hide the attack button). */
  onChange: () => void = () => {};

  constructor(private readonly app: AppBase) {}

  async load(url: string): Promise<void> {
    const asset = await new Promise<Asset>((resolve, reject) => {
      this.app.assets.loadFromUrlAndFilename(url, url.split("/").pop()!, "container", (error, loaded) => {
        if (error || !loaded) reject(new Error(`Failed to load weapons ${url}: ${error}`));
        else resolve(loaded);
      });
    });
    const root = (asset.resource as ContainerResource).instantiateRenderEntity();
    for (const render of root.findComponents("render") as RenderComponent[]) {
      for (const meshInstance of render.meshInstances) {
        meshInstance.mask |= CHARACTER_LIGHT_MASK;
        // Flat-colour guns carry their colours per vertex (see scripts/build-weapons.mjs).
        const material = meshInstance.material as StandardMaterial;
        if (material.name === "flat" && !material.diffuseVertexColor) {
          material.diffuseVertexColor = true;
          material.update();
        }
      }
      render.castShadows = true;
    }
    for (const [id, weapon] of Object.entries(WEAPONS.list) as [WeaponId, (typeof WEAPONS.list)[WeaponId]][]) {
      const node = root.findByName(weapon.node) as Entity | null;
      if (!node) {
        console.warn(`[Weapons] ${weapon.node} is missing from ${url}`);
        continue;
      }
      node.parent?.removeChild(node);
      this.templates.set(id, node);
    }
  }

  /**
   * Binds to a character model; the weapon follows its right-hand bone. `character.hands.right`
   * becomes the WeaponSocket; `handRollDeg.right` only adjusts legacy (grip-less) weapons.
   */
  attachTo(model: Entity, character: Pick<CharacterModel, "hands" | "handRollDeg"> = {}): void {
    this.handRoll.setFromAxisAngle(Vec3.UP, -(character.handRollDeg?.right ?? 0));
    this.socketEntity?.destroy();
    this.socketEntity = null;
    this.hand = model.findByName(WEAPONS.handBone) as Entity | null;
    if (!this.hand) console.warn(`[Weapons] ${WEAPONS.handBone} not found on the character.`);
    else if (character.hands) {
      this.socketEntity = new Entity("WeaponSocket");
      setLocalFromMatrix(this.socketEntity, gripMatrix(character.hands.right));
      this.hand.addChild(this.socketEntity);
    }
    if (this.current) this.equip(this.current);
  }

  /** Puts `id` in the hand (null = empty hands). */
  equip(id: WeaponId | null): void {
    this.held?.destroy();
    this.held = null;
    this.markers.clear();
    this.current = id;
    const template = id ? this.templates.get(id) : undefined;
    this.onPoseChange(id && template && this.hand ? WEAPONS.list[id].pose : null);
    if (!id || !template || !this.hand) {
      this.onChange();
      return;
    }
    const def: WeaponDef = WEAPONS.list[id];
    const scale = def.scale ?? 1;
    const held = new Entity(`weapon-${id}`);
    held.addChild(template.clone());
    if (def.grips && this.socketEntity) {
      // Weapon in socket space = inverse of (scale * right grip frame at the handle surface).
      const grip = new Mat4().setScale(scale, scale, scale).mul(gripMatrix(def.grips.right, new Mat4(), def.grips.right.radius));
      setLocalFromMatrix(held, grip.invert());
      for (const side of ["right", "left"] as const) {
        const frame = def.grips[side];
        if (!frame) continue;
        const marker = new Entity(side === "right" ? "RightHandGrip" : "LeftHandGrip");
        setLocalFromMatrix(marker, gripMatrix(frame));
        held.addChild(marker);
        this.markers.set(side, marker);
      }
      this.socketEntity.addChild(held);
    } else {
      const { position, rotation, rollDeg } = def;
      // Legacy grip in the Vanguard's hand frame, then turned into this rig's hand frame.
      held.setLocalPosition(this.handRoll.transformVector(new Vec3(position[0], position[1], position[2])));
      // Roll about the hand's finger axis (+Y) after the base grip rotation.
      const grip = new Quat().setFromEulerAngles(rotation[0], rotation[1], rotation[2]);
      held.setLocalRotation(this.handRoll.clone().mul(new Quat().setFromAxisAngle(Vec3.UP, rollDeg)).mul(grip));
      held.setLocalScale(scale, scale, scale);
      this.hand.addChild(held);
    }
    this.held = held;
    this.onChange();
  }

  /** The held weapon's one-shot attack clip, if it has one. */
  get attackClip(): string | null {
    return this.current && this.held ? WEAPONS.list[this.current].attack : null;
  }

  /**
   * The held weapon's grip on `side`: its marker entity (the grip frame on the handle axis, world
   * transform via the entity) and definition. Null when not held by grips or the weapon has none.
   */
  grip(side: GripSide): { marker: Entity; def: WeaponGrip } | null {
    const marker = this.markers.get(side);
    const def = this.current ? (WEAPONS.list[this.current] as WeaponDef).grips?.[side] : undefined;
    return marker && def ? { marker, def } : null;
  }

  /** The held weapon's ready hold, when it is held by grips and has one. */
  get hold(): WeaponDef["hold"] {
    return this.current && this.markers.size ? (WEAPONS.list[this.current] as WeaponDef).hold : undefined;
  }

  /** The right hand's WeaponSocket (null for characters without `hands`). */
  get socket(): Entity | null {
    return this.socketEntity;
  }

  /** The held weapon's root (for tuning its grip). */
  get entity(): Entity | null {
    return this.held;
  }
}

function setLocalFromMatrix(entity: Entity, matrix: Mat4): void {
  entity.setLocalPosition(matrix.getTranslation());
  entity.setLocalRotation(new Quat().setFromMat4(matrix));
  entity.setLocalScale(matrix.getScale());
}
