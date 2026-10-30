"use client";

/*
 * อัตราและภาษี — VAT หัก ณ ที่จ่าย ค่าคอมมิชชั่น อัตราโอที ประกันสังคม
 * (การหักเงินมาสายอยู่ที่หน้าเวลาทำงาน — ผู้ใช้สั่งให้ตั้งคู่กับเวลาผ่อนผันสาย)
 *
 * ค่าใหม่มีวันเริ่มใช้ ค่าเดิมเก็บเป็นประวัติ (Full Proposal · M5)
 * ตั้งวันในอนาคตได้ ระบบสลับให้เองเมื่อถึงวัน (ratesOn ใน system-settings)
 *
 * ข้อจำกัดที่ต้องบอกผู้ดูแลตรง ๆ: ระบบยังไม่ได้เก็บอัตราไว้ในเอกสารแต่ละใบ
 * ยอดของใบเสนอราคาและใบแจ้งหนี้จึงคิดด้วยอัตราที่ใช้อยู่วันนี้ ไม่ใช่อัตรา ณ วันออกเอกสาร
 * เมื่อต่อ backend ต้องบันทึกอัตรา ณ วันที่ออกเอกสารไว้กับเอกสาร
 */

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { createPersistedStore } from "@/lib/persisted-store";
import {
  DEFAULT_SETTINGS,
  ratesOn,
  saveRatesFrom,
  useSystemSettings,
  type RateSettings,
  type SsCeiling,
} from "@/lib/system-settings";
import { logChange } from "@/lib/admin-log";
import { thaiDate, todayIso } from "@/lib/format";
import { AdminHead, IconBtn, Input2, SaveBar, inputCls, thCls, trCls, useSectionDraft } from "./admin-ui";
import { PencilIcon, PlusIcon, TrashIcon } from "./icons";
import { Sheet } from "./lead-dialogs";
import { DateField } from "./thai-date-picker";
import { PayAndLate, usePayAndLate } from "./admin-attendance-page";

type NumKey = Exclude<keyof RateSettings, "lateMode" | "latePerMinute" | "lateFreeMinutes" | "leaveYearStart" | "vacationCarryMax">;
type Field = { key: NumKey; label: string; unit: string; hint: string; min: number; max: number; step: number };

