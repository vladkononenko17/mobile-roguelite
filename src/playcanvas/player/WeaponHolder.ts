import { Entity, Quat, Vec3, type AppBase, type Asset, type ContainerResource, type RenderComponent, type StandardMaterial } from "playcanvas";
import { WEAPONS, type WeaponDef, type WeaponId, type WeaponSocket } from "../config";
import { CHARACTER_LIGHT_MASK } from "../world/Environment";

/**
 * Loads the weapon set once and keeps at most one weapon in the hero's right hand. Weapons are lit
 * like the hero (same light mask), so they read as part of the character.
 */
export class WeaponHolder {
  private readonly templates = new Map<WeaponId, Entity>();
  private hand: Entity | null = null;
  private held: Entity | null = null;
  private readonly sockets = new Map<WeaponSocket, Entity>();
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
   * Binds to a character model; the weapon follows its right-hand bone. `handRollDeg` is the rig's
   * right-hand roll relative to the Vanguard's hand, which the weapon grips are authored on.
   */
  attachTo(model: Entity, handRollDeg = 0): void {
    this.handRoll.setFromAxisAngle(Vec3.UP, -handRollDeg);
    this.hand = model.findByName(WEAPONS.handBone) as Entity | null;
    if (!this.hand) console.warn(`[Weapons] ${WEAPONS.handBone} not found on the character.`);
    if (this.current) this.equip(this.current);
  }

  /** Puts `id` in the hand (null = empty hands). */
  equip(id: WeaponId | null): void {
    this.held?.destroy();
    this.held = null;
    this.sockets.clear();
    this.current = id;
    const template = id ? this.templates.get(id) : undefined;
    this.onPoseChange(id && template && this.hand ? WEAPONS.list[id].pose : null);
    if (!id || !template || !this.hand) {
      this.onChange();
      return;
    }
    const { position, rotation, rollDeg, scale = 1, sockets = {} }: WeaponDef = WEAPONS.list[id];
    const held = new Entity(`weapon-${id}`);
    held.addChild(template.clone());
    // Grip in the Vanguard's hand frame, then turned into this rig's hand frame.
    held.setLocalPosition(this.handRoll.transformVector(new Vec3(position[0], position[1], position[2])));
    // Roll about the hand's finger axis (+Y) after the base grip rotation.
    const grip = new Quat().setFromEulerAngles(rotation[0], rotation[1], rotation[2]);
    held.setLocalRotation(this.handRoll.clone().mul(new Quat().setFromAxisAngle(Vec3.UP, rollDeg)).mul(grip));
    held.setLocalScale(scale, scale, scale);
    for (const [name, { position: p, rotation: r = [0, 0, 0] }] of Object.entries(sockets) as [WeaponSocket, NonNullable<WeaponDef["sockets"]>[WeaponSocket] & {}][]) {
      const socket = new Entity(name);
      socket.setLocalPosition(p[0], p[1], p[2]);
      socket.setLocalEulerAngles(r[0], r[1], r[2]);
      held.addChild(socket);
      this.sockets.set(name, socket);
    }
    this.hand.addChild(held);
    this.held = held;
    this.onChange();
  }

  /** The held weapon's one-shot attack clip, if it has one. */
  get attackClip(): string | null {
    return this.current && this.held ? WEAPONS.list[this.current].attack : null;
  }

  /**
   * A socket on the held weapon (see WEAPONS sockets), e.g. `leftHandGrip` as the target for
   * left-hand IK. Null when nothing is held or the weapon has no such socket.
   */
  socket(name: WeaponSocket): Entity | null {
    return this.sockets.get(name) ?? null;
  }

  /** The held weapon's root (for tuning its grip). */
  get entity(): Entity | null {
    return this.held;
  }
}
