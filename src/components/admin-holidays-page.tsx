"use client";

/*
 * วันหยุดบริษัท — ใช้ร่วมกันทั้งการนับวันลา อัตราโอทีวันหยุด และแถบวันหยุดในตารางงาน (holidays.ts)
 * ค่าตั้งต้นคือวันหยุดราชการ ปี 2569 — วันตามจันทรคติและวันชดเชยต้องเทียบประกาศ ครม. ทุกปี
 *
 * หน้าตาเป็นปฏิทินรายเดือนแบบหน้าตารางงาน (ผู้ใช้สั่ง 18 ก.ย. 2569 — "เน้นใช้ง่าย")
 * กดวันในปฏิทิน → ป๊อปอัพให้ตั้งชื่อ / แก้ชื่อ / เอาออก (ผู้ใช้สั่งเปลี่ยนจากแผงข้างเป็นป๊อปอัพ)
 * ยังเป็นร่างจนกว่าจะกดบันทึกที่แถบล่าง เหมือนหน้าตั้งค่าอื่น
 */

import { useRef, useState } from "react";
import { thaiDate, todayIso } from "@/lib/format";
import { AdminHead, Input2, SaveBar, inputCls, useSectionDraft } from "./admin-ui";
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";
import { lockedUntil, useHr } from "@/lib/hr-store";
import { DateField } from "./thai-date-picker";
import { Sheet } from "./lead-dialogs";

const DW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const pad = (n: number) => (n < 10 ? "0" : "") + n;
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function describe(a: Record<string, string>, b: Record<string, string>) {
  const out: string[] = [];
  for (const d of Object.keys(b).sort()) {
    if (!(d in a)) out.push(`เพิ่ม ${thaiDate(d)} ${b[d]}`);
    else if (a[d] !== b[d]) out.push(`แก้ ${thaiDate(d)} เป็น ${b[d]}`);
  }
  for (const d of Object.keys(a).sort()) if (!(d in b)) out.push(`ลบ ${thaiDate(d)} ${a[d]}`);
  return out;
}

