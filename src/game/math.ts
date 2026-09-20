export function joystickVector(dx: number, dy: number, radius = 43): { x: number; y: number } {
  const length = Math.hypot(dx, dy);
  if (length < 4) return { x: 0, y: 0 };
  const scale = Math.min(1, length / radius) / length;
  return { x: dx * scale, y: dy * scale };
}

export function contractComplete(elapsed: number, duration: number, bossDefeated: boolean): boolean {
  return elapsed >= duration && bossDefeated;
}

export function timeLabel(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
