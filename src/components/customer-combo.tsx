"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Customer } from "@/lib/crm-data";
import { initials } from "@/lib/format";
import { CloseIcon } from "./icons";

/** แสดงผลลัพธ์สูงสุดกี่รายการก่อนบอกให้พิมพ์เพิ่ม */
const LIMIT = 6;

/**
 * ช่องเลือกลูกค้าแบบพิมพ์ค้นหา — ใช้ทั้งหน้าคำขอก่อนการขายและใบเสนอราคา
 * บังคับให้ "เลือกจากรายการ" เท่านั้น กันการพิมพ์ชื่อมั่วแล้วผูกกับลูกค้าผิดคน
 */
export function CustomerCombo({
  customers,
  value,
  onChange,
  invalid,
  disabled,
  nameOnly,
  taxFlag,
}: {
  customers: Customer[];
  value: Customer | null;
  onChange: (c: Customer | null) => void;
  invalid?: boolean;
  /** ล็อกไว้ เช่น ตอนแก้ใบเสนอราคาเดิมที่เปลี่ยนลูกค้าไม่ได้ */
  disabled?: boolean;
  /** เลือกแล้วแสดงแค่ชื่อ (ต้นแบบ quotation-new) — ปกติแสดง "ชื่อ (รหัส)" ตามต้นแบบ presales-new */
  nameOnly?: boolean;
  /** ป้าย "ไม่มีเลขภาษี" ท้ายแถว — ต้นแบบมีเฉพาะหน้าใบเสนอราคา */
  taxFlag?: boolean;
}) {
  const label = (c: Customer) => (nameOnly ? c.name : `${c.name} (${c.code})`);
  const [text, setText] = useState(value ? label(value) : "");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const { shown, total } = useMemo(() => {
    const q = text.trim().toLowerCase();
    const all = !q
      ? customers
      : customers.filter((c) =>
          `${c.name} ${c.contact} ${c.phone} ${c.code}`.toLowerCase().includes(q),
        );
    return { shown: all.slice(0, LIMIT), total: all.length };
  }, [customers, text]);

  function pick(c: Customer) {
    onChange(c);
    setText(label(c));
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setText("");
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <div
        className={`field-control field-shell ${
          invalid ? "border-destructive bg-[var(--destructive-soft)]" : ""
        }`}
      >
        <input
          value={text}
          role="combobox"
          aria-label="ค้นหาลูกค้า"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="พิมพ์ชื่อ ผู้ติดต่อ เบอร์โทร หรือรหัส"
          onChange={(e) => {
            setText(e.target.value);
            if (value) onChange(null);
            setOpen(e.target.value.trim().length > 0);
            setCursor(-1);
          }}
          disabled={disabled}
          onFocus={() => {
            if (!value && text.trim()) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (!open) setOpen(true);
              if (!shown.length) return;
              setCursor((c) =>
                e.key === "ArrowDown"
                  ? (c + 1) % shown.length
                  : (c - 1 + shown.length) % shown.length,
              );
            } else if (e.key === "Enter" && open && shown.length) {
              e.preventDefault();
              pick(shown[cursor > -1 ? cursor : 0]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {(value || text) && !disabled && (
          <button
            type="button"
            onClick={clear}
            aria-label="ล้างที่เลือก"
            className="-mr-1.5 shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-foreground"
          >
            <CloseIcon className="size-3.5" strokeWidth={2.4} />
          </button>
        )}
      </div>

      {open && !disabled && (
        <div
          id={listId}
          role="listbox"
          aria-label="รายชื่อลูกค้า"
          className="glass-solid absolute top-[calc(100%+6px)] right-0 left-0 z-90 rounded-[13px] p-1.5"
        >
          {shown.length === 0 ? (
            <p className="px-3 py-4 text-center text-[13px] text-muted-foreground">
              ไม่พบผู้สนใจที่ตรงกับคำค้น
            </p>
          ) : (
            <>
              <div className="scroll-stable max-h-[228px] overflow-auto">
                {shown.map((c, i) => (
                  <button
                    key={c.code}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(c);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-[9px] px-[11px] py-2.5 text-left transition-colors ${
                      i === cursor ? "bg-accent" : "hover:bg-accent/60"
                    }`}
                  >
                    <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-accent text-[11.5px] font-semibold text-primary">
                      {initials(c.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="clip block text-[13.5px] font-medium">{c.name}</b>
                      <span className="clip block text-[11.5px] text-muted-foreground">
                        {[c.contact, c.phone, c.code].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {taxFlag && !c.taxId && (
                      <span className="shrink-0 rounded-xl bg-[var(--warning-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--warning)]">
                        ไม่มีเลขภาษี
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="mt-1 border-t border-border px-3 pt-2 text-[11.5px] text-muted-foreground">
                {total > shown.length
                  ? `แสดง ${shown.length} จาก ${total} รายการที่ตรง — พิมพ์เพิ่มเพื่อค้นให้แคบลง`
                  : `ตรงทั้งหมด ${total} รายการ`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
