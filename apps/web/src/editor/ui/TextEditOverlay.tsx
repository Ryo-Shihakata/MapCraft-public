// テキストツールのインライン入力オーバーレイ（実装書 §M6-1）。
// textTool でキャンバスクリック→その場に HTML input をオーバーレイして表示する。
// Enter 確定 / Esc 破棄 / 空文字なら破棄（新規）または変更なし（再編集）。
// 複数行（\n 区切り）の編集は PropertiesPanel の textarea 側の責務とし、この
// インライン入力は単発クリックで素早く名前を付ける用途に絞った単一行 input にする。
// pt は world 座標なので、ビュー操作（pan/zoom）中も worldToScreen で追従する。
import { useEffect, useRef } from "react";
import { worldToScreen } from "@mapcraft/shared";
import type { MapDoc } from "../doc/MapDoc.js";
import { textTool } from "../tools/textTool.js";
import { useUIStore } from "../state/uiStore.js";
import { useViewStore } from "../state/viewStore.js";

interface TextEditOverlayProps {
  mapDoc: MapDoc;
}

export function TextEditOverlay({ mapDoc }: TextEditOverlayProps) {
  const textEdit = useUIStore((s) => s.textEdit);
  const setTextEdit = useUIStore((s) => s.setTextEdit);
  const vt = useViewStore((s) => s.vt);
  const inputRef = useRef<HTMLInputElement>(null);
  // Enter/Esc/blur が短時間に重複発火しても二重確定・二重破棄にならないようにするガード。
  const settledRef = useRef(false);

  useEffect(() => {
    if (!textEdit) return;
    settledRef.current = false;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [textEdit]);

  if (!textEdit) return null;

  const screen = worldToScreen(textEdit.pt.x, textEdit.pt.y, vt);

  const confirm = (value: string): void => {
    if (settledRef.current) return;
    settledRef.current = true;
    if (textEdit.objectId) {
      textTool.commitEdit(mapDoc, textEdit.objectId, value);
    } else {
      textTool.commitNew(mapDoc, textEdit.pt, value);
    }
    setTextEdit(null);
  };

  const cancel = (): void => {
    if (settledRef.current) return;
    settledRef.current = true;
    setTextEdit(null);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={textEdit.text}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          confirm(e.currentTarget.value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => confirm(e.currentTarget.value)}
      className="absolute z-20 min-w-[120px] -translate-x-1/2 -translate-y-1/2 rounded border border-blue-400 bg-white px-1.5 py-0.5 text-sm text-neutral-800 shadow outline-none"
      style={{ left: screen.x, top: screen.y }}
    />
  );
}
