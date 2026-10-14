// ───────────────────────────────────────────────────────────────────────────────
// 記号ギャラリー生成スクリプト（M1 の目視確認用。実装書 M1-3 からの承認済み逸脱。
// docs/v2-decisions.md 参照。Vite ルート /dev/symbols の配線は M3 で行う）
//
//   node packages/shared/scripts/gen-symbol-gallery.mjs
//
// symbolPaths.ts / catalog.ts を正規表現で読み（TS を直接 import しないため
// Node 単体で動く）、全50記号を名前付きで並べた単一 HTML を
// packages/shared/symbol-gallery.html（gitignore 済み）へ出力する。
// symbolPaths.ts 側は「1エントリ1行・キーは二重引用符」の記述規則を前提とする。
// ───────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sharedDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const symbolSource = readFileSync(join(sharedDir, "src", "symbolPaths.ts"), "utf8");
const catalogSource = readFileSync(join(sharedDir, "src", "catalog.ts"), "utf8");

// ── symbolPaths.ts から { key, d, strokeOnly } を抽出 ──────────────────────────
const symbols = [];
const entryRe = /"([\w-]+)":\s*\{\s*d:\s*"([^"]+)"\s*(?:,\s*strokeOnly:\s*(true))?\s*,?\s*\}/g;
for (const m of symbolSource.matchAll(entryRe)) {
  symbols.push({ key: m[1], d: m[2], strokeOnly: m[3] === "true" });
}
if (symbols.length === 0) {
  console.error("symbolPaths.ts からエントリを抽出できませんでした（記述規則を確認）");
  process.exit(1);
}

// ── catalog.ts から sym → { name, color } / pattern → name を抽出 ──────────────
const names = new Map(); // key -> 表示名
const colors = new Map(); // key -> 記号色
for (const line of catalogSource.split("\n")) {
  const name = line.match(/name:\s*"([^"]+)"/)?.[1];
  if (!name) continue;
  const sym = line.match(/sym:\s*"([^"]+)"/)?.[1];
  if (sym) {
    names.set(sym, name);
    const color = line.match(/color:\s*"([^"]+)"/)?.[1];
    if (color) colors.set(sym, color);
  }
  const pattern = line.match(/pattern:\s*"([^"]+)"/)?.[1];
  if (pattern) names.set(pattern, `${name}（パターン）`);
}

// ── HTML 生成 ──────────────────────────────────────────────────────────────────
const cell = ({ key, d, strokeOnly }) => {
  const color = colors.get(key) ?? "#333333";
  const paint = strokeOnly
    ? `fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`
    : `fill="${color}" fill-rule="evenodd"`;
  const label = names.get(key) ?? key;
  return `    <figure>
      <svg viewBox="0 0 24 24" width="72" height="72" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="24" height="24" fill="#f7f5f0"/>
        <path d="${d}" ${paint}/>
      </svg>
      <figcaption>${label}<br><code>${key}</code></figcaption>
    </figure>`;
};

const syms = symbols.filter((s) => !s.key.startsWith("pat-"));
const pats = symbols.filter((s) => s.key.startsWith("pat-"));

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>MapCraft 記号ギャラリー（M1 目視確認用）</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; background: #fff; color: #222; }
  h1 { font-size: 1.3rem; } h2 { font-size: 1.05rem; margin-top: 2rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 12px; }
  figure { margin: 0; text-align: center; }
  svg { border: 1px solid #ddd; border-radius: 4px; }
  figcaption { font-size: 11px; margin-top: 4px; line-height: 1.5; }
  code { color: #888; font-size: 10px; }
</style>
</head>
<body>
  <h1>MapCraft 記号ギャラリー — ${symbols.length} 記号（sym ${syms.length} + パターングリフ ${pats.length}）</h1>
  <p>生成: <code>node packages/shared/scripts/gen-symbol-gallery.mjs</code>（${new Date().toISOString()}）</p>
  <h2>点記号（catalog の sym）</h2>
  <div class="grid">
${syms.map(cell).join("\n")}
  </div>
  <h2>パターングリフ（§3.4 パターン充填用）</h2>
  <div class="grid">
${pats.map(cell).join("\n")}
  </div>
</body>
</html>
`;

const outPath = join(sharedDir, "symbol-gallery.html");
writeFileSync(outPath, html);
console.log(`生成完了: ${outPath}（${symbols.length} 記号: sym ${syms.length} / pat ${pats.length}）`);
