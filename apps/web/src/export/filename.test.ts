import { describe, expect, it } from "vitest";
import { buildExportFilename, sanitizeFilename } from "./filename.js";

describe("sanitizeFilename", () => {
  it("禁則文字を _ に置換する", () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe("a_b_c_d_e_f_g_h_i_j");
  });

  it("前後の空白・末尾のドットを除去する", () => {
    expect(sanitizeFilename("  my map...  ")).toBe("my map");
  });

  it("空文字は既定名 map になる", () => {
    expect(sanitizeFilename("")).toBe("map");
    expect(sanitizeFilename("...")).toBe("map");
  });

  it("日本語名はそのまま通す", () => {
    expect(sanitizeFilename("架空地図")).toBe("架空地図");
  });
});

describe("buildExportFilename", () => {
  it("マップ名 + 拡張子を結合する", () => {
    expect(buildExportFilename("架空地図", "png")).toBe("架空地図.png");
    expect(buildExportFilename("a/b", "svg")).toBe("a_b.svg");
  });
});
