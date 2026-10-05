"use client";

import { useState } from "react";
import { initials } from "@/lib/format";
import { CUSTOMER_STATUS, type ChangeLog } from "@/lib/crm-data";
import { SearchIcon } from "./icons";

/* ชิ้นส่วนที่ทุกหน้างานขายใช้ร่วมกัน — แถบค้นหา แท็บ ตัวแบ่งหน้า ชื่อลูกค้า */

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="search glass-thin w-full sm:w-[260px]">
      <SearchIcon className="size-[15px] shrink-0" strokeWidth={2} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}

export function TabStrip<K extends string>({
  tabs,
  value,
  counts,
  onChange,
}: {
  tabs: { key: K; label: string }[];
  value: K;
  counts: Record<string, number>;
  onChange: (k: K) => void;
}) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          className={value === t.key ? "on" : ""}
          onClick={() => onChange(t.key)}
        >
          {t.label} <b>{counts[t.key] ?? 0}</b>
        </button>
      ))}
    </div>
  );
}

export function Pager({
  page,
  maxPage,
  onChange,
}: {
  page: number;
  maxPage: number;
  onChange: (p: number) => void;
}) {
  return (
    <div className="pages justify-center sm:justify-start">
      <button
        type="button"
        className="glass-thin"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        aria-label="ก่อนหน้า"
      >
        ‹
      </button>
      {Array.from({ length: maxPage }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className={`glass-thin ${n === page ? "on" : ""}`}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        className="glass-thin"
        disabled={page === maxPage}
        onClick={() => onChange(page + 1)}
        aria-label="ถัดไป"
      >
        ›
      </button>
    </div>
  );
}

export function Who({ name, sub }: { name: string; sub?: string }) {
  return (
    <div className="who">
      <span className="av">{initials(name)}</span>
      <b className="clip">
        {name}
        {sub && <span className="clip">{sub}</span>}
      </b>
    </div>
  );
}

/** แบ่งหน้าให้รายการ พร้อมกันหน้าเกินตอนตัวกรองทำให้รายการหด */
export function usePaged<T>(items: T[], perPage: number) {
  const [page, setPage] = useState(1);
  const maxPage = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.min(page, maxPage);
  const from = (safePage - 1) * perPage;
  return {
    page: safePage,
    maxPage,
    from,
    list: items.slice(from, from + perPage),
    setPage,
    /** ข้อความ "แสดง 1–7 จาก 12 รายการ" */
    range(unit: string) {
      if (!items.length) return `แสดง 0 ${unit}`;
      return `แสดง ${from + 1}–${from + Math.min(perPage, items.length - from)} จาก ${items.length} ${unit}`;
    },
  };
}

/**
 * ช่อง "จาก → เป็น" ของประวัติการเปลี่ยนแปลง
 * เปลี่ยนสถานะขึ้นเป็นป้ายสี ส่วนรับช่วงดูแลเป็นชื่อคน จึงขึ้นเป็นข้อความธรรมดา
 */
export function ChangeFromTo({ log }: { log: ChangeLog }) {
  if (log.kind === "owner") {
    return (
      <>
        <span className="text-sm">{log.from}</span>
        <span className="muted mx-1.5">→</span>
        <span className="text-sm font-medium">{log.to}</span>
      </>
    );
  }
  return (
    <>
      <span className={`tag ${CUSTOMER_STATUS[log.from]}`}>
        <i />
        {log.from}
      </span>
      <span className="muted mx-1.5">→</span>
      <span className={`tag ${CUSTOMER_STATUS[log.to]}`}>
        <i />
        {log.to}
      </span>
    </>
  );
}
