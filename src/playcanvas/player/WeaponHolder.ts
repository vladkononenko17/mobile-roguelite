import { Entity, Quat, Vec3, type AppBase, type Asset, type ContainerResource, type RenderComponent } from "playcanvas";
import { WEAPONS, type WeaponId } from "../config";
import { CHARACTER_LIGHT_MASK } from "../world/Environment";

/**
 * Loads the weapon set once and keeps at most one weapon in the hero's right hand. Weapons are lit
 * like the hero (same light mask), so they read as part of the character.
 */
export class WeaponHolder {
  private readonly templates = new Map<WeaponId, Entity>();
  private hand: Entity | null = null;
  private held: Entity | null = null;
  current: WeaponId | null = null;

  /** Called with the held weapon's upper-body clip (or null) whenever the weapon changes. */
  onPoseChange: (clipName: string | null) => void = () => {};

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
      for (const meshInstance of render.meshInstances) meshInstance.mask |= CHARACTER_LIGHT_MASK;
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

  /** Binds to a character model; the weapon follows its right-hand bone. */
  attachTo(model: Entity): void {
    this.hand = model.findByName(WEAPONS.handBone) as Entity | null;
    if (!this.hand) console.warn(`[Weapons] ${WEAPONS.handBone} not found on the character.`);
    if (this.current) this.equip(this.current);
  }

  /** Puts `id` in the hand (null = empty hands). */
  equip(id: WeaponId | null): void {
    this.held?.destroy();
    this.held = null;
    this.current = id;
    const template = id ? this.templates.get(id) : undefined;
    this.onPoseChange(id && template && this.hand ? WEAPONS.list[id].pose : null);
    if (!id || !template || !this.hand) return;
    const { position, rotation, rollDeg } = WEAPONS.list[id];
    const held = new Entity(`weapon-${id}`);
    held.addChild(template.clone());
    held.setLocalPosition(position[0], position[1], position[2]);
    // Roll about the hand's finger axis (+Y) after the base grip rotation.
    const grip = new Quat().setFromEulerAngles(rotation[0], rotation[1], rotation[2]);
    held.setLocalRotation(new Quat().setFromAxisAngle(Vec3.UP, rollDeg).mul(grip));
    this.hand.addChild(held);
    this.held = held;
  }

  /** The held weapon's root (for tuning its grip). */
  get entity(): Entity | null {
    return this.held;
  }
}
