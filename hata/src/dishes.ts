import * as THREE from "three";
import { HOUSE } from "./world/house";
import { placeOnRack, SINK, syncDish, type Dish } from "./world/kitchen";

/**
 * Washing up, one dish at a time: the camera looks into the sink, the next
 * dirty dish slides under the tap, you scrub it with a finger (or hold the
 * action button and the sponge circles on its own, slower). A clean dish
 * goes to the drying rack and pays; the next one comes.
 */

export class DishStation {
  dishes: Dish[];
  current: Dish | null = null;
  private phase: "in" | "scrub" | "out" | "idle" = "idle";
  private t = 0;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  readonly sponge: THREE.Object3D;
  readonly stream: THREE.Mesh;
  private ray = new THREE.Raycaster();
  private orbit = 0;
  /** Where the sponge touched last frame (for foam). */
  lastHit: THREE.Vector3 | null = null;
  scrubbing = false;
  camPos = new THREE.Vector3(SINK.x, HOUSE.floorY + 1.62, SINK.z - 0.62);
  camLook = new THREE.Vector3(SINK.x, SINK.top - 0.12, SINK.z + 0.02);

  constructor(dishes: Dish[], sponge: THREE.Object3D, scene: THREE.Object3D) {
    this.dishes = dishes;
    this.sponge = sponge;
    this.sponge.visible = false;
    scene.add(this.sponge);
    this.stream = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.012, 0.3, 10, 1, true),
      new THREE.MeshPhysicalMaterial({ color: 0xdff0ff, transparent: true, opacity: 0.45, roughness: 0.05, transmission: 0, depthWrite: false }),
    );
    this.stream.position.set(SINK.x, SINK.top + 0.08, SINK.z + 0.13);
    this.stream.visible = false;
    scene.add(this.stream);
  }

  left(): number {
    return this.dishes.filter((d) => !d.done).length;
  }

  done(): number {
    return this.dishes.length - this.left();
  }

  enter(): void {
    this.stream.visible = true;
    this.nextDish();
  }

  exit(): void {
    this.stream.visible = false;
    this.sponge.visible = false;
    if (this.current && !this.current.done) {
      // put it back on the stack
      this.current.mesh.position.copy(this.current.home);
      syncDish(this.current);
    }
    this.current = null;
    this.phase = "idle";
  }

  private nextDish(): void {
    const d = this.dishes.find((x) => !x.done && x !== this.current) ?? null;
    this.current = d;
    if (!d) { this.phase = "idle"; return; }
    this.phase = "in";
    this.t = 0;
    this.from.copy(d.mesh.position);
    this.to.set(SINK.x, SINK.top - 0.16, SINK.z);
  }

  /**
   * One frame. `pointer` in NDC (finger), `held` = action button; returns the
   * amount of grime removed (for sounds) and whether a dish just finished.
   */
  update(dt: number, cam: THREE.Camera, pointer: { x: number; y: number; down: boolean }, held: boolean, rate: number, doneAt: number): { did: number; finished: Dish | null } {
    const d = this.current;
    this.lastHit = null;
    this.scrubbing = false;
    if (!d) return { did: 0, finished: null };
    this.t += dt;
    if (this.phase === "in" || this.phase === "out") {
      const k = Math.min(1, this.t / 0.45);
      const e = k * k * (3 - 2 * k);
      d.mesh.position.lerpVectors(this.from, this.to, e);
      d.mesh.position.y += Math.sin(e * Math.PI) * 0.12;
      syncDish(d);
      if (k >= 1) {
        if (this.phase === "out") {
          placeOnRack(d);
          this.nextDish();
        } else {
          this.phase = "scrub";
        }
      }
      return { did: 0, finished: null };
    }
    // scrub: finger on the dish, or the sponge circles by itself while the button is held
    let hit: THREE.Vector3 | null = null;
    if (pointer.down) {
      this.ray.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), cam);
      const hits = this.ray.intersectObject(d.mesh, true);
      if (hits.length) hit = hits[0].point;
    } else if (held) {
      this.orbit += dt * 2.3;
      const rr = d.r * (0.25 + 0.6 * (0.5 + 0.5 * Math.sin(this.orbit * 0.37)));
      hit = d.mesh.position.clone().add(new THREE.Vector3(Math.cos(this.orbit) * rr, d.h * 0.4, Math.sin(this.orbit) * rr));
    }
    let did = 0;
    if (hit) {
      did = d.surface.brush(hit, Math.max(0.035, d.r * 0.32), rate * dt * (pointer.down ? 1 : 0.55));
      this.sponge.visible = true;
      this.sponge.position.copy(hit).add(new THREE.Vector3(0, 0.015, 0));
      this.sponge.rotation.y = this.t * 2;
      this.lastHit = hit;
      this.scrubbing = true;
    } else {
      this.sponge.visible = false;
    }
    d.mesh.rotation.y += dt * 0.25;
    if (d.surface.share() >= doneAt) {
      d.surface.finish();
      d.done = true;
      this.phase = "out";
      this.t = 0;
      this.from.copy(d.mesh.position);
      this.to.copy(d.rack).add(new THREE.Vector3(0, 0.1, 0));
      this.sponge.visible = false;
      return { did, finished: d };
    }
    return { did, finished: null };
  }
}
