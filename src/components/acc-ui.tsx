"use client";

/*
 * ตัวเลื่อนเดือนของหน้าฝั่งบัญชี — งานบัญชีปิดเป็นเดือน จึงต้องย้อนดูเดือนก่อนได้
 * เลื่อนไปเดือนอนาคตไม่ได้ เพราะยังไม่มีเอกสารให้ดู
 */

import { useState } from "react";
import { unseenDeals, useAcc } from "@/lib/acc-store";
import { TH_MONTHS_FULL, bkkNow } from "@/lib/format";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "./icons";
import { DateField } from "./thai-date-picker";

export function MonthNav({
  view,
  onChange,
}: {
  view: Date;
  onChange: (next: Date) => void;
}) {
  const now = bkkNow();
  const atNow =
    view.getFullYear() > now.getFullYear() ||
    (view.getFullYear() === now.getFullYear() && view.getMonth() >= now.getMonth());

  function shift(step: number) {
    onChange(new Date(view.getFullYear(), view.getMonth() + step, 1));
  }

  return (
    <div className="mo glass-thin w-full justify-center sm:w-auto">
      <button type="button" onClick={() => shift(-1)} aria-label="เดือนก่อนหน้า">
        <ChevronLeftIcon className="size-[15px]" strokeWidth={2.4} />
      </button>
      <span>
        {TH_MONTHS_FULL[view.getMonth()]} {view.getFullYear() + 543}
      </span>
      <button
        type="button"
        onClick={() => shift(1)}
        disabled={atNow}
        aria-label="เดือนถัดไป"
      >
        <ChevronRightIcon className="size-[15px]" strokeWidth={2.4} />
      </button>
    </div>
  );
}

// ─── ตัวกรองของหน้าวางบิลและหน้าใบเสร็จ ────────────────────────────
/*
 * ค้นหาเลขที่เอกสารหรือลูกค้า + ช่วงวันที่ ตามต้นแบบ billing.html / receipts.html (.rc-filters)
 * วันที่ที่ใช้เทียบขึ้นกับแท็บ หน้าจอเป็นคนเลือกเองว่าจะเอาวันไหนมาเทียบ
 */
export type AccFilter = { q: string; from: string; to: string };

/*
 * ค้นหาด้วยยอดเงิน (ผู้ใช้สั่ง 13 ต.ค. 2569) — พิมพ์ "88400" "88,400" "88,400.00" "฿88,400" ได้ผลเดียวกัน
 * ตัดจุลภาค/ช่องว่าง/฿/บาท และ .00 ท้าย · ไม่ใช่ตัวเลขคืน null · ตรงแบบขึ้นต้นด้วยตัวเลขที่พิมพ์ก็นับ
 */
export function amountQuery(q: string): string | null {
  const s = q.replace(/[\s,฿]/g, "").replace(/บาท$/, "").replace(/\.0*$/, "");
  return /^\d+(\.\d{1,2})?$/.test(s) ? s : null;
}

export function amountHit(aq: string, amounts: number[]) {
  return amounts.some((n) => {
    if (!Number.isFinite(n)) return false;
    const fixed = Math.abs(n).toFixed(2);
    const plain = fixed.endsWith(".00") ? fixed.slice(0, -3) : fixed;
    return aq.includes(".") ? fixed.startsWith(aq) : plain.startsWith(aq);
  });
}

export function useAccFilter(initialQuery = "") {
  const [f, setF] = useState<AccFilter>({ q: initialQuery, from: "", to: "" });
  const q = f.q.trim().toLowerCase();
  const aq = amountQuery(q);
  const hit = (...fields: string[]) => !q || fields.join(" ").toLowerCase().includes(q);
  return {
    f,
    setF,
    active: Boolean(q || f.from || f.to),
    /** คำค้นตรงกับข้อความใดข้อความหนึ่งไหม */
    hit,
    /** คำค้นตรงกับข้อความ หรือยอดเงินใดยอดหนึ่ง (ผู้ใช้สั่ง 13 ต.ค. 2569) */
    match: (fields: string[], amounts: number[] = []) =>
      !q || hit(...fields) || (aq !== null && amountHit(aq, amounts)),
    /** วันที่อยู่ในช่วงไหม — รายการที่ไม่มีวันที่แสดงเฉพาะตอนยังไม่ได้เลือกช่วง */
    inRange: (iso: string) => {
      if (!iso) return !f.from && !f.to;
      if (f.from && iso < f.from) return false;
      if (f.to && iso > f.to) return false;
      return true;
    },
    clear: () => setF({ q: "", from: "", to: "" }),
  };
}

export function AccFilters({
  filter,
  search = true,
}: {
  filter: ReturnType<typeof useAccFilter>;
  /** false = ช่องค้นหาย้ายไปหัวหน้าแล้ว เหลือแต่ช่วงวันที่ (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  search?: boolean;
}) {
  const { f, setF, active, clear } = filter;
  return (
    <div className="flex w-full flex-wrap items-center gap-2.5 py-2 lg:ml-auto lg:w-auto">
      {/* มือถือ: ช่องค้นหาเต็มแถว วันที่สองช่องแบ่งครึ่งแถวถัดไป สูงพอให้นิ้วกด */}
      {search && (
      <div className="search min-w-[160px] flex-1 max-sm:h-10! max-sm:basis-full lg:w-[250px] lg:flex-none">
        <SearchIcon className="size-[15px] shrink-0" strokeWidth={2} />
        <input
          type="search"
          value={f.q}
          onChange={(e) => setF((x) => ({ ...x, q: e.target.value }))}
          placeholder="ค้นหาเลขที่เอกสารหรือลูกค้า"
          aria-label="ค้นหาเลขที่เอกสารหรือลูกค้า"
        />
      </div>
      )}
      <div className="w-[calc(50%-5px)] sm:w-[160px]">
        <DateField
          value={f.from}
          onChange={(iso) => setF((x) => ({ ...x, from: iso }))}
          label="ตั้งแต่วันที่"
          placeholder="ตั้งแต่วันที่"
          clearable
          className="h-9 rounded-[10px] text-[13.5px]"
        />
      </div>
      <div className="w-[calc(50%-5px)] sm:w-[160px]">
        <DateField
          value={f.to}
          onChange={(iso) => setF((x) => ({ ...x, to: iso }))}
          label="ถึงวันที่"
          placeholder="ถึงวันที่"
          clearable
          className="h-9 rounded-[10px] text-[13.5px]"
        />
      </div>
      {active && (
        <button type="button" className="lnk px-2 text-[13px] font-semibold" onClick={clear}>
          ล้างตัวกรอง
        </button>
      )}
    </div>
  );
}

// ─── จุดแดงดีลใหม่ (AC-BR-01) ────────────────────────────────────
/** จุดแดงบนเมนู "วางบิล" ที่แถบข้าง — มีดีลใหม่ที่ฝ่ายบัญชียังไม่ได้เปิดแท็บรอวางบิลดู */
export function BillingNavDot() {
  const acc = useAcc();
  if (!unseenDeals(acc).length) return null;
  /* เมนูที่เปิดอยู่พื้นเป็นสีแบรนด์ จุดจึงเปลี่ยนเป็นสีขาว */
  return <NewDot label="มีดีลใหม่รอวางบิล" className="ml-auto [.on_&]:bg-white" />;
}

export function NewDot({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-block size-[9px] flex-none rounded-full bg-primary shadow-[0_0_0_2px_#fff] ${className}`}
    />
  );
}