export function AdminHolidaysPage() {
  const d = useSectionDraft("holidays", "วันหยุดบริษัท", describe);
  const hr = useHr();
  const today = todayIso();
  /* ปีที่กำลังดู — ต้นแบบดูทีละปี ไม่ใช่ทีละเดือน */
  const thisYear = Number(today.slice(0, 4));
  const [sel, setSel] = useState(today);
  const [name, setName] = useState(() => d.draft[today] ?? "");
  /* กดวันในปฏิทิน → ป๊อปอัพตั้งชื่อวันหยุด (ผู้ใช้สั่ง 18 ก.ย. 2569) */
  const [popup, setPopup] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  /* รายการทั้งปี (แบบหน้าเก่า) — ปีที่มีวันหยุด + ปีที่กำลังดูในปฏิทิน */
  /* มีปีถัดไปให้เลือกเสมอ ไม่งั้นตั้งวันหยุดปีหน้าล่วงหน้าไม่ได้ เพราะปีที่ยังว่างจะไม่ขึ้นในรายการ */
  const [listYear, setListYear] = useState<number | null>(null);
  const ly = listYear ?? thisYear;
  const setYear = (n: number) => setListYear(n);
  /* วันที่คัดลอกมาจากปีก่อน ยังไม่ได้ตรวจ — ต้นแบบขึ้นป้าย "ตรวจวันที่" จนกว่าจะกดยืนยัน */
  const [copied, setCopied] = useState<string[]>([]);
  /* วันหยุดที่ตกในรอบเงินเดือนที่ปิดแล้ว แก้หรือลบไม่ได้ (ต้นแบบ HR-13) */
  const cutoff = lockedUntil(hr);
  const isLocked = (iso: string) => Boolean(cutoff && iso <= cutoff);
  const yearList = Object.entries(d.draft)
    .filter(([x]) => x.startsWith(String(ly)))
    .sort(([a], [b]) => a.localeCompare(b));
  /* ปุ่มเพิ่มวันหยุดเริ่มที่วันนี้ถ้าอยู่ในปีที่ดูอยู่ ไม่งั้นเริ่มวันที่ 1 ม.ค. ของปีนั้น */
  const addFirst = today.startsWith(String(ly)) ? today : isoOf(ly, 0, 1);

  /*
   * คัดลอกวันหยุดจากปีก่อน (Full Proposal · M5) — วันหยุดราชการส่วนใหญ่ตรงวันเดิมทุกปี
   * คัดลอกมาทั้งชุดแล้วค่อยแก้วันตามจันทรคติกับวันชดเชย เร็วกว่ากดทีละวันสิบกว่าครั้ง
   * ไม่ทับวันที่ปีนี้ใส่ไว้แล้ว และ 29 ก.พ. ที่ไม่มีในปีนี้จะถูกข้าม
   */
  const prevYear = ly - 1;
  const prevHols = Object.entries(d.draft).filter(([x]) => x.startsWith(String(prevYear)));
  const copyable = prevHols.filter(([x]) => {
    const iso = `${ly}${x.slice(4)}`;
    if (d.draft[iso]) return false;
    const dt = new Date(`${iso}T00:00:00`);
    return !Number.isNaN(dt.getTime()) && iso === isoOf(dt.getFullYear(), dt.getMonth(), dt.getDate());
  });
  function copyFromLastYear() {
    if (!copyable.length) return;
    const add: Record<string, string> = {};
    for (const [x, name] of copyable) add[`${ly}${x.slice(4)}`] = name;
    /* ข้ามวันที่อยู่ในรอบที่ปิดแล้ว — แก้ไม่ได้อยู่ดี */
    for (const iso of Object.keys(add)) if (isLocked(iso)) delete add[iso];
    d.setDraft({ ...d.draft, ...add });
    setCopied(Object.keys(add));
  }
  const selHoliday = d.draft[sel];
  const selDow = new Date(`${sel}T00:00:00`).getDay();

  function pick(day: string) {
    setSel(day);
    setName(d.draft[day] ?? "");
    setPopup(true);
    /* เปิดแล้วพิมพ์ชื่อต่อได้เลย ไม่ต้องคลิกช่องชื่ออีกครั้ง */
    requestAnimationFrame(() => nameRef.current?.focus({ preventScroll: true }));
  }

  function save() {
    if (!name.trim()) return;
    d.setDraft({ ...d.draft, [sel]: name.trim() });
    setPopup(false);
  }

  /** เอาวันหยุดออกจากร่าง — รอบที่ปิดแล้วแก้ไม่ได้ */
  function removeDay(day: string) {
    if (isLocked(day)) return;
    const next = { ...d.draft };
    delete next[day];
    d.setDraft(next);
    setCopied((v) => v.filter((x) => x !== day));
  }

  function remove() {
    removeDay(sel);
    setPopup(false);
  }

  return (
    <div className="space-y-4">
      <AdminHead
        title="วันหยุดบริษัท"
        desc="วันหยุดประจำปีของบริษัท — ใบลาไม่หักวันนี้ โอทีวันนี้คิดอัตราวันหยุด และขึ้นเป็นวันหยุดในตารางงาน"
      >
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn glass-thin btn-mini" aria-label="ปีก่อนหน้า" onClick={() => setYear(ly - 1)}>
            <ChevronLeftIcon className="size-4" strokeWidth={2.4} />
          </button>
          <b className="num min-w-[130px] text-center text-[14.5px]">ปี พ.ศ. {ly + 543}</b>
          <button type="button" className="btn glass-thin btn-mini" aria-label="ปีถัดไป" onClick={() => setYear(ly + 1)}>
            <ChevronRightIcon className="size-4" strokeWidth={2.4} />
          </button>
        </div>
        <button
          type="button"
          className="btn glass-thin disabled:opacity-45"
          disabled={copyable.length === 0}
          title={
            copyable.length
              ? `คัดลอก ${copyable.length} วันจากปี ${prevYear + 543}`
              : `ปี ${prevYear + 543} ไม่มีวันหยุดที่ยังคัดลอกมาได้`
          }
          onClick={copyFromLastYear}
        >
          คัดลอกจากปี {prevYear + 543}
        </button>
        <button type="button" className="btn solid btn-solid" onClick={() => pick(addFirst)}>
          <PlusIcon className="size-4" strokeWidth={2.4} />
          เพิ่มวันหยุด
        </button>
      </AdminHead>

      <section className="glass overflow-hidden rounded-[18px]">
        <div className="border-b border-border px-4 py-3.5 sm:px-5">
          <h2 className="text-[14.5px] font-bold">ปฏิทินปี พ.ศ. {ly + 543}</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">กดวันที่เพื่อเพิ่มหรือแก้ไขวันหยุด</p>
        </div>

        <div className="grid gap-3.5 px-4 py-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-3 xl:grid-cols-4">
          {MONTHS.map((mn, mi) => {
            const firstDow = new Date(ly, mi, 1).getDay();
            const nDays = new Date(ly, mi + 1, 0).getDate();
            return (
              <div key={mn} className="rounded-[12px] border border-border bg-card p-2.5">
                <h3 className="mb-1.5 text-[12.5px] font-bold">{mn}</h3>
                <div className="grid grid-cols-7 gap-px">
                  {DW.map((w) => (
                    <span key={w} className="py-0.5 text-center text-[9.5px] text-muted-foreground">
                      {w}
                    </span>
                  ))}
                  {Array.from({ length: firstDow }, (_, i) => (
                    <span key={`b${i}`} />
                  ))}
                  {Array.from({ length: nDays }, (_, i) => {
                    const iso = isoOf(ly, mi, i + 1);
                    const hol = d.draft[iso];
                    const dow = new Date(ly, mi, i + 1).getDay();
                    const lock = isLocked(iso);
                    const isCopied = copied.includes(iso);
                    return (
                      <button
                        key={iso}
                        type="button"
                        title={hol ? `${hol}${lock ? " · อยู่ในรอบที่ปิดแล้ว" : ""}` : `เพิ่มวันหยุดวันที่ ${thaiDate(iso)}`}
                        aria-label={`${thaiDate(iso)}${hol ? ` วันหยุด ${hol}` : ""}`}
                        onClick={() => pick(iso)}
                        className={`num h-6 rounded-[6px] text-[11px] transition-colors ${
                          hol
                            ? lock
                              ? "bg-[#5A0A14] font-bold text-white ring-1 ring-white/35 ring-inset"
                              : isCopied
                                ? "bg-[var(--warning)] font-bold text-white"
                                : "bg-primary font-bold text-white"
                            : dow === 0 || dow === 6
                              ? "text-muted-foreground hover:bg-muted"
                              : "hover:bg-muted"
                        } ${iso === today ? "outline outline-[1.5px] outline-primary -outline-offset-[1.5px]" : ""}`}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3.5 border-t border-border px-4 pt-3 pb-3.5 text-[11.5px] text-muted-foreground sm:px-5">
          <span>
            <i className="mr-1.5 inline-block size-[11px] rounded-[3px] bg-primary align-[-1px]" />
            วันหยุดบริษัท
          </span>
          <span>
            <i className="mr-1.5 inline-block size-[11px] rounded-[3px] bg-[#5A0A14] align-[-1px] ring-1 ring-white/35 ring-inset" />
            อยู่ในรอบที่ปิดแล้ว (แก้ไม่ได้)
          </span>
          <span>
            <i className="mr-1.5 inline-block size-[11px] rounded-[3px] bg-[var(--warning)] align-[-1px]" />
            คัดลอกมา รอตรวจวันที่
          </span>
          <span>
            <i className="mr-1.5 inline-block size-[11px] rounded-[3px] outline outline-[1.5px] outline-primary align-[-1px]" />
            วันนี้
          </span>
        </div>
      </section>

      <section className="glass overflow-hidden rounded-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <h2 className="text-[14.5px] font-bold">
            รายการวันหยุด <span className="text-[12.5px] font-medium text-muted-foreground">{yearList.length} วัน</span>
          </h2>
          {copied.length > 0 && (
            <button type="button" className="btn glass-thin" onClick={() => setCopied([])}>
              ยืนยันว่าวันที่ที่คัดลอกมาถูกต้องทั้งหมด
            </button>
          )}
        </div>

        {yearList.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            ปี พ.ศ. {ly + 543} ยังไม่มีวันหยุด กดเพิ่มวันหยุด หรือคัดลอกจากปีก่อน
          </p>
        ) : (
          <div className="grid gap-x-6 px-4 py-2 sm:px-5 lg:grid-cols-2 xl:grid-cols-3">
            {yearList.map(([iso, label]) => {
              const dt = new Date(`${iso}T00:00:00`);
              const lock = isLocked(iso);
              return (
                <div key={iso} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-border py-2.5">
                  <span className="num text-[13px] font-bold">
                    {dt.getDate()} {MONTHS[dt.getMonth()].slice(0, 3)}
                    <small className="block text-[11px] font-medium text-muted-foreground">วัน{DW[dt.getDay()]}</small>
                  </span>
                  <span className="min-w-0 text-[13.5px]">
                    {label}
                    {copied.includes(iso) && (
                      <em
                        className="ml-1.5 rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--warning)] not-italic"
                        title="คัดลอกมาจากปีก่อน ตรวจวันที่ให้ตรงกับปฏิทินปีนี้"
                      >
                        ตรวจวันที่
                      </em>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {lock ? (
                      <span className="text-[11.5px] text-muted-foreground" title="อยู่ในรอบที่ปิดแล้ว แก้หรือลบไม่ได้">
                        รอบปิดแล้ว
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          aria-label={`แก้ไข ${label}`}
                          className="btn glass-thin btn-mini"
                          onClick={() => pick(iso)}
                        >
                          <PencilIcon className="size-4" strokeWidth={2.2} />
                        </button>
                        <button
                          type="button"
                          aria-label={`ลบวันหยุด ${thaiDate(iso)}`}
                          className="btn glass-thin btn-mini"
                          onClick={() => removeDay(iso)}
                        >
                          <TrashIcon className="size-4" strokeWidth={2.2} />
                        </button>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {popup && (
        <Sheet
          title={`${["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"][selDow]} ${thaiDate(sel)}`}
          narrow
          onClose={() => setPopup(false)}
          footer={
            <>
              {selHoliday && (
                <button type="button" className="btn glass-thin mr-auto text-destructive" onClick={remove}>
                  <TrashIcon className="size-4" strokeWidth={1.9} />
                  เอาออก
                </button>
              )}
              <button type="button" className="btn glass-thin" onClick={() => setPopup(false)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn solid btn-solid"
                disabled={!name.trim() || name.trim() === selHoliday}
                onClick={save}
              >
                {!selHoliday && <PlusIcon className="size-4" strokeWidth={2.4} />}
                {selHoliday ? "บันทึกชื่อ" : "ตั้งเป็นวันหยุด"}
              </button>
            </>
          }
        >
          <p className="mb-3.5 text-[12.5px] text-muted-foreground">
            {selHoliday ? "เป็นวันหยุดอยู่แล้ว" : selDow === 0 || selDow === 6 ? "ตรงกับวันเสาร์-อาทิตย์" : "วันทำงาน"}
          </p>
          <div className="grid gap-3.5 sm:grid-cols-[200px_minmax(0,1fr)]">
            <Input2 label="วันที่">
              <DateField value={sel} onChange={(day) => day && pick(day)} label="วันที่ของวันหยุด" />
            </Input2>
            <Input2 label="ชื่อวันหยุด">
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder="เช่น วันหยุดชดเชย · วันหยุดพิเศษบริษัท"
                className={inputCls}
              />
            </Input2>
          </div>
        </Sheet>
      )}

      <SaveBar
        dirty={d.dirty}
        isDefault={d.isDefault}
        invalid={Object.values(d.draft).some((x) => !x.trim()) ? "ชื่อวันหยุดต้องไม่ว่าง" : ""}
        onSave={d.save}
        onCancel={d.cancel}
        onDefault={d.toDefault}
      />
    </div>
  );
}
