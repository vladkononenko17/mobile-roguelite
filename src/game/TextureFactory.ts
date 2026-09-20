import Phaser from "phaser";

const INK = 0x171318;
const PAPER = 0xe7ddc6;
const YELLOW = 0xf2b632;
const ORANGE = 0xe8602f;
const RED = 0xd63732;
const ACID = 0xb8d84a;
const BLUE = 0x54b7c6;

function polygon(
  graphics: Phaser.GameObjects.Graphics,
  points: number[],
  fill: number,
  lineWidth = 4,
): void {
  const shape = new Phaser.Geom.Polygon(points);
  graphics.fillStyle(fill, 1);
  graphics.fillPoints(shape.points, true);
  graphics.lineStyle(lineWidth, INK, 1);
  graphics.strokePoints(shape.points, true);
}

export function createGameTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists("wastelander")) return;

  const g = scene.add.graphics();

  g.clear();
  polygon(g, [26, 3, 37, 11, 42, 30, 35, 54, 17, 57, 9, 40, 11, 15], ORANGE, 5);
  g.fillStyle(PAPER, 1);
  g.fillCircle(26, 18, 10);
  g.lineStyle(4, INK, 1);
  g.strokeCircle(26, 18, 10);
  g.lineStyle(3, INK, 1);
  g.lineBetween(18, 33, 35, 46);
  g.lineBetween(17, 42, 9, 57);
  g.lineBetween(33, 42, 43, 56);
  g.fillStyle(YELLOW, 1);
  g.fillTriangle(16, 11, 12, 2, 24, 8);
  g.fillTriangle(36, 11, 40, 2, 29, 8);
  g.lineStyle(3, INK, 1);
  g.strokeTriangle(16, 11, 12, 2, 24, 8);
  g.strokeTriangle(36, 11, 40, 2, 29, 8);
  g.fillStyle(INK, 1);
  g.fillCircle(22, 18, 2);
  g.fillCircle(30, 18, 2);
  g.generateTexture("wastelander", 52, 62);

  // Four reusable inked walk frames: dust coat, articulated boots, goggles and scarf.
  for (let frame = 0; frame < 4; frame += 1) {
    const stride = [0, 4, 0, -4][frame];
    g.clear();
    g.fillStyle(INK, 0.3).fillEllipse(26, 55, 45, 10);
    polygon(g, [14, 38, 23, 39, 24, 53 + stride, 10, 53 + stride], 0x544440, 3);
    polygon(g, [29, 39, 39, 37, 43, 53 - stride, 28, 53 - stride], 0x544440, 3);
    polygon(g, [12, 25, 38, 24, 44, 46, 31, 43, 26, 49, 8, 44], ORANGE, 4);
    polygon(g, [30, 27, 38, 27, 40, 40, 32, 37], 0x983b2b, 2);
    g.lineStyle(3, INK, 1).lineBetween(23, 25, 30, 45);
    g.fillStyle(YELLOW, 1).fillRect(22, 36, 8, 4);
    polygon(g, [13, 23, 8, 12, 10, 2, 20, 8, 31, 8, 42, 2, 43, 16, 37, 26, 25, 29], PAPER, 4);
    g.fillStyle(0xb8ab91, 1).fillTriangle(35, 9, 39, 7, 38, 23);
    polygon(g, [9, 14, 40, 13, 39, 21, 28, 22, 25, 19, 19, 22, 10, 20], INK, 2);
    g.fillStyle(BLUE, 1).fillRect(13, 16, 8, 3).fillRect(29, 16, 8, 3);
    polygon(g, [15, 25, 38, 24, 37, 29, 15, 32, 4, 27], YELLOW, 3);
    g.generateTexture(`wastelander-${frame}`, 52, 62);
  }

  g.clear();
  polygon(g, [3, 5, 50, 5, 59, 10, 51, 15, 31, 15, 28, 20, 19, 20, 17, 15, 3, 15], YELLOW, 4);
  g.fillStyle(RED, 1);
  g.fillRect(34, 8, 12, 4);
  g.lineStyle(2, INK, 1);
  g.lineBetween(9, 8, 28, 8);
  g.generateTexture("rifle", 62, 24);

  g.clear();
  polygon(g, [1, 12, 11, 7, 16, 1, 18, 10, 31, 6, 23, 15, 30, 23, 15, 19, 13, 27, 8, 18], YELLOW, 2);
  g.fillStyle(PAPER, 1).fillTriangle(3, 13, 20, 11, 14, 18);
  g.generateTexture("muzzle", 34, 28);

  g.clear();
  polygon(g, [20, 2, 36, 8, 39, 25, 30, 39, 11, 37, 3, 21, 9, 7], RED, 4);
  g.fillStyle(INK, 1);
  g.fillCircle(16, 18, 4);
  g.fillCircle(29, 18, 4);
  g.fillStyle(PAPER, 1);
  g.fillTriangle(14, 28, 20, 35, 23, 27);
  g.lineStyle(2, 0x76251f, 1);
  g.lineBetween(10, 10, 31, 30);
  g.lineBetween(7, 23, 25, 37);
  g.generateTexture("raider", 42, 42);

  g.clear();
  polygon(g, [21, 2, 36, 12, 34, 32, 20, 40, 5, 31, 7, 11], BLUE, 4);
  g.fillStyle(ACID, 1);
  g.fillCircle(21, 20, 8);
  g.lineStyle(3, INK, 1);
  g.strokeCircle(21, 20, 8);
  g.fillStyle(INK, 1);
  g.fillCircle(21, 20, 3);
  g.lineStyle(2, 0x256c78, 1);
  g.lineBetween(10, 11, 31, 31);
  g.generateTexture("spitter", 42, 42);

  g.clear();
  polygon(g, [28, 2, 48, 9, 55, 28, 48, 51, 28, 57, 8, 49, 2, 29, 9, 9], ORANGE, 5);
  g.fillStyle(0x7b3426, 1);
  g.fillRect(12, 17, 32, 23);
  g.lineStyle(4, INK, 1);
  g.strokeRect(12, 17, 32, 23);
  g.fillStyle(YELLOW, 1);
  g.fillCircle(28, 28, 8);
  g.lineStyle(3, INK, 1);
  g.strokeCircle(28, 28, 8);
  g.generateTexture("brute", 60, 60);

  g.clear();
  polygon(g, [46, 2, 73, 13, 87, 40, 78, 76, 48, 91, 13, 77, 2, 46, 14, 14], ACID, 6);
  g.fillStyle(0x594e3b, 1);
  g.fillCircle(46, 46, 28);
  g.lineStyle(6, INK, 1);
  g.strokeCircle(46, 46, 28);
  g.fillStyle(RED, 1);
  g.fillCircle(46, 46, 13);
  g.lineStyle(4, INK, 1);
  g.strokeCircle(46, 46, 13);
  g.lineStyle(3, INK, 0.8);
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
    g.lineBetween(46 + Math.cos(angle) * 17, 46 + Math.sin(angle) * 17, 46 + Math.cos(angle) * 31, 46 + Math.sin(angle) * 31);
  }
  g.generateTexture("boss", 94, 94);

  g.clear();
  g.fillStyle(PAPER, 1);
  g.fillRoundedRect(2, 3, 13, 6, 2);
  g.lineStyle(3, INK, 1);
  g.strokeRoundedRect(2, 3, 13, 6, 2);
  g.fillStyle(YELLOW, 1);
  g.fillCircle(15, 6, 3);
  g.generateTexture("bullet", 20, 12);

  g.clear();
  g.fillStyle(ACID, 1);
  g.fillCircle(8, 8, 5);
  g.lineStyle(3, INK, 1);
  g.strokeCircle(8, 8, 5);
  g.generateTexture("enemy-bullet", 16, 16);

  g.clear();
  polygon(g, [10, 1, 18, 7, 16, 17, 7, 20, 1, 12, 3, 4], BLUE, 3);
  g.fillStyle(PAPER, 1);
  g.fillCircle(10, 10, 3);
  g.generateTexture("scrap", 20, 21);

  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillCircle(5, 5, 4);
  g.generateTexture("dust", 10, 10);

  g.destroy();
}
