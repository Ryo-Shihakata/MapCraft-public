import { describe, expect, it } from "vitest";
import { clampPngPxPerMeter, PNG_MAX_EDGE_PX } from "./exportPng.js";

describe("clampPngPxPerMeter", () => {
  const bbox = { minX: -500, minY: -300, maxX: 500, maxY: 300 }; // w=1000, h=600

  it("上限内なら倍率どおりの pxPerMeter を返す", () => {
    expect(clampPngPxPerMeter(bbox, 1, 1)).toBe(1);
    expect(clampPngPxPerMeter(bbox, 1, 4)).toBe(4);
  });

  it("長辺が 8192px を超える場合はクランプする", () => {
    const result = clampPngPxPerMeter(bbox, 10, 4); // 10*4=40 px/m -> 長辺1000m*40=40000px
    const maxEdgeWorld = 1000; // w が長辺
    expect(result).toBeCloseTo(PNG_MAX_EDGE_PX / maxEdgeWorld);
    expect(result * maxEdgeWorld).toBeLessThanOrEqual(PNG_MAX_EDGE_PX + 1e-6);
  });
});
