// 自由配置テキスト（geom:"text"）の計測 bbox キャッシュ（実装書 §M6-2:
// 「計測 bbox を world 換算でキャッシュし hitTest の暫定判定を置き換える」）。
// 実測は Pixi Text の getLocalBounds() を使うため canvas/renderers/text.ts（pixi.js 依存）が
// 書き込み、tools/hitTest.ts（pixi.js 非依存の純関数群）はここを読むだけで済ませる
// （tools/ は pixi.js に依存しない、という M4/M5 の方針を維持するための橋渡し）。
// pt（アンカー）からの半値幅・半値高（world 単位）を保持する。
export interface TextBoundsWorld {
  halfW: number;
  halfH: number;
}

const cache = new Map<string, TextBoundsWorld>();

export function setTextBounds(objectId: string, bounds: TextBoundsWorld): void {
  cache.set(objectId, bounds);
}

export function getTextBounds(objectId: string): TextBoundsWorld | undefined {
  return cache.get(objectId);
}

export function deleteTextBounds(objectId: string): void {
  cache.delete(objectId);
}
