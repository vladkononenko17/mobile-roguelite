/** Simulation-only weapon state. Pausing is implemented by not advancing this clock. */
export class Weapon {
  damage = 28;
  fireDelay = 0.19;
  magazine = 12;
  ammo = 12;
  reloadDuration = 1.12;
  reloadLeft = 0;
  cooldown = 0;
  critChance = 0.12;
  pierce = 0;

  update(dt: number): boolean {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloadLeft <= 0) return false;
    this.reloadLeft = Math.max(0, this.reloadLeft - dt);
    if (this.reloadLeft > 0) return false;
    this.ammo = this.magazine;
    return true;
  }

  reload(): boolean {
    if (this.reloadLeft > 0 || this.ammo >= this.magazine) return false;
    this.reloadLeft = this.reloadDuration;
    return true;
  }

  shoot(): boolean {
    if (this.cooldown > 0 || this.reloadLeft > 0) return false;
    if (this.ammo <= 0) {
      this.reload();
      return false;
    }
    this.ammo -= 1;
    this.cooldown = this.fireDelay;
    if (this.ammo === 0) this.reload();
    return true;
  }

  upgrade(id: string): void {
    switch (id) {
      case "damage": this.damage *= 1.25; break;
      case "firerate": this.fireDelay = Math.max(0.09, this.fireDelay * 0.84); break;
      case "magazine":
        this.magazine += 4;
        this.ammo = this.magazine;
        this.reloadLeft = 0;
        break;
      case "crit": this.critChance = Math.min(0.6, this.critChance + 0.08); break;
      case "pierce": this.pierce = Math.min(4, this.pierce + 1); break;
    }
  }
}
