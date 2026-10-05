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

import { useState } from "react";
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
import { AdminHead, Input2, SaveBar, inputCls, useSectionDraft } from "./admin-ui";
import { PencilIcon, PlusIcon, TrashIcon } from "./icons";
import { Sheet } from "./lead-dialogs";
import { DateField } from "./thai-date-picker";

type NumKey = Exclude<keyof RateSettings, "lateMode" | "latePerMinute" | "lateFreeMinutes" | "leaveYearStart" | "vacationCarryMax">;
type Field = { key: NumKey; label: string; unit: string; hint: string; min: number; max: number; step: number };

const TAX: Field[] = [
  { key: "vat", label: "ภาษีมูลค่าเพิ่ม", unit: "%", hint: "ใช้กับผู้ออกเอกสารที่จด VAT", min: 0, max: 30, step: 0.5 },
  { key: "wht", label: "ภาษีหัก ณ ที่จ่าย", unit: "%", hint: "งานรับจ้างทำของปกติ 3%", min: 0, max: 15, step: 0.5 },
];
const PAY: Field[] = [
  { key: "commission", label: "ค่าคอมมิชชั่นฝ่ายขาย", unit: "% ของมูลค่าดีล", hint: "ใช้ในใบเบิกของพนักงานขาย", min: 0, max: 50, step: 0.5 },
  { key: "otAfterWork", label: "โอทีวันทำงาน", unit: "เท่า", hint: "ของค่าจ้างรายชั่วโมง", min: 1, max: 5, step: 0.5 },
  { key: "otHoliday", label: "โอทีเสาร์-อาทิตย์", unit: "เท่า", hint: "ของค่าจ้างรายชั่วโมง", min: 1, max: 5, step: 0.5 },
  { key: "otPublic", label: "โอทีวันหยุดบริษัท", unit: "เท่า", hint: "วันที่อยู่ในรายการวันหยุดบริษัท (/admin/holidays)", min: 1, max: 5, step: 0.5 },
  /* เจ้าของแจ้ง 25 ก.ย. 2569 — โอทีเสาร์-อาทิตย์ต้องขอตั้งแต่วันศุกร์ */
  { key: "otAheadDays", label: "ยื่นโอทีวันหยุดล่วงหน้า", unit: "วันทำงาน", hint: "เสาร์-อาทิตย์และวันหยุดบริษัทต้องยื่นก่อนถึงวัน · 0 = ยื่นวันไหนก็ได้", min: 0, max: 5, step: 1 },
  { key: "socialSecurity", label: "ประกันสังคม", unit: "% ของเงินเดือน", hint: "ไม่เกินเพดานของปีนั้น", min: 0, max: 10, step: 0.5 },
  { key: "probationMonths", label: "ระยะทดลองงาน", unit: "เดือน", hint: "นับจากวันเริ่มงาน ถอยหนึ่งวัน", min: 1, max: 4, step: 1 },
  /* ค่าน้ำมันในใบเบิกคิดจากอัตรานี้ (Full Proposal · M5) — เดิมเป็นค่าคงที่ในโค้ด */
  { key: "fuelPerKm", label: "ค่าน้ำมันต่อกิโลเมตร", unit: "บาท/กม.", hint: "ใช้คิดยอดในใบเบิกค่าน้ำมัน", min: 0, max: 50, step: 0.5 },
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

export function AdminRatesPage() {
  const saved = useSystemSettings();
  const today = todayIso();
  /* เพดานประกันสังคมเก็บเป็นช่วงปี บันทึกล่วงหน้าได้ (Full Proposal · M5) */
  const ss = useSectionDraft("ssCeiling", "อัตราและภาษี", describeSs);
  /* กล่องแก้ค่าทีละตัว (ต้นแบบ HR-14) · ประวัติที่กางอยู่ */
  const [editing, setEditing] = useState<Field | null>(null);
  const [openHist, setOpenHist] = useState<string[]>([]);

  const rates = ratesOn(today, saved);
  const fields = [...TAX, ...PAY];
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
        title="การคำนวณเงินเดือน"
        desc="ค่าที่ใช้คำนวณเงินเดือนและค่าจ้างรายวัน · ค่าใหม่มีวันเริ่มใช้ ค่าเดิมเก็บเป็นประวัติ"
      />

      <section className="glass overflow-hidden rounded-[18px]">
        <div className="border-b border-border px-4 py-3.5 sm:px-5">
          <h2 className="text-[14.5px] font-bold">ค่าที่ใช้คำนวณ</h2>
        </div>
        {fields.map((f) => {
          const open = openHist.includes(f.key);
          const next = nextSet && nextSet.rates[f.key] !== rates[f.key] ? nextSet : null;
          return (
            <div key={f.key} className="grid gap-2 border-b border-border px-4 py-3.5 last:border-b-0 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] sm:items-center sm:px-5">
              <div className="min-w-0">
                <b className="text-[13.5px] font-semibold">{f.label}</b>
                <small className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">{f.hint}</small>
              </div>
              <div className="num text-[19px] font-bold">
                {rates[f.key]}
                <small className="ml-1 text-[12px] font-medium text-muted-foreground">{f.unit}</small>
                <em className="mt-0.5 block text-[11.5px] font-medium text-muted-foreground not-italic">
                  เริ่มใช้ {startedAt(f.key)}
                </em>
                {next && (
                  <em className="block text-[11.5px] font-semibold text-[var(--warning)] not-italic">
                    ล่วงหน้า: {next.rates[f.key]} {f.unit} ตั้งแต่ {thaiDate(next.at)}
                  </em>
                )}
              </div>
              <div className="flex gap-2 sm:justify-end">
                <button
                  type="button"
                  className="btn glass-thin btn-mini"
                  aria-expanded={open}
                  onClick={() => setOpenHist((v) => (open ? v.filter((x) => x !== f.key) : [...v, f.key]))}
                >
                  ประวัติ
                </button>
                <button type="button" className="btn glass-thin btn-mini" onClick={() => setEditing(f)}>
                  <PencilIcon className="size-4" strokeWidth={2.2} />
                  แก้ไข
                </button>
              </div>

              {open && (
                <div className="rounded-[11px] border border-border bg-card px-3 py-2.5 text-[12.5px] sm:col-span-3">
                  {history.length === 0 ? (
                    <span className="text-muted-foreground">ยังไม่เคยเปลี่ยนค่านี้ — ใช้ค่าตั้งต้นของระบบ</span>
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
      </section>

      <section className="glass overflow-hidden rounded-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="text-[14.5px] font-bold">เพดานเงินเดือนประกันสังคม</h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">บันทึกล่วงหน้าเป็นช่วงปี พ.ศ. ได้</p>
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

      {/* ตัวอย่างการคำนวณตามต้นแบบ HR-14 — เห็นผลของค่าที่ตั้งไว้ทันที */}
      <section className="glass rounded-[18px] px-4 py-4 sm:px-5">
        <h2 className="text-[14.5px] font-bold">ตัวอย่างการคำนวณ (เงินเดือน 30,000 บาท)</h2>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <ExampleBox label="อัตรารายชั่วโมง = เงินเดือน ÷ 30 ÷ 8" value={`${round2(hourly)} บาท`} />
          <ExampleBox label={`โอทีวันทำงาน (× ${rates.otAfterWork})`} value={`${round2(hourly * rates.otAfterWork)} บาท/ชม.`} />
          <ExampleBox label={`โอทีวันหยุด (× ${rates.otHoliday})`} value={`${round2(hourly * rates.otHoliday)} บาท/ชม.`} />
          <ExampleBox
            label={`ประกันสังคมที่หัก (เพดาน ${capNow ? capNow.ceiling.toLocaleString() : "—"})`}
            value={`${round2((Math.min(sal, capNow?.ceiling ?? sal) * rates.socialSecurity) / 100)} บาท`}
          />
        </div>
      </section>

      <p className="rounded-[14px] border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-4 py-3 text-[13px] leading-relaxed text-[var(--warning)]">
        ระบบยังไม่ได้เก็บอัตราไว้กับเอกสารแต่ละใบ — ใบเสนอราคาและใบแจ้งหนี้ที่เปิดดูหลังจากนี้คิดด้วยอัตราที่ใช้อยู่วันนี้
        รวมเอกสารเก่า · เงินเดือนของรอบที่ปิดไปแล้วเก็บตัวเลขไว้ ไม่คิดใหม่
      </p>

      <SaveBar
        dirty={ss.dirty}
        isDefault={history.length === 0 && ss.isDefault}
        invalid={badSs}
        onSave={() => ss.save()}
        onCancel={() => ss.cancel()}
        onDefault={() => {
          saveRatesFrom(today, DEFAULT_SETTINGS.rates, "คืนค่าตั้งต้น");
          logChange("อัตราและภาษี", `คืนค่าตั้งต้น · มีผล ${thaiDate(today)}`);
          ss.toDefault();
        }}
      />

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
          hint={at > todayIso() ? "ตั้งล่วงหน้า ระบบสลับให้เองเมื่อถึงวัน" : "มีผลตั้งแต่วันที่เลือกเป็นต้นไป"}
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
