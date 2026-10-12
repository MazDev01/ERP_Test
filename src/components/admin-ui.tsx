"use client";

/*
 * ชิ้นส่วนที่หน้าตั้งค่าของผู้ดูแลระบบใช้ร่วมกัน — หัวหน้า การ์ด แถบบันทึก สวิตช์
 *
 * หน้าตั้งค่าทุกหน้าทำงานแบบเดียวกัน: แก้ในร่าง → กดบันทึกทีเดียว → ลงประวัติการตั้งค่า
 * ไม่บันทึกทุกครั้งที่พิมพ์ เพราะค่าพวกนี้มีผลกับทุกคนทันที พิมพ์ครึ่งทางแล้วหลุดไปใช้จะวุ่น
 */

import { useState } from "react";
import { ChevronDownIcon } from "./icons";
import { saveSection, useSystemSettings, DEFAULT_SETTINGS, type SystemSettings } from "@/lib/system-settings";
import { logChange, type LogArea } from "@/lib/admin-log";
import { ConfirmDialog } from "./confirm-dialog";

export function AdminHead({ title, desc, children }: { title: string; desc: string; children?: React.ReactNode }) {
  /* หน้าย่อยของตั้งค่าระบบไม่มีหัวข้อหน้า — ชื่อหน้าอยู่ที่เมนูย่อยด้านซ้ายแล้ว เหลือแค่ปุ่มเครื่องมือ (ผู้ใช้สั่ง 5 ต.ค. 2569)
     title/desc ยังรับไว้เป็นชื่อให้โปรแกรมอ่านหน้าจอ */
  if (!children) return <h1 className="sr-only">{title}</h1>;
  return (
    <div className="flex items-center justify-end gap-2.5" title={desc}>
      <h1 className="sr-only">{title}</h1>
      {children}
    </div>
  );
}

