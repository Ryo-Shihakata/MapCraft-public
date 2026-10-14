// resolveRole の link 分岐（decideRoleFromLink）のユニットテスト（§M8-2）。
// D1 に依存しない純関数のみを対象にする（resolveRole 本体の D1 疎通は Playwright で検証）。
import { describe, expect, it } from "vitest";
import { decideRoleFromLink, type MapLinkRow } from "./session.js";

function link(overrides: Partial<MapLinkRow> = {}): MapLinkRow {
  return {
    token: "tok_valid_edit_00000000000000",
    mapId: "map-1",
    role: "edit",
    createdAt: Date.now(),
    revokedAt: null,
    ...overrides,
  };
}

describe("decideRoleFromLink", () => {
  it("有効な edit リンクは role を返す", () => {
    expect(decideRoleFromLink("map-1", link({ role: "edit" }))).toBe("edit");
  });

  it("有効な view リンクは role を返す", () => {
    expect(decideRoleFromLink("map-1", link({ role: "view" }))).toBe("view");
  });

  it("失効済み（revokedAt !== null）は null を返す", () => {
    expect(decideRoleFromLink("map-1", link({ revokedAt: Date.now() }))).toBeNull();
  });

  it("別マップの token（mapId 不一致）は null を返す", () => {
    expect(decideRoleFromLink("map-1", link({ mapId: "map-2" }))).toBeNull();
  });

  it("link 行が無い（token 未発行/存在しない）場合は null を返す", () => {
    expect(decideRoleFromLink("map-1", undefined)).toBeNull();
  });
});
