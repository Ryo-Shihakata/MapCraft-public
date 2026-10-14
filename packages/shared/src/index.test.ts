import { describe, expect, it } from "vitest";
import { SHARED_PACKAGE_NAME } from "./index.js";

// M0: Vitest がルートから packages/shared を実行できることを確認するダミーテスト。
// 実体のあるテスト（型・カタログ・ジオメトリ等）は M1 で追加する。
describe("packages/shared placeholder", () => {
  it("exports the package name", () => {
    expect(SHARED_PACKAGE_NAME).toBe("@mapcraft/shared");
  });
});