export function Card({
  title,
  note,
  head,
  children,
  aside,
}: {
  title: string;
  note?: string;
  /** บรรทัดอธิบายแบบมีองค์ประกอบเอง (เช่นชิปบอกว่ารายการนี้ไปโผล่หน้าไหน) */
  head?: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="glass rounded-[18px] px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold">{title}</h2>
          {note && <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{note}</p>}
        </div>
        {aside}
      </div>
      {/* บรรทัดอธิบายอยู่นอกแถวหัวข้อ ปุ่มด้านขวาจะได้ไม่ถูกดันตกบรรทัด */}
      {head}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** ช่องกรอกพร้อมป้าย — ตัวเล็กกว่า Field ของฟอร์มงาน เพราะหน้าตั้งค่ามีหลายช่องเรียงกัน */
export function Input2({
  label,
  hint,
  error,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  /* คำอธิบายอยู่นอก label — ไม่งั้นโปรแกรมอ่านหน้าจอจะอ่านคำอธิบายรวมเป็นชื่อช่อง */
  return (
    <div className={className}>
      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">{label}</span>
        {children}
      </label>
      {error ? (
        <span className="mt-1 block text-[12px] text-destructive">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[11.5px] text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

export function Switch({
  on,
  onToggle,
  label,
  disabled,
  title,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      title={title}
      onClick={onToggle}
      className={`relative h-[25px] w-11 shrink-0 rounded-[14px] transition-colors disabled:opacity-40 ${
        on ? "bg-primary" : "bg-[#dde2e9]"
      }`}
    >
      <span
        className={`absolute top-[3px] left-[3px] size-[19px] rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-[19px]" : ""
        }`}
      />
    </button>
  );
}

/**
 * ร่างของการตั้งค่าหนึ่งหมวด — แก้ในร่าง กดบันทึกค่อยเขียนจริงและลงประวัติ
 * describe บอกเป็นภาษาคนว่าเปลี่ยนอะไร (คืน [] ถ้าไม่มีอะไรเปลี่ยน)
 */
/*
 * รายการหมวดแบบพับได้ (เจ้าของสั่ง 28 ก.ย. 2569 ให้เป็นดรอปดาวน์แบบกดกางทีละกลุ่ม)
 * กลุ่มที่มีรายการที่เลือกอยู่จะกางไว้ให้เอง · กลุ่มอื่นพับไว้ รายการยาวจึงไม่ล้นจอ
 */
export function AccordionNav({
  groups,
  value,
  onSelect,
  label,
}: {
  groups: { key: string; label: string; items: { key: string; label: string; count: number }[] }[];
  value: string;
  onSelect: (key: string) => void;
  label: string;
}) {
  const owner = groups.find((g) => g.items.some((i) => i.key === value))?.key ?? groups[0]?.key ?? "";
  /* เริ่มต้นกางกลุ่มของรายการที่เลือกอยู่ — จากนั้นผู้ใช้กดพับ/กางได้ทุกกลุ่ม รวมกลุ่มนี้ด้วย */
  const [open, setOpen] = useState<string[]>([owner]);
  const isOpen = (k: string) => open.includes(k);

  return (
    <nav className="glass overflow-hidden rounded-[16px]" aria-label={label}>
      {groups.map((g, i) => (
        <div key={g.key} className={i ? "border-t border-border" : ""}>
          <button
            type="button"
            aria-expanded={isOpen(g.key)}
            onClick={() => setOpen((v) => (v.includes(g.key) ? v.filter((x) => x !== g.key) : [...v, g.key]))}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12.5px] font-bold tracking-[.02em] text-foreground hover:bg-muted/60"
          >
            <span className="min-w-0 flex-1 truncate">{g.label}</span>
            <span className="num text-[11.5px] font-medium text-muted-foreground">{g.items.length}</span>
            <ChevronDownIcon
              className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen(g.key) ? "rotate-180" : ""}`}
              strokeWidth={2.2}
            />
          </button>
          {isOpen(g.key) && (
            <ul className="pb-1.5">
              {g.items.map((it) => {
                const on = it.key === value;
                return (
                  <li key={it.key}>
                    <button
                      type="button"
                      aria-current={on}
                      onClick={() => onSelect(it.key)}
                      className={`flex w-full items-center gap-2 py-2 pr-3 pl-6 text-left text-[13px] transition-colors ${
                        on ? "bg-primary font-semibold text-white" : "hover:bg-muted"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{it.label}</span>
                      <span className={`num text-[11.5px] ${on ? "text-white/80" : "text-muted-foreground"}`}>
                        {it.count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );
}

export function useSectionDraft<K extends keyof SystemSettings>(
  key: K,
  area: LogArea,
  describe: (before: SystemSettings[K], after: SystemSettings[K]) => string[],
) {
  const saved = useSystemSettings()[key];
  const [draft, setDraft] = useState<SystemSettings[K]>(saved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const isDefault = JSON.stringify(saved) === JSON.stringify(DEFAULT_SETTINGS[key]);

  function save() {
    const changes = describe(saved, draft);
    saveSection(key, draft);
    logChange(area, changes.length ? changes.join(" · ") : "บันทึกโดยไม่มีค่าที่เปลี่ยน");
  }

  function toDefault() {
    const changes = describe(saved, DEFAULT_SETTINGS[key]);
    saveSection(key, DEFAULT_SETTINGS[key]);
    setDraft(DEFAULT_SETTINGS[key]);
    logChange(area, `คืนค่าตั้งต้น${changes.length ? ` · ${changes.join(" · ")}` : ""}`);
  }

  return { saved, draft, setDraft, dirty, isDefault, save, cancel: () => setDraft(saved), toDefault };
}

/** แถบบันทึกท้ายหน้า — ติดขอบล่างตอนมีร่างที่ยังไม่บันทึก */
export function SaveBar({
  dirty,
  isDefault,
  invalid,
  onSave,
  onCancel,
  onDefault,
  note = "",
}: {
  dirty: boolean;
  isDefault: boolean;
  invalid?: string;
  onSave: () => void;
  onCancel: () => void;
  onDefault: () => void;
  note?: string;
}) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <div
        /* ติดขอบล่างเฉพาะตอนมีร่างค้าง — ไม่งั้นบนมือถือแถบนี้จะบังเนื้อหาตลอดเวลา */
        /* มือถือ: ข้อความเต็มแถว ปุ่มสามปุ่มแบ่งเท่ากันแถวล่าง สูงพอให้นิ้วกด */
        className={`glass flex flex-wrap items-center gap-2.5 rounded-[16px] px-4 py-3 max-sm:gap-2 max-sm:px-3 max-sm:[&>.btn]:!h-11 max-sm:[&>.btn]:flex-1 max-sm:[&>.btn]:justify-center ${
          dirty
            ? "sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 ring-2 ring-primary/30 max-sm:bottom-[calc(var(--botbar)+10px)] md:bottom-4"
            : ""
        }`}
      >
        <span
          className={`mr-auto text-[12.5px] max-sm:w-full ${invalid ? "text-destructive" : "text-muted-foreground"}`}
        >
          {invalid || (dirty ? (note ? `มีการแก้ไขที่ยังไม่บันทึก · ${note}` : "มีการแก้ไขที่ยังไม่บันทึก") : "บันทึกแล้ว")}
        </span>
        <button
          type="button"
          className="btn glass-thin btn-mini"
          disabled={isDefault && !dirty}
          onClick={() => setAsking(true)}
        >
          คืนค่าตั้งต้น
        </button>
        <button type="button" className="btn glass-thin" disabled={!dirty} onClick={onCancel}>
          ยกเลิก
        </button>
        <button
          type="button"
          className="btn solid btn-solid disabled:opacity-45"
          disabled={!dirty || Boolean(invalid)}
          onClick={onSave}
        >
          บันทึก
        </button>
      </div>
      <ConfirmDialog
        open={asking}
        title="คืนค่าตั้งต้น"
        description="ค่าในหมวดนี้จะกลับเป็นค่าตั้งต้นของระบบ และมีผลกับทุกบทบาททันที"
        confirmLabel="คืนค่าตั้งต้น"
        tone="destructive"
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          onDefault();
          setAsking(false);
        }}
      />
    </>
  );
}

export const inputCls = "field-control h-10 w-full text-[14px]";