const TAX: Field[] = [
  { key: "vat", label: "ภาษีมูลค่าเพิ่ม", unit: "%", hint: "ใช้กับผู้ออกเอกสารที่จด VAT", min: 0, max: 30, step: 0.5 },
  { key: "wht", label: "ภาษีหัก ณ ที่จ่าย", unit: "%", hint: "งานรับจ้างทำของปกติ 3%", min: 0, max: 15, step: 0.5 },
];
const PAY: Field[] = [
  { key: "commission", label: "ค่าคอมมิชชั่นฝ่ายขาย", unit: "% ของมูลค่าดีล", hint: "ใช้ในใบเบิกของพนักงานขาย", min: 0, max: 50, step: 0.5 },
  { key: "otAfterWork", label: "โอทีวันทำงาน", unit: "เท่า", hint: "ของค่าจ้างรายชั่วโมง", min: 1, max: 5, step: 0.5 },
  { key: "otHoliday", label: "โอทีวันหยุด", unit: "เท่า", hint: "เสาร์-อาทิตย์ และวันหยุดบริษัทที่ไม่ใช่วันแรงงาน", min: 1, max: 5, step: 0.5 },
  { key: "otPublic", label: "โอทีวันแรงงาน", unit: "เท่า", hint: "วันแรงงาน 1 พ.ค. เท่านั้น (ผู้ใช้สั่ง 13 ต.ค. 2569)", min: 1, max: 5, step: 0.5 },
  /* เจ้าของแจ้ง 25 ก.ย. 2569 — โอทีเสาร์-อาทิตย์ต้องขอตั้งแต่วันศุกร์ */
  { key: "otAheadDays", label: "ยื่นโอทีวันหยุดล่วงหน้า", unit: "วันทำงาน", hint: "เสาร์-อาทิตย์และวันหยุดบริษัทต้องยื่นก่อนถึงวัน · 0 = ยื่นวันไหนก็ได้", min: 0, max: 5, step: 1 },
  { key: "socialSecurity", label: "ประกันสังคม", unit: "% ของเงินเดือน", hint: "ไม่เกินเพดานของปีนั้น", min: 0, max: 10, step: 0.5 },
  { key: "probationMonths", label: "ระยะทดลองงาน", unit: "เดือน", hint: "นับจากวันเริ่มงาน ถอยหนึ่งวัน", min: 1, max: 4, step: 1 },
  /* ค่าน้ำมันในใบเบิกคิดจากอัตรานี้ (Full Proposal · M5) — เดิมเป็นค่าคงที่ในโค้ด */
  /* รถยนต์กับมอเตอร์ไซค์คิดคนละอัตรา (ผู้ใช้สั่ง 29 ต.ค. 2569) */
  { key: "fuelPerKm", label: "ค่าน้ำมันรถยนต์ต่อกิโลเมตร", unit: "บาท/กม.", hint: "ใช้คิดยอดในใบเบิกค่าน้ำมันรถยนต์", min: 0, max: 50, step: 0.5 },
  { key: "fuelMotoPerKm", label: "ค่าน้ำมันมอเตอร์ไซค์ต่อกิโลเมตร", unit: "บาท/กม.", hint: "ใช้คิดยอดในใบเบิกค่าน้ำมันมอเตอร์ไซค์", min: 0, max: 50, step: 0.5 },
  /* ใช้กติกาเดียวกันทุกคน ระบบหักเอง (ผู้ใช้สั่ง 30 ต.ค. 2569) */
  { key: "guaranteePerMonth", label: "เงินประกันผลงานต่อเดือน", unit: "บาท", hint: "หักตั้งแต่รอบแรกที่จ่ายรายเดือน", min: 0, max: 100000, step: 100 },
  { key: "guaranteeCap", label: "เพดานเงินประกันผลงาน", unit: "บาท", hint: "ยอดสะสมถึงเท่านี้แล้วหยุดหัก", min: 0, max: 1000000, step: 100 },
];
function describeSs(a: SsCeiling[], b: SsCeiling[]) {
  const out: string[] = [];
  for (const x of b) {
    const old = a.find((y) => y.from === x.from);
    if (!old) out.push(`เพิ่มช่วงปี ${x.from}–${x.to} เพดาน ${x.ceiling}`);
    else if (old.to !== x.to || old.ceiling !== x.ceiling || old.max !== x.max)
      out.push(`ช่วงปี ${x.from}: เพดาน ${old.ceiling} → ${x.ceiling} · สมทบสูงสุด ${old.max} → ${x.max}`);
  }
  for (const y of a) if (!b.some((x) => x.from === y.from)) out.push(`ลบช่วงปี ${y.from}–${y.to}`);
  return out;
}

/**
 * taxOnly = หน้า "ภาษี" — ภาษีมูลค่าเพิ่มกับหัก ณ ที่จ่ายใช้ในใบเสนอราคา ไม่ใช่เงินเดือน (ผู้ใช้สั่ง 6 ต.ค. 2569)
 * ไม่ส่ง = หน้าการคำนวณเงินเดือน (โอที ประกันสังคม ฯลฯ)
 */
/**
 * ภาษีรายการอื่นที่ฝ่ายบุคคลเพิ่มเอง (ผู้ใช้สั่ง 6 ต.ค. 2569) — ยังไม่ได้ผูกกับเอกสาร ใช้เก็บอัตราไว้ก่อน
 * TODO: ต่อ backend แล้วย้ายไปตาราง tax_rate และให้ใบเสนอราคาเลือกใช้ได้
 */
type ExtraTax = { id: string; label: string; rate: number; hint: string };
const extraTaxStore = createPersistedStore<ExtraTax[]>("maz-erp.extra-taxes.v1", [], (v): v is ExtraTax[] => Array.isArray(v));
/* รายการค่าที่ใช้คำนวณเงินเดือนที่ HR เพิ่มเอง (ผู้ใช้สั่ง 13 ต.ค. 2569) */
const extraPayStore = createPersistedStore<ExtraTax[]>("maz-erp.extra-pay.v1", [], (v): v is ExtraTax[] => Array.isArray(v));
function useExtraPay() {
  return useSyncExternalStore(extraPayStore.subscribe, extraPayStore.get, extraPayStore.getServer);
}
function useExtraTaxes() {
  return useSyncExternalStore(extraTaxStore.subscribe, extraTaxStore.get, extraTaxStore.getServer);
}

