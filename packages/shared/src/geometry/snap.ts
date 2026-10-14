import type { Point } from "../types.js";
import { distance } from "./coords.js";

// ─── グリッド・スナップ（v1 coords.ts から移植） ──────────────────────────────

// 70 screen px 基準の NICE 間隔（world m）
const NICE_INTERVALS = [
  1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000,
  500000,
];

export function gridInterval(vtS: number): number {
  const worldPerPixel = 70 / vtS;
  return (
    NICE_INTERVALS.find((n) => n >= worldPerPixel) ?? NICE_INTERVALS[NICE_INTERVALS.length - 1]!
  );
}

export function snapToGrid(p: Point, interval: number): Point {
  return {
    x: Math.round(p.x / interval) * interval,
    y: Math.round(p.y / interval) * interval,
  };
}

export function snapAngle(from: Point, to: Point, stepDeg: number): Point {
  const d = distance(from, to);
  if (d < 1) return to;
  const raw = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  const snapped = Math.round(raw / stepDeg) * stepDeg;
  const rad = (snapped * Math.PI) / 180;
  return { x: from.x + d * Math.cos(rad), y: from.y + d * Math.sin(rad) };
}
