// パターン充填レジストリ（実装書 §3.4）。
// パターンID → Texture（48×48px。SYMBOL_PATHS のパターングリフを中央に1つ、
// 記号色で描画）を lazy 生成しキャッシュする。TilingSprite はスクリーン固定
// （tileScale = 1/vt.s）にするため、呼び出し側（renderArea）が生成時の vtS を渡す。
import { Application, Container, Graphics, GraphicsPath, Rectangle, TilingSprite, type Texture } from "pixi.js";
import { SYMBOL_PATHS } from "@mapcraft/shared";

const TILE_SIZE = 48;
const GLYPH_SIZE = 24;

export class PatternRegistry {
  private readonly cache = new Map<string, Texture>();

  constructor(private readonly app: Application) {}

  private getTexture(patternId: string, color: string) {
    const key = `${patternId}::${color}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const def = SYMBOL_PATHS[patternId];
    if (!def) return null;

    const parent = new Container();
    const shape = new Graphics();
    const path = new GraphicsPath(def.d);
    if (def.strokeOnly) {
      shape.path(path).stroke({ width: 1.6, color, cap: "round", join: "round" });
    } else {
      shape.path(path).fill(color);
    }
    shape.position.set((TILE_SIZE - GLYPH_SIZE) / 2, (TILE_SIZE - GLYPH_SIZE) / 2);
    parent.addChild(shape);

    const texture = this.app.renderer.generateTexture({
      target: parent,
      frame: new Rectangle(0, 0, TILE_SIZE, TILE_SIZE),
    });
    parent.destroy({ children: true });

    this.cache.set(key, texture);
    return texture;
  }

  // width/height/x/y はエリアの world bbox（タイル領域）。tileScale はスクリーン固定のため 1/vtS。
  createTilingSprite(
    patternId: string,
    color: string,
    vtS: number,
    x: number,
    y: number,
    width: number,
    height: number
  ): TilingSprite | null {
    const texture = this.getTexture(patternId, color);
    if (!texture) return null;
    const sprite = new TilingSprite({ texture, width, height });
    sprite.position.set(x, y);
    sprite.tileScale.set(1 / vtS);
    return sprite;
  }

  destroy(): void {
    for (const tex of this.cache.values()) tex.destroy(true);
    this.cache.clear();
  }
}
