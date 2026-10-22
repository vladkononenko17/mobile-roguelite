import { Entity, Mat4, Quat, Vec3, type AppBase, type Asset, type ContainerResource, type RenderComponent, type StandardMaterial } from "playcanvas";
import { WEAPON_CLASSES, WEAPONS, type CharacterModel, type WeaponClassProfile, type WeaponDef, type WeaponGrip, type WeaponId } from "../config";
import { WEAPON_MODS, weaponMod, type WeaponModId } from "../weaponMods";
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
  private readonly attachmentTemplates = new Map<WeaponModId, Entity>();
  private hand: Entity | null = null;
  /** The right palm grip frame (child of the hand bone); null for characters without `hands`. */
  private socketEntity: Entity | null = null;
  private held: Entity | null = null;
  private readonly markers = new Map<GripSide, Entity>();
  private readonly muzzles: Entity[] = [];
  private stockMarker: Entity | null = null;
  private activeMods = new Set<WeaponModId>();
  /** Runtime replacements for WEAPONS entries (the tune panel's weapon tuner). */
  private readonly overrides = new Map<WeaponId, WeaponDef>();
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
    this.prepareModel(root);
    for (const [id, weapon] of Object.entries(WEAPONS.list) as [WeaponId, (typeof WEAPONS.list)[WeaponId]][]) {
      const node = root.findByName(weapon.node) as Entity | null;
      if (!node) {
        console.warn(`[Weapons] ${weapon.node} is missing from ${url}`);
        continue;
      }
      node.parent?.removeChild(node);
      this.templates.set(id, node);
    }
    // The three tiny CC0 attachment files are loaded once and cloned onto the chosen weapon.
    await Promise.all(WEAPON_MODS.filter((mod) => mod.visual).map(async (mod) => {
      const visual = mod.visual!;
      const attachment = await new Promise<Asset>((resolve, reject) => {
        const full = visual.url;
        this.app.assets.loadFromUrlAndFilename(full, visual.url.split("/").pop()!, "container", (error, loaded) => {
          if (error || !loaded) reject(new Error(`Failed to load weapon attachment ${full}: ${error}`));
          else resolve(loaded);
        });
      });
      const model = (attachment.resource as ContainerResource).instantiateRenderEntity();
      this.prepareModel(model);
      this.attachmentTemplates.set(mod.id, model);
    }));
  }

  private prepareModel(root: Entity): void {
    for (const render of root.findComponents("render") as RenderComponent[]) {
      for (const meshInstance of render.meshInstances) {
        meshInstance.mask |= CHARACTER_LIGHT_MASK;
        // Packed Flat Guns use vertex colour; individual attachment GLBs use their own flat materials.
        const material = meshInstance.material as StandardMaterial;
        if (material.name === "flat" && !material.diffuseVertexColor) {
          material.diffuseVertexColor = true;
          material.update();
        }
      }
      render.castShadows = true;
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
    this.muzzles.length = 0;
    this.current = id;
    const template = id ? this.templates.get(id) : undefined;
    this.stockMarker = null;
    this.onPoseChange(id && template && this.hand ? WEAPON_CLASSES[this.definition(id).class].pose : null);
    if (!id || !template || !this.hand) {
      this.onChange();
      return;
    }
    const def = this.definition(id);
    const scale = def.scale ?? 1;
    const held = new Entity(`weapon-${id}`);
    const guns = [template.clone()];
    held.addChild(guns[0]);
    if (def.dual) {
      const second = template.clone();
      second.setLocalPosition(def.dual.offset[0], def.dual.offset[1], def.dual.offset[2]);
      held.addChild(second);
      guns.push(second);
    }
    this.applyMods(def, guns);
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
      if (def.stock) {
        this.stockMarker = new Entity("Stock");
        this.stockMarker.setLocalPosition(def.stock[0], def.stock[1], def.stock[2]);
        held.addChild(this.stockMarker);
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
    this.buildMuzzles(held, guns, def);
    this.onChange();
  }

  /** Adds visual modules and stretches the gun's own magazine mesh for the extended-mag module. */
  private applyMods(def: WeaponDef, guns: Entity[]): void {
    for (const id of this.activeMods) {
      const mod = weaponMod(id);
      for (const gun of guns) {
        if (mod.magazineScale && def.magazineNode) {
          const magazine = gun.findByName(def.magazineNode) as Entity | null;
          if (magazine) {
            const s = magazine.getLocalScale();
            if (def.magazineAxis === "z") magazine.setLocalScale(s.x, s.y, s.z * mod.magazineScale);
            else magazine.setLocalScale(s.x, s.y * mod.magazineScale, s.z);
          }
        }
        if (!mod.visual) continue;
        const template = this.attachmentTemplates.get(id);
        const mountDef = def.modMounts?.[id];
        if (!template || !mountDef) continue;
        const anchor = mountDef.anchor ? (gun.findByName(mountDef.anchor) as Entity | null) : null;
        const parent = anchor ?? gun;
        const attachment = template.clone();
        const p = anchor ? [0, 0, 0] : mountDef.position ?? [0, 0, 0];
        const r = mountDef.rotation ?? [0, 0, 0];
        const s = mountDef.scale ?? 1;
        attachment.setLocalPosition(p[0], p[1], p[2]);
        attachment.setLocalEulerAngles(r[0], r[1], r[2]);
        attachment.setLocalScale(s, s, s);
        parent.addChild(attachment);
      }
    }
  }

  /** Exact mount bones on Flat Guns; a measured mesh-front fallback on older weapon models. */
  private buildMuzzles(held: Entity, guns: Entity[], def: WeaponDef): void {
    const suppressor = this.activeMods.has("suppressor") ? weaponMod("suppressor").visual?.muzzleExtension ?? 0 : 0;
    for (const gun of guns) {
      const mountDef = def.modMounts?.suppressor;
      const anchor = mountDef?.anchor ? (gun.findByName(mountDef.anchor) as Entity | null) : null;
      const marker = new Entity("Muzzle");
      if (anchor) {
        marker.setLocalPosition(0, 0, -suppressor);
        anchor.addChild(marker);
      } else if (mountDef?.position) {
        marker.setLocalPosition(mountDef.position[0], mountDef.position[1], mountDef.position[2] - suppressor);
        gun.addChild(marker);
      } else {
        marker.setLocalPosition(this.measureMuzzle(gun, held));
        held.addChild(marker);
      }
      this.muzzles.push(marker);
    }
  }

  /** Finds the front-most (-Z) point of `model`, returned in `held` space. */
  private measureMuzzle(model: Entity, held: Entity): Vec3 {
    const inverse = held.getWorldTransform().clone().invert();
    const corner = new Vec3();
    const local = new Vec3();
    let best = Infinity;
    let sumX = 0, sumY = 0, count = 0;
    for (const render of model.findComponents("render") as RenderComponent[]) {
      for (const mi of render.meshInstances) {
        const box = mi.aabb;
        const c = box.center, h = box.halfExtents;
        for (let i = 0; i < 8; i++) {
          corner.set(c.x + (i & 1 ? h.x : -h.x), c.y + (i & 2 ? h.y : -h.y), c.z + (i & 4 ? h.z : -h.z));
          inverse.transformPoint(corner, local);
          if (local.z < best) best = local.z;
          sumX += local.x;
          sumY += local.y;
          count++;
        }
      }
    }
    return new Vec3(count ? sumX / count : 0, count ? sumY / count : 0, Number.isFinite(best) ? best : -0.3);
  }

  /** World position of the active muzzle; dual guns alternate on successive shots. */
  muzzle(out: Vec3, shot = 0): Vec3 | null {
    if (!this.held || !this.muzzles.length) return null;
    return out.copy(this.muzzles[Math.abs(shot) % this.muzzles.length].getPosition());
  }

  /** The held weapon's one-shot attack clip, if it has one. */
  get attackClip(): string | null {
    return this.current && this.held ? this.definition(this.current).attack : null;
  }

  /**
   * The held weapon's grip on `side`: its marker entity (the grip frame on the handle axis, world
   * transform via the entity) and definition. Null when not held by grips or the weapon has none.
   */
  grip(side: GripSide): { marker: Entity; def: WeaponGrip } | null {
    const marker = this.markers.get(side);
    const def = this.current ? this.definition(this.current).grips?.[side] : undefined;
    return marker && def ? { marker, def } : null;
  }

  /** The effective definition of `id` (a tuner override, else WEAPONS). */
  definition(id: WeaponId): WeaponDef {
    return this.overrides.get(id) ?? WEAPONS.list[id];
  }

  /** Replaces `id`'s definition at runtime (null restores WEAPONS) and re-equips it if held. */
  setOverride(id: WeaponId, def: WeaponDef | null): void {
    if (def) this.overrides.set(id, def);
    else this.overrides.delete(id);
    if (this.current === id) this.equip(id);
  }

  /** Replaces the visible attachment set; optionally waits for the caller's following equip. */
  setMods(mods: Iterable<WeaponModId>, refresh = true): void {
    const next = new Set(mods);
    if (next.size === this.activeMods.size && [...next].every((id) => this.activeMods.has(id))) return;
    this.activeMods = next;
    if (refresh && this.current) this.equip(this.current);
  }

  /** The held weapon's class profile (null when empty-handed). */
  get profile(): WeaponClassProfile | null {
    return this.current && this.held ? WEAPON_CLASSES[this.definition(this.current).class] : null;
  }

  /** True when the held weapon is placed by its grips (so its class hold and IK apply). */
  get gripped(): boolean {
    return this.markers.size > 0;
  }

  /** The held weapon's butt-plate marker (shoulder-held classes). */
  get stock(): Entity | null {
    return this.stockMarker;
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
