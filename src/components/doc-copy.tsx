"use client";

/*
 * พิมพ์ต้นฉบับ / สำเนา (ผู้ใช้สั่ง 15 ต.ค. 2569)
 * ใช้ร่วมกับใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ และใบสัญญา
 *   original = ต้นฉบับ · copy = สำเนา · both = พิมพ์ทั้งชุดสองรอบ (ชุดต้นฉบับ แล้วตามด้วยชุดสำเนา)
 * ทุกแผ่นมีกรอบ "ต้นฉบับ"/"สำเนา" ที่มุมขวาบน · ค่าเริ่มต้นคือต้นฉบับ
 * เปิดด้วย ?copy=original|copy|both ได้ — ปุ่มดาวน์โหลด PDF (?pdf=1) พิมพ์ตามค่านี้
 */

import { useEffect, useState } from "react";

export type CopyKind = "original" | "copy";
export type CopyMode = CopyKind | "both";

export const COPY_LABEL: Record<CopyKind, string> = { original: "ต้นฉบับ", copy: "สำเนา" };

const MODES: { v: CopyMode; label: string }[] = [
  { v: "original", label: "ต้นฉบับ" },
  { v: "copy", label: "สำเนา" },
  { v: "both", label: "ต้นฉบับ + สำเนา" },
];

/** ชุดที่ต้องพิมพ์ตามตัวเลือก — ต้นฉบับมาก่อนเสมอ */
export function copySets(mode: CopyMode): CopyKind[] {
  return mode === "both" ? ["original", "copy"] : [mode];
}

/** ค่าตัวเลือกของหน้านี้ — อ่าน ?copy= ตอนเปิดหน้า (หลัง hydrate เซิร์ฟเวอร์กับเบราว์เซอร์จะได้วาดตรงกัน) */
export function useCopyMode() {
  const [mode, setMode] = useState<CopyMode>("original");
  useEffect(() => {
    const v = new URL(window.location.href).searchParams.get("copy");
    if (v === "copy" || v === "both" || v === "original") setMode(v);
  }, []);
  return [mode, setMode] as const;
}

/** กรอบป้ายมุมขวาบนของแผ่น — แบบใบกำกับภาษีทั่วไป */
export function CopyMark({ kind }: { kind: CopyKind }) {
  return <span className="copy-mark">{COPY_LABEL[kind]}</span>;
}

/** แถวป้ายบนแผ่นที่ไม่มีหัวกระดาษ (แผ่นที่สองเป็นต้นไป) */
export function CopyRow({ kind }: { kind: CopyKind }) {
  return (
    <div className="copy-row flex justify-end">
      <CopyMark kind={kind} />
    </div>
  );
}

/** ตัวเลือก "พิมพ์: ต้นฉบับ | สำเนา | ต้นฉบับ + สำเนา" — อยู่บนแถบเครื่องมือ ไม่พิมพ์ออกไป */
export function CopyPicker({ value, onChange }: { value: CopyMode; onChange: (v: CopyMode) => void }) {
  return (
    <div role="radiogroup" aria-label="พิมพ์" className="no-print flex items-center gap-1.5 text-[12.5px]">
      <span className="text-muted-foreground">พิมพ์:</span>
      <div className="flex overflow-hidden rounded-[10px] border border-border bg-card">
        {MODES.map((m, i) => (
          <button
            key={m.v}
            type="button"
            role="radio"
            aria-checked={value === m.v}
            onClick={() => onChange(m.v)}
            className={`h-8 px-2.5 font-semibold whitespace-nowrap ${i ? "border-l border-border" : ""} ${
              value === m.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-primary"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