/* คอลัมน์ตาราง # | ชื่อ | ค่า | ปุ่ม — มือถือซ่อน # */
const RATE_COLS = "grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_40px] sm:grid-cols-[28px_minmax(0,1.4fr)_minmax(0,1fr)_40px]";

/* top = การ์ดที่ขึ้นบนสุดใต้หัวหน้า (รอบเงินเดือน เริ่มนับโอที การหักมาสาย) (ผู้ใช้สั่ง 13 ต.ค. 2569) */
export function AdminRatesPage({ taxOnly = false, payLate = false }: { taxOnly?: boolean; payLate?: boolean } = {}) {
  const pl = usePayAndLate();
  const extraTax = useExtraTaxes();
  const extraPay = useExtraPay();
  const extras = taxOnly ? extraTax : extraPay;
  /** กล่องเพิ่ม/แก้ภาษีรายการอื่น — "new" = เพิ่มใหม่ */
  const [taxEdit, setTaxEdit] = useState<ExtraTax | "new" | null>(null);
  const saved = useSystemSettings();
  const today = todayIso();
  /* เพดานประกันสังคมเก็บเป็นช่วงปี บันทึกล่วงหน้าได้ (Full Proposal · M5) */
  const ss = useSectionDraft("ssCeiling", "อัตราและภาษี", describeSs);
  /* กล่องแก้ค่าทีละตัว (ต้นแบบ HR-14) · ประวัติที่กางอยู่ */
  const [editing, setEditing] = useState<Field | null>(null);
  const [openHist, setOpenHist] = useState<string[]>([]);

  const rates = ratesOn(today, saved);
  const fields = taxOnly ? TAX : PAY;
  const history = [...saved.rateHistory].sort((a, b) => b.at.localeCompare(a.at));
  /* ค่าที่ตั้งไว้ล่วงหน้า — ชุดแรกที่วันเริ่มใช้ยังไม่ถึง */
  const nextSet = [...saved.rateHistory].sort((a, b) => a.at.localeCompare(b.at)).find((h) => h.at > today);

  const ssList = [...ss.draft].sort((a, b) => a.from - b.from);
  const setSs = (i: number, patch: Partial<SsCeiling>) =>
    ss.setDraft(ssList.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const badSs = ssList.some((c) => c.to < c.from || c.ceiling <= 0 || c.max <= 0)
    ? "ช่วงปีและจำนวนเงินของเพดานประกันสังคมไม่ถูกต้อง"
    : "";

  /* ค่านี้เริ่มใช้เมื่อไร — ชุดล่าสุดที่มีผลแล้ว ไม่มีประวัติคือค่าตั้งต้นของระบบ */
  const startedAt = (key: NumKey) => {
    const hit = [...saved.rateHistory]
      .filter((h) => h.at <= today && h.rates[key] === rates[key])
      .sort((a, b) => a.at.localeCompare(b.at))
      .pop();
    return hit ? thaiDate(hit.at) : "ค่าตั้งต้นของระบบ";
  };

  function saveOne(f: Field, value: number, at: string) {
    saveRatesFrom(at, { ...ratesOn(at, saved), [f.key]: value }, `${f.label} ${rates[f.key]} → ${value} ${f.unit}`);
    logChange("อัตราและภาษี", `${f.label} = ${value} ${f.unit} · มีผล ${thaiDate(at)}`);
    setEditing(null);
  }

  const sal = 30000;
  const hourly = sal / 30 / 8;
  const capNow = ssList.filter((c) => c.from <= new Date().getFullYear() + 543).pop() ?? ssList[0];

  return (
    <div className="space-y-4">
      <AdminHead
        title={taxOnly ? "ภาษี" : "การคำนวณเงินเดือน"}
        desc={taxOnly ? "อัตราภาษีที่ใช้ในใบเสนอราคาและเอกสาร" : "ค่าที่ใช้คำนวณเงินเดือนและค่าจ้างรายวัน"}
        /* ไม่มีปุ่มเพิ่มรายการ — รายการที่เพิ่มเองไม่มีส่วนไหนเอาไปคำนวณ แก้ได้แค่ค่าของรายการที่มีอยู่ (ผู้ใช้สั่ง 30 ต.ค. 2569) */
      />

      {payLate && <PayAndLate pl={pl} />}

      {/* ตารางแบบเดียวกับตารางตัวเลือกในรายการ: # | ชื่อ | ค่า | ดินสอ (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
      <section className="glass overflow-hidden rounded-[18px]">
        <div className="px-4 pt-3.5 pb-4 sm:px-5">
          <div className={`grid ${RATE_COLS} ${thCls}`}>
            <span className="text-center max-sm:hidden">#</span>
            <span>ชื่อ</span>
            <span>ค่า</span>
            <span />
          </div>
          {fields.map((f, i) => {
            const open = openHist.includes(f.key);
            const next = nextSet && nextSet.rates[f.key] !== rates[f.key] ? nextSet : null;
            return (
              <div key={f.key} className={`grid ${RATE_COLS} ${trCls}`}>
                <span className="num text-center text-[12px] text-muted-foreground max-sm:hidden">{i + 1}</span>
                <b className="min-w-0 truncate text-[13.5px] font-semibold">{f.label}</b>
                <span className="num min-w-0 text-[13px]">
                  {rates[f.key]}
                  <small className="ml-1 text-[12px] text-muted-foreground">{f.unit}</small>
                  {next && (
                    <em className="block text-[11.5px] font-semibold text-[var(--warning)] not-italic">
                      ล่วงหน้า: {next.rates[f.key]} {f.unit} ตั้งแต่ {thaiDate(next.at)}
                    </em>
                  )}
                </span>
                <span className="flex justify-end">
                  {/* ไม่มีปุ่มประวัติ — ดูที่เมนูประวัติการตั้งค่า (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
                  <IconBtn label={`แก้ไข ${f.label}`} title="แก้ไข" onClick={() => setEditing(f)}>
                    <PencilIcon className="size-3.5" strokeWidth={1.9} />
                  </IconBtn>
                </span>

                {open && (
                  <div className="col-span-full rounded-[11px] border border-border bg-card px-3 py-2.5 text-[12.5px]">
                    {history.length === 0 ? (
                      <span className="text-muted-foreground">ยังไม่เคยเปลี่ยนค่านี้</span>
                    ) : (
                      <ul className="grid gap-1.5">
                        {history.map((h) => (
                          <li key={h.at} className="flex flex-wrap items-center gap-2.5">
                            <span className="min-w-[130px] text-muted-foreground">ตั้งแต่ {thaiDate(h.at)}</span>
                            <b className="num font-semibold">
                              {h.rates[f.key]} {f.unit}
                            </b>
                            {h.at <= today && h === history.find((x) => x.at <= today) && (
                              <em className="rounded-full bg-[#E7F5EE] px-2 py-0.5 text-[11px] font-bold text-[#14875A] not-italic">
                                ใช้อยู่
                              </em>
                            )}
                            {h.at > today && (
                              <em className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--warning)] not-italic">
                                ล่วงหน้า
                              </em>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {/* ไม่แสดงคำอธิบายของรายการที่เพิ่มเอง (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
          {extras.map((t, k) => (
            <div key={t.id} className={`grid ${RATE_COLS} ${trCls}`}>
              <span className="num text-center text-[12px] text-muted-foreground max-sm:hidden">{fields.length + k + 1}</span>
              <b className="min-w-0 truncate text-[13.5px] font-semibold">{t.label}</b>
              <span className="num min-w-0 text-[13px]">
                {t.rate}
                <small className="ml-1 text-[12px] text-muted-foreground">{taxOnly ? "%" : ""}</small>
              </span>
              <span className="flex justify-end">
                <IconBtn label={`แก้ไข ${t.label}`} title="แก้ไข" onClick={() => setTaxEdit(t)}>
                  <PencilIcon className="size-3.5" strokeWidth={1.9} />
                </IconBtn>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* เพดานประกันสังคมเป็นของเงินเดือน ไม่ขึ้นในหน้าภาษี */}
      {!taxOnly && (
        <>
      <section className="glass overflow-hidden rounded-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="text-[14.5px] font-bold">เพดานเงินเดือนประกันสังคม</h2>
          </div>
          <button
            type="button"
            className="btn solid btn-solid"
            onClick={() => {
              const last = ssList[ssList.length - 1];
              ss.setDraft([
                ...ssList,
                { from: (last?.to ?? 2569) + 1, to: 9999, ceiling: last?.ceiling ?? 17500, max: last?.max ?? 875 },
              ]);
            }}
          >
            <PlusIcon className="size-4" strokeWidth={2.4} />
            เพิ่มช่วงปี
          </button>
        </div>
        <div className="px-4 pt-3 pb-4 sm:px-5">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 border-b border-border pb-2 text-[11.5px] font-bold text-muted-foreground sm:grid-cols-[90px_90px_minmax(0,1fr)_minmax(0,1fr)_44px]">
            <span className="max-sm:hidden">ปีเริ่ม</span>
            <span className="max-sm:hidden">ถึงปี</span>
            <span>เพดานเงินเดือน (บาท)</span>
            <span>หักสูงสุด/เดือน (บาท)</span>
            <span className="max-sm:hidden" />
          </div>
          {ssList.map((c, i) => (
            <div
              key={c.from}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 border-b border-border py-2 last:border-b-0 sm:grid-cols-[90px_90px_minmax(0,1fr)_minmax(0,1fr)_44px]"
            >
              <input
                type="number"
                value={c.from}
                aria-label={`ปีเริ่มของช่วงที่ ${i + 1}`}
                onChange={(e) => setSs(i, { from: Number(e.target.value) })}
                className={`${inputCls} num h-9 text-right max-sm:hidden`}
              />
              <input
                type="number"
                value={c.to}
                aria-label={`ปีสุดท้ายของช่วงที่ ${i + 1}`}
                onChange={(e) => setSs(i, { to: Number(e.target.value) })}
                className={`${inputCls} num h-9 text-right max-sm:hidden`}
              />
              <input
                type="number"
                value={c.ceiling}
                aria-label={`เพดานฐานของช่วงที่ ${i + 1}`}
                onChange={(e) => setSs(i, { ceiling: Number(e.target.value) })}
                className={`${inputCls} num h-9 text-right`}
              />
              <input
                type="number"
                value={c.max}
                aria-label={`เงินสมทบสูงสุดของช่วงที่ ${i + 1}`}
                onChange={(e) => setSs(i, { max: Number(e.target.value) })}
                className={`${inputCls} num h-9 text-right`}
              />
              <button
                type="button"
                aria-label={`ลบช่วงปีที่ ${i + 1}`}
                disabled={ssList.length < 2}
                className="btn glass-thin btn-mini disabled:opacity-40 max-sm:hidden"
                onClick={() => ss.setDraft(ssList.filter((_, k) => k !== i))}
              >
                <TrashIcon className="size-4" strokeWidth={2.2} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ไม่มีตัวอย่างการคำนวณและข้อความอธิบายการทำงานของระบบ (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
      {/* แถบเดียวของทั้งหน้า — รวมการ์ดรอบเงินเดือนด้านบนด้วย (ผู้ใช้สั่ง 30 ต.ค. 2569) */}
      <SaveBar
        dirty={ss.dirty || (payLate && pl.dirty)}
        isDefault={history.length === 0 && ss.isDefault && (!payLate || pl.isDefault)}
        invalid={badSs || (payLate ? pl.bad : "")}
        onSave={() => {
          if (ss.dirty) ss.save();
          if (payLate) pl.save();
        }}
        onCancel={() => {
          ss.cancel();
          if (payLate) pl.cancel();
        }}
        onDefault={() => {
          saveRatesFrom(today, DEFAULT_SETTINGS.rates, "คืนค่าตั้งต้น");
          logChange("อัตราและภาษี", `คืนค่าตั้งต้น · มีผล ${thaiDate(today)}`);
          ss.toDefault();
          if (payLate) pl.toDefault();
        }}
      />

        </>
      )}

      {taxEdit && <TaxSheet pay={!taxOnly} initial={taxEdit === "new" ? undefined : taxEdit} onClose={() => setTaxEdit(null)} />}

      {editing && <RateSheet field={editing} now={rates[editing.key]} onClose={() => setEditing(null)} onSave={saveOne} />}
    </div>
  );
}

function round2(n: number) {
  return (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ExampleBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-border bg-card px-3 py-2.5">
      <small className="block text-[11.5px] text-muted-foreground">{label}</small>
      <b className="num text-[16px] font-bold">{value}</b>
    </div>
  );
}

/** กล่องแก้ค่าทีละตัว พร้อมวันเริ่มใช้ (ต้นแบบ HR-14) */
function RateSheet({
  field,
  now,
  onClose,
  onSave,
}: {
  field: Field;
  now: number;
  onClose: () => void;
  onSave: (f: Field, value: number, at: string) => void;
}) {
  const [value, setValue] = useState(String(now));
  const [at, setAt] = useState(todayIso());
  const n = Number(value);
  const bad =
    value === "" || Number.isNaN(n)
      ? "กรอกค่าเป็นตัวเลข"
      : n < field.min || n > field.max
        ? `ค่าต้องอยู่ระหว่าง ${field.min} ถึง ${field.max} ${field.unit}`
        : "";

  return (
    <Sheet
      title={`แก้ไข${field.label}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid disabled:opacity-45"
            disabled={Boolean(bad)}
            onClick={() => onSave(field, n, at)}
          >
            บันทึก
          </button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="rounded-[11px] border border-border bg-card px-3 py-2.5 text-[12.5px] text-muted-foreground">
          ค่าปัจจุบัน{" "}
          <b className="num font-semibold text-foreground">
            {now} {field.unit}
          </b>
        </p>
        <Input2 label={`ค่าใหม่ (${field.unit})`} error={bad || undefined}>
          <input
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={`${inputCls} num text-right`}
          />
        </Input2>
        <Input2
          label="วันที่เริ่มใช้"
        >
          <DateField
            value={at}
            onChange={setAt}
            label="วันเริ่มใช้อัตรา"
            placeholder="เลือกวันที่"
            className="h-[38px] rounded-[10px] text-[13.5px]"
          />
        </Input2>
      </div>
    </Sheet>
  );
}

/** เพิ่ม/แก้ภาษีรายการอื่น — ชื่อและอัตรา */
function TaxSheet({ initial, onClose, pay = false }: { initial?: ExtraTax; onClose: () => void; pay?: boolean }) {
  const target = pay ? extraPayStore : extraTaxStore;
  const [label, setLabel] = useState(initial?.label ?? "");
  const [rate, setRate] = useState(initial ? String(initial.rate) : "");
  const n = Number(rate);
  const bad = !label.trim() ? "ใส่ชื่อภาษี" : !(rate.trim() && n >= 0 && n <= 100) ? "อัตราต้องอยู่ระหว่าง 0–100%" : "";
  function save() {
    if (bad) return;
    const row: ExtraTax = { id: initial?.id ?? `tax-${Date.now()}`, label: label.trim(), rate: n, hint: initial?.hint ?? "" };
    target.update((list) => (initial ? list.map((x) => (x.id === row.id ? row : x)) : [...list, row]));
    logChange("อัตราและภาษี", `${initial ? "แก้" : "เพิ่ม"}${pay ? "ค่าที่ใช้คำนวณเงินเดือน" : "ภาษี"} ${row.label} = ${row.rate}${pay ? "" : "%"}`);
    onClose();
  }
  return (
    <Sheet
      title={pay ? (initial ? "แก้ไขรายการ" : "เพิ่มรายการ") : initial ? "แก้ไขรายการภาษี" : "เพิ่มรายการภาษี"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid disabled:opacity-45" disabled={Boolean(bad)} title={bad || undefined} onClick={save}>
            บันทึก
          </button>
        </>
      }
    >
      <div className="grid gap-3.5 sm:grid-cols-[minmax(0,1fr)_140px]">
        <Input2 label={pay ? "ชื่อรายการ" : "ชื่อภาษี"}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} placeholder={pay ? "เช่น ค่าเบี้ยขยัน" : "เช่น ภาษีธุรกิจเฉพาะ"} />
        </Input2>
        <Input2 label={pay ? "ค่า" : "อัตรา (%)"}>
          <input value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={`${inputCls} num`} />
        </Input2>
      </div>
      {/* ไม่มีช่องคำอธิบาย (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
    </Sheet>
  );
}
