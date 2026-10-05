"use client";

/*
 * ข้อมูลพนักงาน — รายการการ์ด แยกกลุ่มตามประเภทพนักงาน (โครงใหม่ 24 ก.ย. 2569)
 *
 * สามกลุ่มพับได้: พนักงานประจำ · ทดลองงาน · ฝึกงาน กลุ่มที่ไม่มีคนไม่ขึ้น
 * การ์ดละคน มีรูป ชื่อ สถานะ ตำแหน่ง แผนก และชิปสรุปที่ HR ถามบ่อย (วันเริ่ม อายุงาน)
 * คนที่อยู่ระหว่างทดลองงานมีวงแหวนบอกว่าผ่าน "ช่วงเวลา" ทดลองงานมาแล้วกี่ส่วน ไม่ใช่คะแนนผลงาน
 * กดที่ไหนก็ได้ในการ์ดเพื่อเปิดประวัติเต็ม
 *
 * เพิ่มพนักงานใหม่จากปุ่มบนแถบหัวเรื่อง คนเข้าใหม่เริ่มที่ "ทดลองงาน" เสมอ ระบบไม่ให้เลือกเป็นอย่างอื่น
 * ผ่านทดลองงานทำจากในกล่องประวัติ และต้องระบุเงินเดือนใหม่เสมอ
 * เพราะช่วงทดลองงานจ่ายค่าจ้างรายวัน ตัวเลขเดิมเป็นฐานของอัตรารายวัน คนละความหมายกับเงินเดือน
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { baht, thaiDate, toIsoDate, todayIso, commaInput } from "@/lib/format";
import {
  hrDepts,
  hrDocs,
  HR_EMPTYPE,
  HR_OT_DIVISOR,
  hrPositions,
  hrDept,
  hrPos,
  holdsPos,
  posOf,
  empYears,
  probColor,
  probDaysLeft,
  probLine,
  probPct,
  type DeptKey,
  type DocKey,
  type EmpStatus,
  type EmpType,
  type Employee,
  type PosKey,
} from "@/lib/hr-data";
import {
  addEmployee,
  changePosition,
  lockedUntil,
  passProbation,
  setEmpLeft,
  updateEmpProfile,
  useHr,
  type HrState,
} from "@/lib/hr-store";
import { optionsOf } from "@/lib/options";
import { useFindParam } from "@/lib/deep-link";
import { USERS } from "@/lib/mock-data";
import { useRole } from "@/lib/role";
import { Sheet } from "./lead-dialogs";
import { EmployeeDetail, EmpPhoto, StatusPill } from "./hr-employee-detail";
import { ThaiDatePicker } from "./thai-date-picker";
import { Field, Input, Select, Textarea } from "./ui";
import { ADD_VALUE, useAddOption } from "./add-option";
import { lockScroll } from "@/lib/scroll-lock";
import "@/styles/mobile/hr-employees.css";

export function HrEmployeesPage() {
  const hr = useHr();
  /* หน้าอื่นในฝ่ายบุคคลลิงก์มาหาคนเดียวด้วย ?find=<ชื่อ> ใช้ช่องค้นหาเดิมเป็นตัวกรอง */
  const find = useFindParam();
  const [query, setQuery] = useState(find);
  const [dept, setDept] = useState<DeptKey | "">("");
  const [pos, setPos] = useState<PosKey | "">("");
  const [status, setStatus] = useState<EmpStatus | "">("");
  const [viewing, setViewing] = useState<string | null>(null);
  const [passing, setPassing] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  /** มือถือ: แผ่นตัวกรองแผนก/ตำแหน่งเปิดอยู่ไหม (ต้นแบบ hr-employees.html .m-he-sheet) */
  const [fopen, setFopen] = useState(false);
  /** กลุ่มไหนกางอยู่ — จำไว้ข้ามการวาดใหม่ ตั้งต้นกางทุกกลุ่ม */
  const [open, setOpen] = useState<Record<EmpType, boolean>>({ full: true, probat: true, intern: true });
  /** คนที่เพิ่งเพิ่ม — รอแถวขึ้นก่อนแล้วค่อยเลื่อนไปหา */
  const justAdded = useRef<string | null>(null);
  const today = todayIso();
  /* กำลังค้นหาหรือกรองอยู่ ให้กางทุกกลุ่มที่มีผลลัพธ์ ไม่งั้นผลลัพธ์ซ่อนอยู่ในกลุ่มที่พับไว้
     เปลี่ยนเงื่อนไขทีไรกลุ่มเริ่มใหม่ที่กางเสมอ (ผูกกับ key ของ <details>) */
  const filterKey = `${query.trim()}|${dept}|${pos}|${status}`;
  const filtering = filterKey !== "|||";

  useEffect(() => {
    if (!justAdded.current) return;
    const row = document.querySelector(`[data-emp-id="${justAdded.current}"]`);
    if (!row) return;
    justAdded.current = null;
    row.scrollIntoView({ block: "center" });
  }, [hr.emp, query]);

  /* ตัวเลือกตำแหน่งแคบลงตามแผนกที่เลือก ไม่ใช่โชว์ตำแหน่งที่เลือกแล้วไม่มีใครโผล่ */
  const posOptions = hrPositions().filter((p) => !dept || p.dept === dept);

  /* ใช้ทั้งช่องเลือกบนจอคอมและแผ่นตัวกรองบนมือถือ — กติกาเดียวกัน */
  function pickDept(next: DeptKey | "") {
    setDept(next);
    /* ตำแหน่งที่เลือกไว้อาจไม่อยู่ในแผนกใหม่ ปล่อยไว้จะกรองได้ศูนย์แถวโดยไม่รู้ตัว */
    if (next && pos && hrPos(pos as PosKey).dept !== next) setPos("");
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hr.emp.filter((e) => {
      /* กรองด้วยทุกตำแหน่งที่ถืออยู่ ไม่ใช่เฉพาะตำแหน่งหลัก */
      if (dept && !posOf(e).some((v) => hrPos(v).dept === dept)) return false;
      if (pos && !holdsPos(e, pos as PosKey)) return false;
      if (status && e.status !== status) return false;
      if (q && !`${e.name} ${e.nick}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [hr.emp, query, dept, pos, status]);

  const current = viewing ? hr.emp.find((e) => e.id === viewing) : undefined;
  const passEmp = passing ? hr.emp.find((e) => e.id === passing) : undefined;
  const editEmp = editing ? hr.emp.find((e) => e.id === editing) : undefined;

  return (
    /* he-m — ที่ยึดของ styles/mobile/hr-employees.css (มือถือเท่านั้น จอคอมไม่ถูกแตะ) */
    <div className="he-m space-y-4">
      {/* มือถือ: ชื่อหน้าอยู่บนแถบของ shell แล้ว — แถวบนเหลือจำนวนคน + ปุ่มตัวกรอง แล้วค้นหาแบบเม็ดยา กับชิปสถานะ */}
      <div className="md:hidden">
        <div className="flex items-center gap-2.5">
          <p className="num flex-1 text-[13px] font-semibold text-[#6E6164]">{rows.length} คน</p>
          <button
            type="button"
            onClick={() => setFopen(true)}
            aria-label="ตัวกรองแผนกและตำแหน่ง"
            className="relative grid size-[42px] flex-none place-items-center rounded-full border border-[#EFE3E5] bg-white text-[#2A1F22] shadow-[0_4px_10px_-6px_rgba(90,20,35,.3)]"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            {(dept || pos) && (
              <i className="absolute top-1.5 right-[7px] size-2 rounded-full border-2 border-white bg-[#C8102E] box-content" />
            )}
          </button>
        </div>
        <label className="mt-2 flex h-[46px] items-center gap-2 rounded-full border border-[#EFE6E8] bg-white px-3.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A7E81" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อ หรือชื่อเล่น"
            aria-label="ค้นหาพนักงาน"
            className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-[#2A1F22] outline-none"
          />
        </label>
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="สถานะ">
          {STATUS_CHIPS.map((c) => {
            const on = status === c.v;
            return (
              <button
                key={c.v}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setStatus(c.v)}
                className={`h-[38px] flex-none rounded-full px-4 text-[13.5px] font-semibold ${
                  on ? "bg-[#C8102E] text-white" : "bg-[#EDE8EA] text-[#6E6164]"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bar">
        <div>
          <h1>ข้อมูลพนักงาน</h1>
        </div>
        <div className="tools w-full flex-wrap items-end sm:w-auto">
          {/* มือถือ: ปุ่มเพิ่มพนักงานเต็มแถวบนสุด ค้นหาเต็มแถว ตัวกรองสามช่องเรียงแถวเดียว */}
          <Field label="ค้นหา" className="max-sm:w-full">
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ชื่อ หรือชื่อเล่น"
              aria-label="ค้นหาพนักงาน"
              className="w-full sm:w-[230px]"
            />
          </Field>
          <Field label="แผนก" className="max-sm:min-w-0 max-sm:flex-1">
            <Select
              value={dept}
              onChange={(e) => pickDept(e.target.value as DeptKey | "")}
              aria-label="กรองตามแผนก"
              className="w-auto min-w-[150px] max-sm:w-full max-sm:min-w-0"
            >
              <option value="">ทุกแผนก</option>
              {hrDepts().map((d) => (
                <option key={d.v} value={d.v}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ตำแหน่ง" className="max-sm:min-w-0 max-sm:flex-1">
            <Select
              value={pos}
              onChange={(e) => setPos(e.target.value as PosKey | "")}
              aria-label="กรองตามตำแหน่ง"
              className="w-auto min-w-[150px] max-sm:w-full max-sm:min-w-0"
            >
              <option value="">ทุกตำแหน่ง</option>
              {posOptions.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="สถานะ" className="max-sm:min-w-0 max-sm:flex-1">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as EmpStatus | "")}
              aria-label="กรองตามสถานะ"
              className="w-auto min-w-[150px] max-sm:w-full max-sm:min-w-0"
            >
              <option value="">ทุกสถานะ</option>
              <option value="active">ปฏิบัติงานอยู่</option>
              <option value="left">พ้นสภาพ</option>
            </Select>
          </Field>
          <button
            type="button"
            className="btn solid btn-solid max-sm:order-first max-sm:h-11! max-sm:basis-full! max-sm:text-[14px]"
            style={{ height: 38 }}
            onClick={() => setAdding(true)}
          >
            + เพิ่มพนักงาน
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3.5">
        {rows.length === 0 ? (
          <p className="px-5 py-9 text-center text-[13.5px] text-muted-foreground">
            {query ? "ไม่พบชื่อที่ค้นหา" : "ไม่มีพนักงานตามเงื่อนไขที่เลือก"}
          </p>
        ) : (
          GROUPS.map((g) => {
            const list = rows.filter((e) => e.type === g.type);
            /* กลุ่มที่ไม่มีคนไม่ต้องแสดง — ไม่ต้องให้กดเปิดมาเจอกล่องเปล่า */
            if (!list.length) return null;
            return (
              <details
                key={filtering ? `${g.type}|${filterKey}` : g.type}
                open={filtering ? true : open[g.type]}
                onToggle={(ev) => {
                  /* ตอนกรองอยู่ไม่ต้องจำ — พับไว้ชั่วคราวได้ แต่เปลี่ยนตัวกรองแล้วกางใหม่ */
                  if (filtering) return;
                  const now = ev.currentTarget.open;
                  setOpen((v) => (v[g.type] === now ? v : { ...v, [g.type]: now }));
                }}
                className="group"
              >
                <summary className="flex cursor-pointer list-none items-center gap-2.5 py-1 text-[13.5px] font-bold marker:content-none [&::-webkit-details-marker]:hidden">
                  <i className="size-[9px] flex-none rounded-full" style={{ background: g.dot }} />
                  {g.label}
                  <span className="num font-semibold text-muted-foreground">({list.length} คน)</span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-muted-foreground transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <div className="he-list mt-2 flex flex-col gap-3">
                  {list.map((e) => (
                    <EmpCard key={e.id} emp={e} query={query} today={today} onOpen={() => setViewing(e.id)} />
                  ))}
                </div>
              </details>
            );
          })
        )}
      </div>

      {/* มือถือ: ปุ่มเพิ่มพนักงานเป็นปุ่มลอยมุมขวาล่าง เหนือแถบล่าง — ซ่อนตอนแผ่นตัวกรองเปิด */}
      {!fopen && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label="เพิ่มพนักงาน"
          className="fixed right-[18px] bottom-[calc(100px+env(safe-area-inset-bottom))] z-30 grid size-[58px] place-items-center rounded-full bg-[#C8102E] text-white shadow-[0_14px_24px_-10px_rgba(200,16,46,.9)] md:hidden"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}

      {fopen && (
        <FilterSheet
          dept={dept}
          pos={pos}
          posOptions={posOptions}
          onDept={pickDept}
          onPos={setPos}
          onClear={() => {
            setDept("");
            setPos("");
            setFopen(false);
          }}
          onClose={() => setFopen(false)}
        />
      )}

      {adding && (
        <AddDialog
          hr={hr}
          today={today}
          onClose={() => setAdding(false)}
          onAdded={(id) => {
            /* ตามต้นแบบ: ล้างช่องค้นหาแล้วเลื่อนไปที่การ์ดของคนที่เพิ่งเพิ่ม
               กางทุกกลุ่มด้วย ไม่งั้นการ์ดอาจอยู่ในกลุ่มที่พับไว้จนเลื่อนไปไม่ถึง */
            justAdded.current = id;
            setQuery("");
            setOpen({ full: true, probat: true, intern: true });
          }}
        />
      )}

      {current && (
        <EmployeeDetail
          emp={current}
          today={today}
          onPass={() => setPassing(current.id)}
          onEdit={() => setEditing(current.id)}
          onClose={() => setViewing(null)}
        />
      )}

      {passEmp && (
        <PassDialog emp={passEmp} today={today} onClose={() => setPassing(null)} />
      )}

      {editEmp && (
        <EditDialog emp={editEmp} today={today} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

// ─── กลุ่มและการ์ดพนักงาน ─────────────────────────────────────────

/* ลำดับกลุ่มตามโครงใหม่: ประจำ (เขียว) · ทดลองงาน (ส้ม) · ฝึกงาน (น้ำเงิน) */
const GROUPS: { type: EmpType; label: string; dot: string }[] = [
  { type: "full", label: "พนักงานประจำ", dot: "var(--success)" },
  { type: "probat", label: "ทดลองงาน", dot: "var(--warning)" },
  { type: "intern", label: "ฝึกงาน", dot: "var(--info)" },
];

/* มือถือ: ชิปสถานะ — ตัวเลือกเดียวกับช่อง "สถานะ" บนจอคอม */
const STATUS_CHIPS: { v: EmpStatus | ""; label: string }[] = [
  { v: "", label: "ทั้งหมด" },
  { v: "active", label: "ปฏิบัติงานอยู่" },
  { v: "left", label: "พ้นสภาพ" },
];

/**
 * มือถือ: แผ่นตัวกรองแผนก/ตำแหน่งเลื่อนขึ้นจากล่าง (ต้นแบบ .m-he-sheet / .m-he-done)
 * เลือกแล้วกรองทันทีเหมือนช่องบนจอคอม ปุ่ม "ดูผลลัพธ์" แค่ปิดแผ่น
 */
function FilterSheet({
  dept,
  pos,
  posOptions,
  onDept,
  onPos,
  onClear,
  onClose,
}: {
  dept: DeptKey | "";
  pos: PosKey | "";
  posOptions: ReturnType<typeof hrPositions>;
  onDept: (v: DeptKey | "") => void;
  onPos: (v: PosKey | "") => void;
  onClear: () => void;
  onClose: () => void;
}) {
  /* ผูกครั้งเดียวตอนเปิด — onClose เปลี่ยนทุกครั้งที่หน้าวาดใหม่ ถ้าผูกตามมันจะปลด/ล็อกการเลื่อนซ้ำ */
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    /* ล็อกการเลื่อนเฉพาะจอมือถือ — แผ่นนี้ไม่แสดงบนจอคอม */
    const unlock = window.matchMedia("(max-width: 767.98px)").matches ? lockScroll() : () => {};
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[90] md:hidden" role="dialog" aria-modal="true" aria-label="ตัวกรอง">
      <div className="absolute inset-0 bg-[rgba(40,20,25,.4)]" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-[26px] bg-white shadow-[0_-10px_30px_-10px_rgba(40,20,25,.35)]">
        <div className="flex flex-none items-center justify-between border-b border-[#F2EAEC] px-[18px] pt-4 pb-2.5">
          <b className="text-[17px] text-[#2A1F22]">ตัวกรอง</b>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-3.5">
          <Field label="แผนก">
            <Select value={dept} onChange={(e) => onDept(e.target.value as DeptKey | "")} aria-label="กรองตามแผนก" className="w-full">
              <option value="">ทุกแผนก</option>
              {hrDepts().map((d) => (
                <option key={d.v} value={d.v}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ตำแหน่ง">
            <Select value={pos} onChange={(e) => onPos(e.target.value as PosKey | "")} aria-label="กรองตามตำแหน่ง" className="w-full">
              <option value="">ทุกตำแหน่ง</option>
              {posOptions.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex flex-none gap-2.5 px-[18px] pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <button type="button" onClick={onClear} className="h-12 flex-1 rounded-[14px] bg-[#F6F0F1] text-[14.5px] font-bold text-[#2A1F22]">
            ล้างตัวกรอง
          </button>
          <button type="button" onClick={onClose} className="h-12 flex-[1.4] rounded-[14px] bg-[#C8102E] text-[14.5px] font-bold text-white">
            ดูผลลัพธ์
          </button>
        </div>
      </div>
    </div>
  );
}

/** เน้นส่วนที่ตรงกับคำค้น — แบ่งเป็นสามท่อนแล้วให้ React วาด ไม่ยัด HTML ดิบ */
function Mark({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="rounded-[3px] bg-[#FFF6C9] px-px">{text.slice(i, i + q.length)}</span>
      {text.slice(i + q.length)}
    </>
  );
}

function Donut({ pct }: { pct: number }) {
  const r = 23;
  const c = 2 * Math.PI * r;
  const on = (c * pct) / 100;
  const col = probColor(pct);
  return (
    <span
      className="relative block size-14 sm:mx-auto"
      role="img"
      aria-label={`ผ่านช่วงเวลาทดลองงานแล้ว ${pct} เปอร์เซ็นต์ (นับจากวันที่ ไม่ใช่คะแนนผลงาน)`}
    >
      <svg width="56" height="56" viewBox="0 0 56 56" className="block -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#DFE3EA" strokeWidth="5" />
        {pct > 0 && (
          <circle
            cx="28"
            cy="28"
            r={r}
            fill="none"
            stroke={col}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${on.toFixed(2)} ${(c - on).toFixed(2)}`}
          />
        )}
      </svg>
      <b className="num absolute inset-0 flex items-center justify-center text-xs font-extrabold" style={{ color: col }}>
        {pct}%
      </b>
    </span>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "warn" | "bad" }) {
  const skin =
    tone === "bad"
      ? "border-transparent bg-[var(--destructive-soft)] font-semibold text-destructive"
      : tone === "warn"
        ? "border-transparent bg-[var(--warning-soft)] font-semibold text-[var(--warning)]"
        : "border-border bg-muted/60 text-muted-foreground";
  return (
    <span className={`he-chip rounded-[20px] border px-2.5 py-[3px] text-[11.5px] ${tone ? "" : "he-chip-plain"} ${skin}`}>
      {children}
    </span>
  );
}

function EmpCard({
  emp,
  query,
  today,
  onOpen,
}: {
  emp: Employee;
  query: string;
  today: string;
  onOpen: () => void;
}) {
  const p = hrPos(emp.pos);
  const gone = emp.status === "left";
  const onProbation = emp.type === "probat" && emp.status === "active";
  const left = onProbation ? probDaysLeft(emp.startedAt, today) : null;

  return (
    /* กดที่ไหนก็ได้ในการ์ดเพื่อเปิดประวัติ — รองรับคีย์บอร์ดด้วย Enter/Space */
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onOpen();
        }
      }}
      aria-label={`ดูประวัติของ ${emp.name}`}
      data-emp-id={emp.id}
      /* มือถือ: การ์ดตกบรรทัด รูป 64px ส่วนขวาเรียงเป็นแถวเต็มความกว้าง */
      className={`he-card flex cursor-pointer flex-wrap items-center gap-3.5 rounded-[18px] border border-border bg-card px-5 py-4 max-sm:items-start max-sm:gap-x-3 max-sm:gap-y-2 max-sm:rounded-[14px] max-sm:px-3.5 max-sm:py-3 transition-[box-shadow,border-color] hover:border-[#E4C7CC] hover:shadow-[0_3px_14px_rgba(28,20,45,.07)] sm:flex-nowrap sm:gap-[18px] ${
        gone ? "opacity-[.62]" : ""
      }`}
    >
      {/* มือถือรูป 64px ยังเล็กไปสำหรับคำว่า "ยังไม่มีรูป" เหลือไว้แต่ไอคอน */}
      <EmpPhoto className="he-photo size-16 rounded-[14px] max-sm:[&>em]:hidden max-sm:[&>svg]:mb-0 sm:size-[88px] sm:rounded-[16px]" />

      <span className="he-info min-w-0 flex-1">
        <span className="he-top flex flex-wrap items-center gap-2.5">
          <b className="he-name text-base font-bold">
            <Mark text={emp.name} query={query} />
          </b>
          <StatusPill emp={emp} />
        </span>
        {/* ตำแหน่งบรรทัดหนึ่ง แผนกตัวเล็กจางอีกบรรทัด */}
        <span className="he-pos mt-[5px] block text-[13px]">
          {p.label}
          {/* ควบตำแหน่งอื่นด้วย — ตำแหน่งหลักยังเป็นตัวคิดเงินเดือนและสายอนุมัติ */}
          {(emp.posMore ?? []).length > 0 && (
            <span className="text-muted-foreground">
              {" · ควบ "}
              {(emp.posMore ?? []).map((v) => hrPos(v).label).join(" · ")}
            </span>
          )}
        </span>
        <span className="he-dept block text-[12px] text-muted-foreground">{hrDept(p.dept).label}</span>
        <span className="he-chips mt-[11px] flex flex-wrap gap-1.5 max-sm:mt-2">
          <Chip>เริ่ม {thaiDate(emp.startedAt)}</Chip>
          <Chip>
            {emp.leftAt ? "ทำงานรวม" : "ทำงานมาแล้ว"} {empYears(emp.startedAt, today, emp.leftAt)}
          </Chip>
          {left !== null && (
            <Chip tone={left < 0 ? "bad" : "warn"}>
              {left < 0
                ? `เลยกำหนดทดลองงาน ${Math.abs(left)} วัน`
                : left === 0
                  ? "ครบกำหนดวันนี้"
                  : `ครบกำหนดอีก ${left} วัน`}
            </Chip>
          )}
          {emp.leftAt && <Chip tone="bad">พ้นสภาพ {thaiDate(emp.leftAt)}</Chip>}
        </span>
      </span>

      {/* วงแหวนบอก "ช่วงเวลา" ทดลองงานที่ผ่านมาแล้ว ไม่ใช่คะแนนผลงาน */}
      <span
        /* มือถือ: แถวเต็มความกว้างใต้การ์ด — คนที่ไม่ได้ทดลองงานไม่ต้องขึ้น เพราะหัวกลุ่มบอกประเภทอยู่แล้ว */
        className={`he-side flex w-full flex-none items-center gap-2.5 sm:block sm:w-[110px] sm:text-center ${
          onProbation ? "max-sm:mt-1 max-sm:border-t max-sm:border-border max-sm:pt-2" : "max-sm:hidden"
        }`}
      >
        {onProbation ? (
          <>
            <Donut pct={probPct(emp.startedAt, today)} />
            <span className="block text-[10.5px] leading-snug text-muted-foreground sm:mt-1.5">
              ผ่านช่วงทดลองงาน
              <span className="max-sm:hidden"> (นับตามวัน)</span>
            </span>
          </>
        ) : (
          <span className="block text-[11px] leading-snug text-muted-foreground">
            {HR_EMPTYPE[emp.type].label}
          </span>
        )}
      </span>
    </div>
  );
}

// ─── แก้ไขข้อมูลพนักงาน ──────────────────────────────────────────

/*
 * แยกเป็นสองแบบตามผลกระทบต่อเงินเดือน
 *   ข้อมูลส่วนตัว ติดต่อ ผู้บังคับบัญชา เอกสาร — แก้ทับได้เลย
 *   ตำแหน่ง/เงินเดือน และพ้นสภาพ — ต้องมีวันที่มีผล และต้องหลังรอบเงินเดือนที่ปิดแล้ว
 *     ตำแหน่ง/เงินเดือนต่อเป็นแถวประวัติใหม่ ไม่แก้แถวเดิม
 */
function EditDialog({ emp, today, onClose }: { emp: Employee; today: string; onClose: () => void }) {
  const role = useRole();
  const hr = useHr();
  const cur = emp.history[emp.history.length - 1];
  const lock = lockedUntil(hr);

  const [f, setF] = useState({
    name: emp.name,
    nick: emp.nick,
    sex: emp.sex,
    birth: emp.birth,
    edu: emp.edu,
    exp: emp.exp.join("\n"),
    phone: emp.phone,
    email: emp.email,
    address: emp.address,
    sosName: emp.sos.name,
    sosRel: emp.sos.rel,
    sosPhone: emp.sos.phone,
    boss: emp.boss,
  });
  const [docs, setDocs] = useState<DocKey[]>(emp.docs);
  /* เพิ่มชนิดเอกสารใหม่จากตรงนี้ได้ — เพิ่มแล้วติ๊กให้เลยว่าได้รับแล้ว */
  const addDoc = useAddOption({ catalog: "docs" }, (v) => setDocs((x) => (x.includes(v) ? x : [...x, v])));
  const [pos, setPos] = useState<PosKey>(cur.pos);
  /* ตำแหน่งควบ — เจ้าของสั่ง 28 ก.ย. 2569 ให้หนึ่งคนถือได้หลายตำแหน่ง */
  const [posMore, setPosMore] = useState<PosKey[]>(emp.posMore ?? []);
  const addPos = useAddOption({ catalog: "positions", dept: hrPos(cur.pos).dept }, setPos);
  const addSex = useAddOption({ list: "sex" }, (v) => setF((x) => ({ ...x, sex: v })));
  const [salary, setSalary] = useState(commaInput(String(cur.salary)));
  const [posAt, setPosAt] = useState("");
  const [posNote, setPosNote] = useState("");
  const [left, setLeft] = useState(emp.status === "left");
  const [leftAt, setLeftAt] = useState(emp.leftAt ?? "");
  const [leftWhy, setLeftWhy] = useState(emp.leftWhy ?? "");
  const [picker, setPicker] = useState<"" | "birth" | "pos" | "left">("");
  const [tried, setTried] = useState(false);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  const rawSalary = salary.replace(/,/g, "").trim();
  const salaryOk = /^\d+(\.\d+)?$/.test(rawSalary) && Number(rawSalary) > 0;
  const posChanged = pos !== cur.pos || (salaryOk && Number(rawSalary) !== cur.salary);
  const leftChanged =
    left !== (emp.status === "left") ||
    (left && (leftAt !== (emp.leftAt ?? "") || leftWhy.trim() !== (emp.leftWhy ?? "")));
  /* วันที่มีผลต้องหลังรอบเงินเดือนที่ปิดแล้ว ไม่งั้นตัวเลขของรอบที่ปิดไปจะเปลี่ยนเอง */
  const minAt = lock && lock >= emp.startedAt ? isoAfter(lock) : emp.startedAt;

  const errors: string[] = [];
  if (!f.name.trim()) errors.push("ระบุชื่อ-สกุล");
  if (!f.phone.trim()) errors.push("ระบุเบอร์โทรศัพท์");
  if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) errors.push("อีเมลไม่ถูกรูปแบบ");
  if (!salaryOk) errors.push("เงินเดือนต้องเป็นตัวเลขมากกว่าศูนย์");
  if (posChanged && !posAt) errors.push("ปรับตำแหน่งหรือเงินเดือนต้องระบุวันที่มีผล");
  if (posChanged && posAt && posAt < minAt) errors.push("วันที่มีผลต้องหลังรอบเงินเดือนที่ปิดแล้ว");
  if (posChanged && !posNote.trim()) errors.push("ระบุเหตุผลของการปรับตำแหน่งหรือเงินเดือน");
  if (leftChanged && left && (!leftAt || !leftWhy.trim())) errors.push("พ้นสภาพต้องระบุวันที่และเหตุผล");
  if (leftChanged && left && leftAt && leftAt < minAt) errors.push("วันพ้นสภาพต้องหลังรอบเงินเดือนที่ปิดแล้ว");

  function save() {
    setTried(true);
    if (errors.length) return;
    updateEmpProfile(emp.id, {
      name: f.name.trim(),
      nick: f.nick.trim(),
      sex: f.sex,
      birth: f.birth,
      edu: f.edu.trim(),
      exp: f.exp.split("\n").map((x) => x.trim()).filter(Boolean),
      phone: f.phone.trim(),
      email: f.email.trim(),
      address: f.address.trim(),
      sos: { name: f.sosName.trim(), rel: f.sosRel.trim(), phone: f.sosPhone.trim() },
      boss: f.boss,
      docs: hrDocs().map((d) => d.v).filter((v) => docs.includes(v)),
      /* ตำแหน่งหลักที่เพิ่งเลือกไว้ต้องไม่ซ้ำอยู่ในรายการควบ */
      posMore: posMore.filter((v) => v !== pos),
    }, USERS[role].name);
    if (posChanged) changePosition(emp.id, posAt, pos, Number(rawSalary), posNote.trim());
    if (leftChanged) setEmpLeft(emp.id, left ? leftAt : "", left ? leftWhy.trim() : "");
    onClose();
  }

  const bosses = hr.emp.filter((e) => e.id !== emp.id && e.status === "active");

  return (
    <Sheet
      className="he-dlg"
      title={`แก้ไขข้อมูล · ${emp.name}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid" onClick={save}>
            บันทึก
          </button>
        </>
      }
    >
      <div onClick={() => setPicker("")}>
        <Sect title="ประวัติส่วนตัว">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="ชื่อ-สกุล" required>
              <Input value={f.name} onChange={set("name")} />
            </Field>
            <Field label="ชื่อเล่น">
              <Input value={f.nick} onChange={set("nick")} />
            </Field>
            <Field label="เพศ">
              {/* อ่านจากข้อมูลหลัก — เพิ่มเพศใหม่แล้วต้องขึ้นให้เลือกที่นี่ทันที */}
              <Select
                value={f.sex}
                onChange={(e) => addSex.pick(e.target.value) || setF((x) => ({ ...x, sex: e.target.value }))}
              >
                {optionsOf("sex").map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
                {addSex.option}
              </Select>
            </Field>
            {addSex.dialog}
            <Field label="วันเกิด">
              <ThaiDatePicker
                value={f.birth}
                max={today}
                open={picker === "birth"}
                label="วันเกิด"
                onToggle={() => setPicker((v) => (v === "birth" ? "" : "birth"))}
                onPick={(iso) => {
                  setF((v) => ({ ...v, birth: iso }));
                  setPicker("");
                }}
              />
            </Field>
            <Field label="วุฒิการศึกษา" className="sm:col-span-2">
              <Input value={f.edu} onChange={set("edu")} />
            </Field>
            <Field label="ประสบการณ์ทำงาน" hint="บรรทัดละหนึ่งรายการ" className="sm:col-span-2">
              <Textarea rows={3} value={f.exp} onChange={set("exp")} />
            </Field>
          </div>
        </Sect>

        <Sect title="ข้อมูลติดต่อ">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="เบอร์โทรศัพท์" required>
              <Input inputMode="tel" value={f.phone} onChange={set("phone")} />
            </Field>
            <Field label="อีเมล">
              <Input type="email" value={f.email} onChange={set("email")} />
            </Field>
            <Field label="ที่อยู่" className="sm:col-span-2">
              <Textarea rows={2} value={f.address} onChange={set("address")} />
            </Field>
            <Field label="ผู้ติดต่อฉุกเฉิน">
              <Input value={f.sosName} onChange={set("sosName")} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ความสัมพันธ์">
                <Input value={f.sosRel} onChange={set("sosRel")} />
              </Field>
              <Field label="เบอร์ผู้ติดต่อ">
                <Input inputMode="tel" value={f.sosPhone} onChange={set("sosPhone")} />
              </Field>
            </div>
          </div>
        </Sect>

        <Sect title="การจ้างงาน">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="ผู้บังคับบัญชา">
              <Select value={f.boss} onChange={set("boss")}>
                <option value="">ไม่มี</option>
                {bosses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {hrPos(b.pos).label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <h4 className="mt-4 mb-2 text-[12.5px] font-semibold">ปรับตำแหน่ง / เงินเดือน</h4>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="ตำแหน่ง">
              <Select value={pos} onChange={(e) => addPos.pick(e.target.value) || setPos(e.target.value as PosKey)}>
                {hrDepts().map((d) => (
                  <optgroup key={d.v} label={d.label}>
                    {hrPositions().filter((x) => x.dept === d.v).map((x) => (
                      <option key={x.v} value={x.v}>
                        {x.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {addPos.option}
              </Select>
            </Field>

            <Field label="ตำแหน่งควบ" hint="ทำหลายตำแหน่งได้ · เงินเดือนและสายอนุมัติยังคิดจากตำแหน่งหลักด้านซ้าย">
              <div className="flex flex-wrap gap-1.5">
                {hrPositions()
                  .filter((x) => x.v !== pos)
                  .map((x) => {
                    const on = posMore.includes(x.v);
                    return (
                      <button
                        key={x.v}
                        type="button"
                        aria-pressed={on}
                        className={`btn btn-mini ${on ? "solid btn-solid" : "glass-thin"}`}
                        onClick={() =>
                          setPosMore((list) => (on ? list.filter((v) => v !== x.v) : [...list, x.v]))
                        }
                      >
                        {x.label}
                      </button>
                    );
                  })}
              </div>
            </Field>
            {addPos.dialog}
            <Field label="เงินเดือน (บาท)">
              <Input inputMode="decimal" value={salary} onChange={(e) => setSalary(commaInput(e.target.value))} />
            </Field>
            {posChanged && (
              <>
                <Field label="วันที่มีผล" required>
                  <ThaiDatePicker
                    value={posAt}
                    min={minAt}
                    open={picker === "pos"}
                    label="วันที่มีผล"
                    onToggle={() => setPicker((v) => (v === "pos" ? "" : "pos"))}
                    onPick={(iso) => {
                      setPosAt(iso);
                      setPicker("");
                    }}
                  />
                </Field>
                <Field label="เหตุผล" required>
                  <Input
                    value={posNote}
                    onChange={(e) => setPosNote(e.target.value)}
                    placeholder="เช่น ปรับประจำปี · เลื่อนตำแหน่ง"
                  />
                </Field>
              </>
            )}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            {posChanged
              ? "บันทึกเป็นประวัติแถวใหม่ ตัวเลขก่อนวันที่มีผลไม่เปลี่ยน"
              : "แก้ตำแหน่งหรือเงินเดือนแล้วจะให้ระบุวันที่มีผลและเหตุผล"}
            {lock && ` · รอบเงินเดือนปิดถึง ${thaiDate(lock)} วันที่มีผลต้องหลังวันนั้น`}
          </p>

          <label className="mt-4 flex cursor-pointer items-center gap-2 text-[13px] font-semibold">
            <input
              type="checkbox"
              checked={left}
              onChange={(e) => setLeft(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            พ้นสภาพพนักงาน
          </label>
          {left && (
            <div className="mt-2.5 grid gap-3.5 sm:grid-cols-2">
              <Field label="วันที่พ้นสภาพ" required>
                <ThaiDatePicker
                  value={leftAt}
                  min={minAt}
                  open={picker === "left"}
                  label="วันที่พ้นสภาพ"
                  onToggle={() => setPicker((v) => (v === "left" ? "" : "left"))}
                  onPick={(iso) => {
                    setLeftAt(iso);
                    setPicker("");
                  }}
                />
              </Field>
              <Field label="เหตุผล" required>
                <Input
                  value={leftWhy}
                  onChange={(e) => setLeftWhy(e.target.value)}
                  placeholder="เช่น ลาออก · หมดสัญญา"
                />
              </Field>
            </div>
          )}
        </Sect>

        <Sect title="เอกสารประกอบ">
          <ul className="grid gap-1.5 text-[13px] sm:grid-cols-2">
            {hrDocs().map((d) => (
              <li key={d.v}>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={docs.includes(d.v)}
                    onChange={(e) =>
                      setDocs((v) => (e.target.checked ? [...v, d.v] : v.filter((x) => x !== d.v)))
                    }
                    className="size-4 accent-[var(--primary)]"
                  />
                  {d.label}
                  {d.req && <span className="text-destructive">*</span>}
                </label>
              </li>
            ))}
          </ul>
          {addDoc.canAdd && (
            <button type="button" className="lnk mt-2 text-[12.5px]" onClick={() => addDoc.pick(ADD_VALUE)}>
              ＋ เพิ่มชนิดเอกสาร
            </button>
          )}
          {addDoc.dialog}
        </Sect>
      </div>

      {tried && errors.length > 0 && (
        <ul className="mt-4 list-disc rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] py-2.5 pr-3.5 pl-8 text-[12.5px] text-destructive">
          {errors.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

/** วันถัดไปของวันที่แบบ yyyy-mm-dd */
function isoAfter(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return toIsoDate(new Date(y, m - 1, d + 1));
}

// ─── บันทึกผ่านทดลองงาน ──────────────────────────────────────────

function PassDialog({ emp, today, onClose }: { emp: Employee; today: string; onClose: () => void }) {
  const [at, setAt] = useState(today);
  const [pickAt, setPickAt] = useState(false);
  const [salary, setSalary] = useState("");
  const [warn, setWarn] = useState(false);
  const last = emp.history[emp.history.length - 1];

  const raw = salary.replace(/,/g, "").trim();
  const ok = /^\d+(\.\d+)?$/.test(raw) && Number(raw) > 0;

  function confirm() {
    if (!at || !ok) {
      setWarn(true);
      return;
    }
    passProbation(emp.id, at, Number(raw));
    onClose();
  }

  return (
    <Sheet
      className="he-dlg"
      title="บันทึกผ่านทดลองงาน"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid" onClick={confirm}>
            ยืนยัน
          </button>
        </>
      }
    >
      <p className="text-[12.5px] text-muted-foreground">{emp.name}</p>
      <div className="mt-3">
        <Kv>
          <Row k="ประเภทตอนนี้" v="ทดลองงาน จ่ายรายวัน" />
          <Row k="อัตราที่บันทึกไว้" v={`${baht(last.salary)} บาท`} num />
          <Row k="ครบกำหนดทดลองงาน" v={probLine(emp.startedAt, today)} num />
        </Kv>
      </div>
      <hr className="my-4 border-border" />
      <div className="space-y-3.5" onClick={() => setPickAt(false)}>
        <Field label="วันที่มีผล">
          {/* มีผลก่อนวันเริ่มงานไม่ได้ — ยังไม่ได้เป็นพนักงานเลย */}
          <ThaiDatePicker
            value={at}
            min={emp.startedAt}
            open={pickAt}
            label="วันที่มีผล"
            onToggle={() => setPickAt((v) => !v)}
            onPick={(iso) => {
              setAt(iso);
              setPickAt(false);
              setWarn(false);
            }}
          />
        </Field>
        <Field label="เงินเดือน (บาท ต่อเดือน)">
          <Input
            inputMode="decimal"
            value={salary}
            onChange={(e) => {
              setSalary(commaInput(e.target.value));
              setWarn(false);
            }}
            placeholder="เช่น 21000"
          />
        </Field>
      </div>
      {warn && (
        <p className="mt-2.5 rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] px-3.5 py-2.5 text-[12.5px] text-destructive">
          ระบุวันที่มีผล และเงินเดือนเป็นตัวเลขมากกว่าศูนย์
        </p>
      )}
      <p className="mt-3 rounded-[11px] border border-border bg-muted/50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
        {ok ? (
          <>
            หลังมีผล จะคิดเงินเดือนรายเดือน <b className="text-foreground">{baht(Number(raw))}</b> บาท
            (ค่าจ้างรายชั่วโมงสำหรับโอที{" "}
            {baht(Number(raw) / HR_OT_DIVISOR.days / HR_OT_DIVISOR.hours)} บาท)
          </>
        ) : (
          "ก่อนหน้านี้จ่ายค่าจ้างรายวัน หลังมีผลจะเปลี่ยนเป็นเงินเดือนรายเดือน"
        )}
      </p>
    </Sheet>
  );
}

// ─── ส่วนประกอบของกล่องประวัติ ─────────────────────────────────────

function Sect({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 border-t border-border pt-4 first:mt-0 first:border-t-0 first:pt-0">
      <h3 className="mb-2.5 text-[12.5px] font-bold text-primary">{title}</h3>
      {children}
    </section>
  );
}

function Kv({ children }: { children: React.ReactNode }) {
  return (
    <dl className="he-kv grid gap-2 text-[13.5px] sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-x-4">
      {children}
    </dl>
  );
}

function Row({
  k,
  v,
  num,
  muted,
  bad,
}: {
  k: string;
  v: string;
  num?: boolean;
  muted?: boolean;
  bad?: boolean;
}) {
  return (
    <>
      <dt className="text-[12.5px] font-semibold text-muted-foreground">{k}</dt>
      <dd
        className={`leading-relaxed ${num ? "num font-semibold" : ""} ${
          bad ? "text-destructive" : muted ? "text-muted-foreground" : ""
        }`}
      >
        {v}
      </dd>
    </>
  );
}

// ─── เพิ่มพนักงานใหม่ ─────────────────────────────────────────────

/*
 * ฟอร์มเดียวจบตามต้นแบบ hr-employees.html — ตัวบุคคล การจ้างงาน ติดต่อ ฉุกเฉิน เอกสาร
 * เอกสารไม่ครบก็บันทึกได้ แต่ต้องเห็นว่าขาดอะไร (S-5) จึงติ๊กเท่าที่ได้รับจริง
 */
function AddDialog({
  hr,
  today,
  onClose,
  onAdded,
}: {
  hr: HrState;
  today: string;
  onClose: () => void;
  onAdded?: (id: string) => void;
}) {
  const [f, setF] = useState({
    name: "",
    nick: "",
    sex: optionsOf("sex")[0] ?? "ไม่ระบุ",
    birth: "",
    pos: hrPositions()[0].v as PosKey,
    /* ตั้งต้นที่ทดลองงานตามกติกา แต่ฝ่ายบุคคลเปลี่ยนได้ เช่นรับนักศึกษาฝึกงาน */
    type: "probat" as EmpType,
    startedAt: today,
    boss: "",
    salary: "",
    phone: "",
    email: "",
    address: "",
    sosName: "",
    sosRel: "",
    sosPhone: "",
  });
  const [docs, setDocs] = useState<DocKey[]>([]);
  /* เพิ่มชนิดเอกสารใหม่จากตรงนี้ได้ — เพิ่มแล้วติ๊กให้เลยว่าได้รับแล้ว */
  const addDoc = useAddOption({ catalog: "docs" }, (v) => setDocs((x) => (x.includes(v) ? x : [...x, v])));
  const [picker, setPicker] = useState<"" | "birth" | "start">("");
  const [warn, setWarn] = useState("");

  const set =
    (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setF((v) => ({ ...v, [k]: e.target.value }));

  const addPos = useAddOption({ catalog: "positions" }, (v) => setF((x) => ({ ...x, pos: v })));
  const addSex = useAddOption({ list: "sex" }, (v) => setF((x) => ({ ...x, sex: v })));
  const salary = Number(f.salary.replace(/[^\d.]/g, ""));
  const bosses = hr.emp.filter((e) => e.status === "active");
  /*
   * รอบที่ปิดแล้วไม่รับคนเพิ่มไม่ว่ากรณีใด (ผู้ใช้กำหนด 23 ก.ย. 2569)
   * วันเริ่มงานต้องอยู่หลังวันสุดท้ายของรอบเงินเดือนที่ปิดล่าสุด
   * คนเข้าใหม่ย้อนหลังจริงให้จ่ายเป็นรายการปรับปรุงในรอบถัดไป ไม่ใช่ดันคนเข้ารอบที่ปิดไปแล้ว
   */
  const lock = lockedUntil(hr);
  const minStart = lock ? isoAfter(lock) : "";

  function save() {
    const name = f.name.trim();
    /* ตรวจทีละข้อแล้วบอกข้อแรกที่ติด ไม่รวมเป็นก้อนเดียวจนไม่รู้ว่าต้องแก้ช่องไหน */
    if (!name) return setWarn("กรอกชื่อและนามสกุล");
    if (name.split(/\s+/).length < 2) return setWarn("กรอกทั้งชื่อและนามสกุล");
    if (!f.startedAt) return setWarn("เลือกวันเริ่มงาน");
    if (minStart && f.startedAt < minStart)
      return setWarn(
        `รอบเงินเดือนถึง ${thaiDate(lock!)} ปิดไปแล้ว วันเริ่มงานต้องตั้งแต่ ${thaiDate(minStart)} เป็นต้นไป · ถ้าเข้าใหม่ย้อนหลังจริง ให้จ่ายเป็นรายการปรับปรุงในรอบถัดไป`,
      );
    if (!(salary > 0)) return setWarn("กรอกเงินเดือน");
    if (!f.phone.trim()) return setWarn("กรอกเบอร์โทร");
    /* ชื่อซ้ำตรวจเป็นข้อสุดท้าย — ช่องที่ยังว่างต้องบอกก่อน (ลำดับตามต้นแบบ) */
    if (hr.emp.some((e) => e.name === name)) return setWarn("มีพนักงานชื่อนี้ในระบบแล้ว ตรวจสอบก่อนบันทึก");

    const id = addEmployee({
      name,
      nick: f.nick.trim(),
      sex: f.sex,
      birth: f.birth,
      pos: f.pos,
      type: f.type,
      startedAt: f.startedAt,
      boss: f.boss,
      edu: "",
      exp: [],
      phone: f.phone.trim(),
      email: f.email.trim(),
      address: f.address.trim(),
      sos: { name: f.sosName.trim(), rel: f.sosRel.trim(), phone: f.sosPhone.trim() },
      docs: hrDocs().map((d) => d.v).filter((v) => docs.includes(v)),
      salary,
    });
    onClose();
    if (id) onAdded?.(id);
  }

  return (
    <Sheet
      className="he-dlg"
      title="เพิ่มพนักงาน"
      mid
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid" onClick={save}>
            บันทึก
          </button>
        </>
      }
    >
      <div onClick={() => setPicker("")}>
        <Sect title="ข้อมูลตัวบุคคล">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="ชื่อและนามสกุล" required>
              <Input value={f.name} onChange={set("name")} placeholder="เช่น สมชาย ใจดี" aria-label="ชื่อและนามสกุล" />
            </Field>
            <Field label="ชื่อเล่น">
              <Input value={f.nick} onChange={set("nick")} placeholder="เช่น ชาย" aria-label="ชื่อเล่น" />
            </Field>
            <Field label="เพศ">
              <Select
                value={f.sex}
                aria-label="เพศ"
                onChange={(e) => addSex.pick(e.target.value) || setF((x) => ({ ...x, sex: e.target.value }))}
              >
                {optionsOf("sex").map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
                {addSex.option}
              </Select>
            </Field>
            {addSex.dialog}
            <Field label="วันเกิด">
              <ThaiDatePicker
                value={f.birth}
                max={today}
                open={picker === "birth"}
                label="วันเกิด"
                onToggle={() => setPicker((v) => (v === "birth" ? "" : "birth"))}
                onPick={(iso) => {
                  setF((v) => ({ ...v, birth: iso }));
                  setPicker("");
                }}
              />
            </Field>
          </div>
        </Sect>

        <Sect title="การจ้างงาน">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="ตำแหน่ง" required>
              <Select value={f.pos} onChange={(e) => addPos.pick(e.target.value) || set("pos")(e)} aria-label="ตำแหน่ง">
                {hrPositions().map((p) => (
                  <option key={p.v} value={p.v}>
                    {p.label} · {hrDept(p.dept).label}
                  </option>
                ))}
                {addPos.option}
              </Select>
            </Field>
            {addPos.dialog}
            <Field label="ประเภทการจ้าง" hint="คนเข้าใหม่ตั้งต้นที่ทดลองงาน">
              <Select value={f.type} onChange={set("type")} aria-label="ประเภทการจ้าง">
                {(Object.keys(HR_EMPTYPE) as EmpType[]).map((k) => (
                  <option key={k} value={k}>
                    {HR_EMPTYPE[k].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="วันเริ่มงาน"
              required
              hint={minStart ? `รอบที่ปิดแล้วไม่รับคนเพิ่ม เลือกได้ตั้งแต่ ${thaiDate(minStart)}` : undefined}
            >
              <ThaiDatePicker
                value={f.startedAt}
                min={minStart || undefined}
                open={picker === "start"}
                label="วันเริ่มงาน"
                onToggle={() => setPicker((v) => (v === "start" ? "" : "start"))}
                onPick={(iso) => {
                  setF((v) => ({ ...v, startedAt: iso }));
                  setPicker("");
                }}
              />
            </Field>
            <Field label="หัวหน้างาน">
              <Select value={f.boss} onChange={set("boss")} aria-label="หัวหน้างาน">
                <option value="">ยังไม่กำหนด</option>
                {bosses.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {hrPos(e.pos).label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="เงินเดือน"
              required
              hint={
                f.type === "probat"
                  ? "ช่วงทดลองงานจ่ายรายวัน คิดจากค่านี้หารจำนวนวันของเดือน"
                  : undefined
              }
            >
              <Input
                value={f.salary}
                onChange={(e) => setF((v) => ({ ...v, salary: commaInput(e.target.value) }))}
                inputMode="decimal"
                placeholder="บาท"
                className="num"
                aria-label="เงินเดือน"
              />
            </Field>
          </div>
        </Sect>

        <Sect title="การติดต่อ">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="เบอร์โทร" required>
              <Input value={f.phone} onChange={set("phone")} placeholder="08X-XXX-XXXX" aria-label="เบอร์โทร" />
            </Field>
            <Field label="อีเมล">
              <Input value={f.email} onChange={set("email")} placeholder="name@example.com" aria-label="อีเมล" />
            </Field>
            <Field label="ที่อยู่" className="sm:col-span-2">
              <Input
                value={f.address}
                onChange={set("address")}
                placeholder="บ้านเลขที่ ตำบล อำเภอ จังหวัด"
                aria-label="ที่อยู่"
              />
            </Field>
          </div>
        </Sect>

        <Sect title="ผู้ติดต่อฉุกเฉิน">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="ชื่อ">
              <Input value={f.sosName} onChange={set("sosName")} aria-label="ชื่อผู้ติดต่อฉุกเฉิน" />
            </Field>
            <Field label="ความสัมพันธ์">
              <Input value={f.sosRel} onChange={set("sosRel")} placeholder="เช่น มารดา" aria-label="ความสัมพันธ์" />
            </Field>
            <Field label="เบอร์โทร">
              <Input value={f.sosPhone} onChange={set("sosPhone")} aria-label="เบอร์โทรผู้ติดต่อฉุกเฉิน" />
            </Field>
          </div>
        </Sect>

        <Sect title="เอกสารที่ได้รับแล้ว">
          <ul className="grid gap-1.5 text-[13px] sm:grid-cols-2">
            {hrDocs().map((d) => (
              <li key={d.v}>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={docs.includes(d.v)}
                    onChange={(e) =>
                      setDocs((v) => (e.target.checked ? [...v, d.v] : v.filter((x) => x !== d.v)))
                    }
                    className="size-4 accent-[var(--primary)]"
                  />
                  {d.label}
                  {d.req && <span className="text-destructive">*</span>}
                </label>
              </li>
            ))}
          </ul>
          {addDoc.canAdd && (
            <button type="button" className="lnk mt-2 text-[12.5px]" onClick={() => addDoc.pick(ADD_VALUE)}>
              ＋ เพิ่มชนิดเอกสาร
            </button>
          )}
          {addDoc.dialog}
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            เอกสารไม่ครบก็บันทึกได้ หน้าประวัติจะขึ้นว่ายังขาดอะไรบ้าง
          </p>
        </Sect>

        {warn && (
          <p className="mt-4 rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] px-3.5 py-2.5 text-[12.5px] text-destructive">
            {warn}
          </p>
        )}
      </div>
    </Sheet>
  );
}
