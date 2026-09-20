import Phaser from "phaser";

/** Flat scenery only: painted metal, road markings and cracks never imply a solid obstacle. */
export function drawWasteland(scene: Phaser.Scene, size: number): void {
  const g = scene.add.graphics().setDepth(-20);
  const random = new Phaser.Math.RandomDataGenerator(["dustline-scrapyard-02"]);
  g.fillStyle(0x77614b).fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 96) {
    for (let x = 0; x < size; x += 96) {
      const color = random.pick([0x806a50, 0x75604a, 0x6e5947, 0x7b634c]);
      g.fillStyle(color).fillRect(x, y, 96, 96);
      g.lineStyle(1, 0x302b2a, 0.23).lineBetween(x, y, x + 85, y + 2);
      g.lineStyle(2, 0x302b2a, 0.42);
      const cx = x + random.between(15, 65);
      const cy = y + random.between(10, 75);
      g.beginPath().moveTo(cx, cy).lineTo(cx + 9, cy + 3).lineTo(cx + 16, cy - 3).lineTo(cx + 23, cy + 4).strokePath();
      g.fillStyle(0x251f24, 0.25);
      for (let i = 0; i < 8; i++) g.fillCircle(x + random.between(1, 90), y + random.between(1, 90), 1);
    }
  }
  const center = size / 2;
  g.fillStyle(0x49413a).fillRect(center - 112, 0, 224, size);
  g.lineStyle(5, 0x252127).lineBetween(center - 115, 0, center - 115, size).lineBetween(center + 115, 0, center + 115, size);
  g.fillStyle(0xc6a15a, 0.8);
  for (let y = 0; y < size; y += 110) g.fillRect(center - 3, y, 6, 38);
  for (let y = 60; y < size; y += 440) {
    for (const x of [center - 330, center + 230]) {
      g.fillStyle(0x1f1c22, 0.45).fillRect(x + 7, y + 5, 94, 138);
      g.fillStyle(0x665d4d).fillRect(x, y, 94, 138);
      g.lineStyle(4, 0x282329).strokeRect(x, y, 94, 138);
      g.lineStyle(2, 0x938065);
      for (let i = 8; i < 132; i += 13) g.lineBetween(x + 7, y + i, x + 84, y + i);
      g.fillStyle(0xe7af38).fillRect(x, y, 94, 10);
      g.lineStyle(5, 0x282329);
      for (let i = 6; i < 90; i += 20) g.lineBetween(x + i, y + 1, x + i + 6, y + 9);
      g.fillStyle(0x2d2527);
      for (const bx of [7, 87]) for (const by of [17, 129]) g.fillCircle(x + bx, y + by, 3);
    }
  }
  for (let i = 0; i < 100; i++) {
    const x = random.between(30, size - 30);
    const y = random.between(30, size - 30);
    g.lineStyle(2, 0x292328, 0.55).lineBetween(x, y, x + 16, y - 5).lineBetween(x + 16, y - 5, x + 26, y + 8);
  }
  for (let y = 640; y < size; y += 650) {
    scene.add.text(center, y, "DUSTLINE\nSECTOR 07", {
      fontFamily: "Barlow Condensed, sans-serif", fontSize: "29px", fontStyle: "bold",
      color: "#b59c73", align: "center", stroke: "#30292a", strokeThickness: 1,
    }).setOrigin(0.5).setAngle(-90).setAlpha(0.5).setDepth(-19);
  }
  g.lineStyle(14, 0x292329).strokeRect(18, 18, size - 36, size - 36);
}
