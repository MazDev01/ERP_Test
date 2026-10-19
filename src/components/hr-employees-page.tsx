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
import Link from "next/link";
import { mobileHomeOf } from "@/lib/nav";
import { baht, thaiDate, thaiMonth, toIsoDate, todayIso, commaInput } from "@/lib/format";
import {
  hrDepts,
  suggestUser,
  hrDocs,
  HR_EMPTYPE,
  HR_OT_DIVISOR,
  hrPositions,
  hrDept,
  hrPos,
  holdsPos,
  posOf,
  probDaysLeft,
  probLine,
  probPct,
  probColor,
  empYears,
  payFromAfterPass,
  cycleMonthOfDay,
  HR_STATUS,
  type DeptKey,
  type DocKey,
  type EmpStatus,
  type EmpType,
  type Employee,
  type PosKey,
} from "@/lib/hr-data";
import {
  addEmployee,
  createAccount,
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
import { useRole, type Role } from "@/lib/role";
import { Sheet } from "./lead-dialogs";
import { StepIndicator } from "./lead-form";
import { EmployeeDetail } from "./hr-employee-detail";
import { ThaiDatePicker } from "./thai-date-picker";
import { Field, Input, Select, Textarea } from "./ui";
import { CredentialsDialog, PassBox, RolePicker, tempPass } from "./account-parts";
import { lockScroll } from "@/lib/scroll-lock";
import "@/styles/mobile/hr-employees.css";

export function HrEmployeesPage() {
  const hr = useHr();
  /* ปุ่มย้อนกลับบนมือถือพากลับหน้าหลักการ์ดเมนูของบทบาท (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  const myRole = useRole();
  /* หน้าอื่นในฝ่ายบุคคลลิงก์มาหาคนเดียวด้วย ?find=<ชื่อ> ใช้ช่องค้นหาเดิมเป็นตัวกรอง */
  const find = useFindParam();
  const [query, setQuery] = useState(find);
  const [dept, setDept] = useState<DeptKey | "">("");
  const [pos, setPos] = useState<PosKey | "">("");
  const [status, setStatus] = useState<EmpStatus | "">("");
  const [viewing, setViewing] = useState<string | null>(null);
  const [passing, setPassing] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  /* พนักงานที่กดลบ — รอยืนยัน (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  const [removing, setRemoving] = useState<string | null>(null);
  const removeEmp = removing ? hr.emp.find((e) => e.id === removing) : undefined;
  const [adding, setAdding] = useState(false);
  /** หลังเพิ่มพนักงาน — แสดงชื่อผู้ใช้และรหัสชั่วคราวให้ฝ่ายบุคคลส่งต่อ */
  const [cred, setCred] = useState<{ name: string; user: string; pass: string } | null>(null);
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
    /* การ์ดมีสองชุด (มือถือ/จอคอม) — เลื่อนไปหาใบที่มองเห็นอยู่ */
    const row = Array.from(document.querySelectorAll<HTMLElement>(`[data-emp-id="${justAdded.current}"]`)).find((el) => el.offsetParent !== null);
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
      {/* มือถือ: หัวของหน้าเองตามต้นแบบ (.m-he-head) — แถบบนกับชิปเมนูย่อยของ shell ซ่อนบนหน้านี้ (ผู้ใช้สั่ง 13 ต.ค. 2569)
          ปุ่มย้อนกลับ · "พนักงาน N คน" · ปุ่มตัวกรอง แล้วค้นหาแบบเม็ดยา กับชิปสถานะ */}
      <div className="m-he-top md:hidden">
        <header className="m-he-head">
          <Link href={mobileHomeOf(myRole)} aria-label="กลับหน้าหลัก">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
          </Link>
          <h1>
            พนักงาน<small className="num">{rows.length} คน</small>
          </h1>
          <button
            type="button"
            onClick={() => setFopen(true)}
            aria-label="ตัวกรองแผนกและตำแหน่ง"
            className={dept || pos ? "on" : ""}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            <i />
          </button>
        </header>
        <label className="m-he-search">
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
          />
        </label>
        <div className="m-he-chips" role="tablist" aria-label="สถานะ">
          {STATUS_CHIPS.map((c) => {
            const on = status === c.v;
            return (
              <button key={c.v} type="button" role="tab" aria-selected={on} onClick={() => setStatus(c.v)} className={on ? "on" : ""}>
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bar">
        <div>
          <h1>
            ข้อมูลพนักงาน
            <span className="num ml-2.5 text-primary">{rows.length} คน</span>
          </h1>
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

      <div className="he-list flex flex-col gap-3.5">
        {rows.length === 0 ? (
          <p className="px-5 py-9 text-center text-[13.5px] text-muted-foreground">
            {query ? "ไม่พบชื่อที่ค้นหา" : "ไม่มีพนักงานตามเงื่อนไขที่เลือก"}
          </p>
        ) : (
          <>
          {/* มือถือ: รายการเดียวไม่แบ่งกลุ่ม การ์ดรูปกลม 52px ตามต้นแบบ .elist .erow (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
          <div className="m-he-list md:hidden">
            {rows.map((e) => (
              <MobileEmpCard key={e.id} emp={e} query={query} today={today} onOpen={() => setViewing(e.id)} />
            ))}
          </div>
          {/* จอคอม: กลุ่มพับได้ตามเดิม */}
          <div className="contents max-md:hidden">
          {GROUPS.map((g) => {
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
                {/* หัวกลุ่มเป็นแถบขาว จุดสี · ชื่อกลุ่ม · จำนวนคน · ลูกศรชิดขวา (ต้นแบบ hr-employees-grid.html) */}
                <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-[14px] border border-[#ECEEF2] bg-card px-4 py-3 select-none marker:content-none hover:border-[#E4C7CC] [&::-webkit-details-marker]:hidden">
                  <i className="size-2.5 flex-none rounded-full" style={{ background: g.dot }} />
                  <b className="text-[15px] font-bold">{g.label}</b>
                  <span className="num rounded-[20px] bg-[#F1F2F5] px-2.5 py-0.5 text-[12px] font-semibold text-muted-foreground">
                    {list.length} คน
                  </span>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="ml-auto text-muted-foreground transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <div className="mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] items-stretch gap-[18px] max-sm:grid-cols-1 max-sm:gap-3">
                  {list.map((e) => (
                    <EmpCard key={e.id} emp={e} query={query} today={today} onOpen={() => setViewing(e.id)} onEdit={() => setEditing(e.id)} onDelete={() => setRemoving(e.id)} />
                  ))}
                </div>
              </details>
            );
          })}
          </div>
          </>
        )}
      </div>

      {/* มือถือ: ปุ่มเพิ่มพนักงานเป็นปุ่มลอยมุมขวาล่าง เหนือแถบล่าง — ซ่อนตอนแผ่นตัวกรองเปิด */}
      {!fopen && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label="เพิ่มพนักงาน"
          className="m-he-fab fixed right-[18px] bottom-[calc(100px+env(safe-area-inset-bottom))] z-40 grid size-[58px] place-items-center rounded-full bg-[#C8102E] text-white shadow-[0_14px_24px_-10px_rgba(200,16,46,.9)] md:hidden"
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
          onAdded={(id, c) => {
            setCred(c);
            /* ตามต้นแบบ: ล้างช่องค้นหาแล้วเลื่อนไปที่การ์ดของคนที่เพิ่งเพิ่ม
               กางทุกกลุ่มด้วย ไม่งั้นการ์ดอาจอยู่ในกลุ่มที่พับไว้จนเลื่อนไปไม่ถึง */
            justAdded.current = id;
            setQuery("");
            setOpen({ full: true, probat: true, intern: true });
          }}
        />
      )}

      {cred && (
        <CredentialsDialog title="เพิ่มพนักงานแล้ว" {...cred} onClose={() => setCred(null)} />
      )}

      {current && (
        <EmployeeDetail
          emp={current}
          today={today}
          onPass={() => setPassing(current.id)}
          onEdit={() => setEditing(current.id)}
          onLeave={() => setRemoving(current.id)}
          onClose={() => setViewing(null)}
        />
      )}

      {passEmp && (
        <PassDialog emp={passEmp} today={today} onClose={() => setPassing(null)} />
      )}

      {editEmp && (
        <EditDialog emp={editEmp} today={today} onClose={() => setEditing(null)} />
      )}
      {removeEmp && (
        <LeaveEmpDialog emp={removeEmp} onClose={() => setRemoving(null)} />
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
    <div className="he-fsheet fixed inset-0 z-[90] md:hidden" role="dialog" aria-modal="true" aria-label="ตัวกรอง">
      <div className="absolute inset-0 bg-[rgba(40,20,25,.4)]" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-[26px] bg-white shadow-[0_-10px_30px_-10px_rgba(40,20,25,.35)]">
        <div className="flex flex-none items-center justify-between px-[18px] pt-[18px] pb-1">
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
/* การ์ดรายชื่อโชว์ชื่อเล่นเป็นชื่อหลัก ไม่มีชื่อเล่นค่อยใช้ชื่อ-สกุล — ชื่อจริงดูในหน้าประวัติ (ผู้ใช้สั่ง 13 ต.ค. 2569) */
function cardName(emp: Employee) {
  return emp.nick?.trim() || emp.name;
}

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

/*
 * การ์ดพนักงานบนมือถือ (ต้นแบบ hr-employees.html .elist .erow ใน <style id="he-mobile"> · ผู้ใช้สั่ง 13 ต.ค. 2569)
 * รูปกลม 52px | ชื่อ + ป้ายสถานะ / ตำแหน่ง / แผนก · แถวชิปคั่นเส้นประ · บรรทัดท้ายเป็นประเภทพนักงาน หรือวงแหวนทดลองงาน
 * ไม่มีเมนูสามจุด — แก้ไข / พ้นสภาพ อยู่ที่แถบล่างของกล่องประวัติบนมือถือ
 * ชิปแผนกของต้นแบบถูกซ่อน (ซ้ำกับบรรทัดแผนก) จึงไม่ใส่ตั้งแต่แรก
 */
function MobileEmpCard({
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
  const on = emp.status === "active";
  const prob = emp.type === "probat" && on;
  const left = prob ? probDaysLeft(emp.startedAt, today) : null;
  const pct = prob ? probPct(emp.startedAt, today) : 0;
  const col = probColor(pct);
  const r = 23;
  const c = 2 * Math.PI * r;
  const more = (emp.posMore ?? []).map((v) => hrPos(v).label).join(" · ");

  return (
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
      aria-label={`ดูประวัติของ ${cardName(emp)}`}
      data-emp-id={emp.id}
      className={`m-he-card${emp.status === "left" ? " dim" : ""}`}
    >
      {/* ยังไม่มีรูปจริงของพนักงาน — กรอบว่างไอคอนคน ไม่เอารูปคนอื่นมาแทน */}
      <span className="m-he-photo" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="9" r="3.4" />
          <path d="M4.5 20c0-3.8 3.4-6.2 7.5-6.2s7.5 2.4 7.5 6.2" />
        </svg>
      </span>
      <span className="m-he-top2">
        <b>
          <Mark text={cardName(emp)} query={query} />
        </b>
        <span className={`m-he-st ${on ? "on" : "off"}`}>
          <i />
          {HR_STATUS[emp.status].label}
        </span>
      </span>
      <span className="m-he-role">
        {p.label}
        {more && ` · ควบ ${more}`}
      </span>
      <span className="m-he-dept">{hrDept(p.dept).label}</span>
      <span className="m-he-chips2">
        <span>เริ่ม {thaiDate(emp.startedAt)}</span>
        <span>
          {emp.leftAt ? "ทำงานรวม " : "ทำงานมาแล้ว "}
          {empYears(emp.startedAt, today, emp.leftAt)}
        </span>
        {left !== null &&
          (left < 0 ? (
            <span className="late">เลยกำหนดทดลองงาน {Math.abs(left)} วัน</span>
          ) : (
            <span className="due">ครบกำหนด{left === 0 ? "วันนี้" : `อีก ${left} วัน`}</span>
          ))}
        {emp.status === "left" && <span className="late">พ้นสภาพ {emp.leftAt ? thaiDate(emp.leftAt) : "—"}</span>}
      </span>
      <span className="m-he-eside">
        {prob ? (
          <>
            {/* วงแหวน = ผ่าน "ช่วงเวลา" ทดลองงานมากี่ส่วน ไม่ใช่คะแนนผลงาน */}
            <span className="m-he-donut" role="img" aria-label={`ผ่านช่วงทดลองงานแล้ว ${pct} เปอร์เซ็นต์`}>
              <svg width="56" height="56" viewBox="0 0 56 56">
                <circle className="ring" cx="28" cy="28" r={r} />
                {pct > 0 && (
                  <circle
                    className="val"
                    cx="28"
                    cy="28"
                    r={r}
                    style={{ stroke: col }}
                    strokeDasharray={`${((c * pct) / 100).toFixed(2)} ${(c - (c * pct) / 100).toFixed(2)}`}
                  />
                )}
              </svg>
              <b style={{ color: col }}>{pct}%</b>
            </span>
            <p>ผ่านช่วงทดลองงาน</p>
          </>
        ) : (
          <p>{HR_EMPTYPE[emp.type].label}</p>
        )}
      </span>
    </div>
  );
}

/*
 * การ์ดพนักงานแนวตั้ง เรียงเป็นกริด (ต้นแบบ hr-employees-grid.html · ผู้ใช้สั่ง 6 ต.ค. 2569)
 * รูปวงกลมใช้อักษรแรกของชื่อ (ข้ามสระหน้า เ แ โ ใ ไ) ยังไม่มีรูปจริงของพนักงาน
 * ป้ายขึ้นเฉพาะคนที่ต้องจับตา — ทดลองงานที่ยังอยู่ และคนที่พ้นสภาพ
 */
function EmpCard({
  emp,
  query,
  today,
  onOpen,
  onEdit,
  onDelete,
}: {
  emp: Employee;
  query: string;
  today: string;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  /* เมนูสามจุด — แก้ไข / ลบ (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (ev: MouseEvent) => {
      if (!menuRef.current?.contains(ev.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  const p = hrPos(emp.pos);
  const on = emp.status === "active";
  const left = emp.type === "probat" && on ? probDaysLeft(emp.startedAt, today) : null;
  /* อักษรย่อจากชื่อเล่น ให้ตรงกับชื่อที่โชว์บนการ์ด (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  const ini = cardName(emp).replace(/^[เแโใไ]/, "").charAt(0) || "?";

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
      aria-label={`ดูประวัติของ ${cardName(emp)}`}
      data-emp-id={emp.id}
      className={`group/card relative flex cursor-pointer flex-col gap-3.5 rounded-[20px] border border-[#ECEEF2] bg-card px-[18px] pt-[18px] pb-4 shadow-[0_1px_2px_rgba(28,20,45,.03)] transition-[box-shadow,transform,border-color] hover:-translate-y-0.5 hover:border-[#E4C7CC] hover:shadow-[0_10px_26px_-12px_rgba(28,20,45,.18)] max-sm:hover:translate-y-0 ${
        on ? "" : "opacity-60"
      }`}
    >
      <div className="relative flex justify-center pt-1">
        <span className="relative size-[68px] flex-none">
          <span
            className="flex size-[68px] items-center justify-center rounded-full bg-[#FDECEE] text-[24px] font-bold text-primary"
            aria-hidden="true"
          >
            {ini}
          </span>
          <i
            className={`absolute right-[3px] bottom-[3px] size-3.5 rounded-full border-[2.5px] border-white ${
              on ? "bg-[var(--success)]" : "bg-[#B5BAC4]"
            }`}
            title={on ? "ปฏิบัติงานอยู่" : "พ้นสภาพ"}
          />
        </span>
        <span ref={menuRef} className="absolute -top-1.5 -right-1.5 z-10">
          <button
            type="button"
            aria-label={`ตัวเลือกของ ${cardName(emp)}`}
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={(ev) => {
              ev.stopPropagation();
              setMenu((v) => !v);
            }}
            onKeyDown={(ev) => ev.stopPropagation()}
            className="flex h-7 w-8 items-center justify-center rounded-lg text-foreground hover:bg-[#F6F7F9]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.9" />
              <circle cx="12" cy="12" r="1.9" />
              <circle cx="19" cy="12" r="1.9" />
            </svg>
          </button>
          {menu && (
            <span
              role="menu"
              className="absolute right-0 mt-1 block min-w-[130px] overflow-hidden rounded-[10px] border border-border bg-card py-1 text-left shadow-lg"
              style={{ top: "100%" }}
              onClick={(ev) => ev.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-3.5 py-2 text-[13px] font-semibold hover:bg-muted"
                onClick={() => {
                  setMenu(false);
                  onEdit();
                }}
              >
                แก้ไข
              </button>
              {/* ลบ = พ้นสภาพ ไม่ลบข้อมูลทิ้ง (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
              {emp.status !== "left" && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full px-3.5 py-2 text-[13px] font-semibold text-destructive hover:bg-muted"
                  onClick={() => {
                    setMenu(false);
                    onDelete();
                  }}
                >
                  พ้นสภาพ
                </button>
              )}
            </span>
          )}
        </span>
      </div>

      <div className="-mt-1 text-center">
        <b className="block text-[15px] leading-snug font-bold">
          <Mark text={cardName(emp)} query={query} />
        </b>
        <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
          {p.label}
          {/* ควบตำแหน่งอื่นด้วย — ตำแหน่งหลักยังเป็นตัวคิดเงินเดือนและสายอนุมัติ */}
          {(emp.posMore ?? []).length > 0 && ` · ควบ ${(emp.posMore ?? []).map((v) => hrPos(v).label).join(" · ")}`}
        </span>
        {left !== null && (
          <span
            className={`mt-[7px] inline-block rounded-[20px] px-[9px] py-0.5 text-[11px] font-semibold ${
              left < 0
                ? "bg-[var(--destructive-soft)] text-destructive"
                : "bg-[var(--warning-soft)] text-[var(--warning)]"
            }`}
          >
            {left < 0
              ? `เลยกำหนดทดลองงาน ${Math.abs(left)} วัน`
              : `ทดลองงาน · ครบกำหนด${left === 0 ? "วันนี้" : `อีก ${left} วัน`}`}
          </span>
        )}
        {emp.leftAt && (
          <span className="mt-[7px] inline-block rounded-[20px] bg-[#EFF0F3] px-[9px] py-0.5 text-[11px] font-semibold text-muted-foreground">
            พ้นสภาพ {thaiDate(emp.leftAt)}
          </span>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-3 rounded-[14px] bg-[#F6F7F9] px-3.5 py-[13px]">
        <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5">
          <dt className="text-[11.5px] leading-[18px] text-muted-foreground">แผนก</dt>
          <dt className="text-right text-[11.5px] leading-[18px] text-muted-foreground">วันเริ่มงาน</dt>
          <dd className="m-0 truncate text-[13px] leading-[22px] font-semibold">{hrDept(p.dept).label}</dd>
          <dd className="m-0 text-right text-[13px] leading-[22px] font-semibold whitespace-nowrap">
            {thaiDate(emp.startedAt)}
          </dd>
        </dl>
        <div className="flex flex-col gap-[7px] text-[12.5px]">
          <span className="flex min-w-0 items-center gap-[9px]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-muted-foreground" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <path d="m4 7 8 6 8-6" />
            </svg>
            <em className={`truncate not-italic ${emp.email ? "" : "text-muted-foreground"}`}>
              {emp.email || "ไม่มีอีเมล"}
            </em>
          </span>
          <span className="flex min-w-0 items-center gap-[9px]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-muted-foreground" aria-hidden="true">
              <path d="M5 4h3.5l1.6 4.2-2.2 1.4a11 11 0 0 0 6.5 6.5l1.4-2.2L20 15.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
            </svg>
            <em className={`truncate not-italic ${emp.phone ? "" : "text-muted-foreground"}`}>
              {emp.phone || "ไม่มีเบอร์โทร"}
            </em>
          </span>
        </div>
      </div>
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
    bankName: emp.bankName ?? "",
    bankNo: emp.bankNo ?? "",
    sosName: emp.sos.name,
    sosRel: emp.sos.rel,
    sosPhone: emp.sos.phone,
    boss: emp.boss,
  });
  const [docs, setDocs] = useState<DocKey[]>(emp.docs);
  const [pos, setPos] = useState<PosKey>(cur.pos);
  /* ตำแหน่งควบ — เจ้าของสั่ง 28 ก.ย. 2569 ให้หนึ่งคนถือได้หลายตำแหน่ง */
  const [posMore, setPosMore] = useState<PosKey[]>(emp.posMore ?? []);
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
      bankName: f.bankName.trim(),
      bankNo: f.bankNo.trim(),
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
                onChange={(e) => setF((x) => ({ ...x, sex: e.target.value }))}
              >
                {optionsOf("sex").map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </Field>
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
          </div>
        </Sect>

        {/* บัญชีรับเงินเดือน — ใช้ในตารางสรุปเงินเดือนที่ CEO ใช้โอน (ผู้ใช้สั่ง 16 ต.ค. 2569) */}
        <Sect title="บัญชีรับเงินเดือน">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="ธนาคาร">
              <Input value={f.bankName} onChange={set("bankName")} placeholder="เช่น กสิกรไทย" />
            </Field>
            <Field label="เลขที่บัญชี">
              <Input inputMode="numeric" value={f.bankNo} onChange={set("bankNo")} placeholder="xxx-x-xxxxx-x" />
            </Field>
          </div>
        </Sect>

        {/* ผู้ติดต่อฉุกเฉินแยกเป็นกล่องของตัวเอง ไม่ปนกับข้อมูลติดต่อทั่วไป (ผู้ใช้สั่ง 15 ต.ค. 2569) */}
        <Sect title="ผู้ติดต่อฉุกเฉิน">
          <div className="grid gap-3.5 sm:grid-cols-3">
            <Field label="ชื่อ">
              <Input value={f.sosName} onChange={set("sosName")} aria-label="ชื่อผู้ติดต่อฉุกเฉิน" />
            </Field>
            <Field label="ความสัมพันธ์">
              <Input value={f.sosRel} onChange={set("sosRel")} placeholder="เช่น มารดา" aria-label="ความสัมพันธ์" />
            </Field>
            <Field label="เบอร์โทร">
              <Input inputMode="tel" value={f.sosPhone} onChange={set("sosPhone")} aria-label="เบอร์โทรผู้ติดต่อฉุกเฉิน" />
            </Field>
          </div>
        </Sect>

        <Sect title="การจ้างงาน">

          <h4 className="mt-4 mb-2 text-[12.5px] font-semibold">ปรับตำแหน่ง / เงินเดือน</h4>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="ตำแหน่ง">
              <Select value={pos} onChange={(e) => setPos(e.target.value as PosKey)}>
                {hrDepts().map((d) => (
                  <optgroup key={d.v} label={d.label}>
                    {hrPositions().filter((x) => x.dept === d.v).map((x) => (
                      <option key={x.v} value={x.v}>
                        {x.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>

            {/* ไม่มีตำแหน่งควบ (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
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

          {/* พ้นสภาพเป็นปุ่ม ไม่ใช่ช่องติ๊ก (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
          <button
            type="button"
            className={`btn mt-4 ${left ? "glass-thin" : "glass-thin text-destructive"}`}
            onClick={() => setLeft((v) => !v)}
          >
            {left ? (emp.status === "left" ? "ยกเลิกพ้นสภาพ" : "ไม่พ้นสภาพ") : "พ้นสภาพพนักงาน"}
          </button>
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

/** วันก่อนหน้าของวันที่แบบ yyyy-mm-dd (ผู้ใช้สั่ง 13 ต.ค. 2569) */
function isoBefore(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return toIsoDate(new Date(y, m - 1, d - 1));
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
  /* ผ่านกลางรอบ — จ่ายแบบทดลองงานถึงวันตัดรอบ เงินเดือนเริ่มรอบถัดไป (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  const payFrom = at ? payFromAfterPass(at) : "";
  const payMonth = payFrom ? thaiMonth(cycleMonthOfDay(payFrom)) : "";
  const probUntil = payFrom && payFrom > at ? isoBefore(payFrom) : "";

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
          <Row k="ประเภทตอนนี้" v="ทดลองงาน จ่ายรายสัปดาห์" />
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
      {at && (
        <p className="mt-3 rounded-[11px] border border-border bg-muted/50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
          ประเภทเปลี่ยนเป็น <b className="text-foreground">พนักงานประจำ</b> ตั้งแต่ {thaiDate(at)}
          {probUntil && (
            <>
              {" "}
              · ค่าจ้างยังคิดแบบทดลองงาน (รายสัปดาห์) ถึงวันตัดรอบ <b className="text-foreground">{thaiDate(probUntil)}</b>
            </>
          )}
          <br />
          เริ่มคิดเงินเดือนรายเดือน
          {ok && (
            <>
              {" "}
              <b className="text-foreground">{baht(Number(raw))}</b> บาท
            </>
          )}{" "}
          ตั้งแต่รอบ <b className="text-foreground">{payMonth}</b> ({thaiDate(payFrom)} เป็นต้นไป)
          {ok && (
            <>
              {" "}
              · ค่าจ้างรายชั่วโมงสำหรับโอที {baht(Number(raw) / HR_OT_DIVISOR.days / HR_OT_DIVISOR.hours)} บาท
            </>
          )}
        </p>
      )}
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
 * กล่องสองขั้นแบบเดียวกับ "เพิ่มผู้สนใจ" ของฝ่ายขาย (ผู้ใช้สั่ง 15 ต.ค. 2569)
 * ขั้น 1 ข้อมูลพนักงาน + เอกสาร · ขั้น 2 สร้างบัญชีผู้ใช้
 * เอกสารไม่ครบก็บันทึกได้ แต่ต้องเห็นว่าขาดอะไร (S-5) จึงติ๊กเท่าที่ได้รับจริง
 * ค่าทั้งหมดอยู่ใน state ของกล่องนี้ ย้อนกลับไปขั้น 1 แล้วค่าที่กรอกไว้ยังอยู่ครบ
 */
const ADD_FORM_ID = "he-add-form";

function AddDialog({
  hr,
  today,
  onClose,
  onAdded,
}: {
  hr: HrState;
  today: string;
  onClose: () => void;
  onAdded?: (id: string, cred: { name: string; user: string; pass: string }) => void;
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
    bankName: "",
    bankNo: "",
    sosName: "",
    sosRel: "",
    sosPhone: "",
  });
  const [docs, setDocs] = useState<DocKey[]>([]);
  const [picker, setPicker] = useState<"" | "birth" | "start">("");
  const [warn, setWarn] = useState("");
  /* ขั้นของกล่อง + กรอบแดงแยกขั้น — เพิ่งผ่านขั้น 1 มา ขั้น 2 ยังไม่ควรแดง (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  const [step, setStep] = useState<1 | 2>(1);
  const [reached2, setReached2] = useState(false);
  const [tried1, setTried1] = useState(false);
  const [tried2, setTried2] = useState(false);
  /* บัญชีเข้าระบบสร้างพร้อมพนักงาน (ต้นแบบ hr-employees-grid.html · ผู้ใช้สั่ง 6 ต.ค. 2569)
     ชื่อผู้ใช้ตามชื่อที่พิมพ์ไปเรื่อย ๆ จนกว่าฝ่ายบุคคลจะแก้ช่องชื่อผู้ใช้เอง */
  const taken = hr.emp.filter((e) => e.account).map((e) => e.account!.user);
  const [user, setUser] = useState("");
  const [userEdited, setUserEdited] = useState(false);
  const [pass, setPass] = useState(tempPass);
  const [roles, setRoles] = useState<Role[]>([]);
  const shownUser = userEdited ? user : f.name.trim() ? suggestUser(f.name.trim(), taken) : "";

  const set =
    (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setF((v) => ({ ...v, [k]: e.target.value }));

  const salary = Number(f.salary.replace(/[^\d.]/g, ""));
  /*
   * รอบที่ปิดแล้วไม่รับคนเพิ่มไม่ว่ากรณีใด (ผู้ใช้กำหนด 23 ก.ย. 2569)
   * วันเริ่มงานต้องอยู่หลังวันสุดท้ายของรอบเงินเดือนที่ปิดล่าสุด
   * คนเข้าใหม่ย้อนหลังจริงให้จ่ายเป็นรายการปรับปรุงในรอบถัดไป ไม่ใช่ดันคนเข้ารอบที่ปิดไปแล้ว
   */
  const lock = lockedUntil(hr);
  const minStart = lock ? isoAfter(lock) : "";

  /* ช่องที่ยังไม่ผ่านของขั้น 1 — ขึ้นกรอบแดงพร้อมบอกใต้ช่อง (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  const name = f.name.trim();
  const err1 = {
    name: !name
      ? "กรอกชื่อและนามสกุล"
      : name.split(/\s+/).length < 2
        ? "กรอกทั้งชื่อและนามสกุล"
        : hr.emp.some((e) => e.name === name)
          ? "มีพนักงานชื่อนี้ในระบบแล้ว ตรวจสอบก่อนบันทึก"
          : "",
    start: !f.startedAt
      ? "เลือกวันเริ่มงาน"
      : minStart && f.startedAt < minStart
        ? `รอบเงินเดือนถึง ${thaiDate(lock!)} ปิดไปแล้ว วันเริ่มงานต้องตั้งแต่ ${thaiDate(minStart)} เป็นต้นไป · ถ้าเข้าใหม่ย้อนหลังจริง ให้จ่ายเป็นรายการปรับปรุงในรอบถัดไป`
        : "",
    /* นักศึกษาฝึกงานไม่มีช่องเงินเดือน จึงไม่ต้องตรวจ (ผู้ใช้สั่ง 15 ต.ค. 2569) */
    salary: f.type !== "intern" && !(salary > 0) ? "กรอกเงินเดือน" : "",
    phone: !f.phone.trim() ? "กรอกเบอร์โทร" : "",
  };
  const step1Blocked = Object.values(err1).some(Boolean);
  const login = shownUser.trim();
  const errUser =
    login.length < 4 ? "ชื่อผู้ใช้ต้องยาวอย่างน้อย 4 ตัวอักษร" : taken.includes(login) ? "ชื่อผู้ใช้นี้มีคนใช้แล้ว" : "";
  const e1 = (k: keyof typeof err1) => (tried1 ? err1[k] : "");
  const bad = "!border-destructive bg-[var(--destructive-soft)]";
  const hint = (msg: string) => (msg ? <span className="text-destructive">{msg}</span> : undefined);

  /** เลื่อนกล่องกลับขึ้นบนสุดตอนสลับขั้น */
  function scrollTop() {
    requestAnimationFrame(() => {
      document.getElementById(ADD_FORM_ID)?.closest(".ui-sheet-body")?.scrollTo({ top: 0 });
    });
  }

  /** พาไปช่องแรกที่ยังไม่ผ่าน — บนมือถือปุ่มอยู่ท้ายกล่อง ไม่เลื่อนไปให้จะดูเหมือนปุ่มเสีย */
  function focusMissing() {
    requestAnimationFrame(() => {
      const first = document.querySelector<HTMLElement>(`#${ADD_FORM_ID} [data-miss="1"]`);
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      (first?.matches("input,select,button") ? first : first?.querySelector<HTMLElement>("input,select,button"))?.focus();
    });
  }

  function next() {
    setTried1(true);
    setPicker("");
    if (step1Blocked) return focusMissing();
    setWarn("");
    setReached2(true);
    setStep(2);
    scrollTop();
  }

  function back() {
    setWarn("");
    setStep(1);
    scrollTop();
  }

  function save() {
    setTried2(true);
    /* กันไว้เผื่อขั้น 1 ยังไม่ผ่าน — พากลับไปขั้น 1 ก่อน */
    if (step1Blocked) {
      setTried1(true);
      setStep(1);
      setTimeout(focusMissing, 50);
      return;
    }
    if (errUser) return focusMissing();

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
      bankName: f.bankName.trim(),
      bankNo: f.bankNo.trim(),
      sos: { name: f.sosName.trim(), rel: f.sosRel.trim(), phone: f.sosPhone.trim() },
      docs: hrDocs().map((d) => d.v).filter((v) => docs.includes(v)),
      salary: f.type === "intern" ? 0 : salary,
    });
    /* TODO: ต่อ backend แล้วต้องบันทึกพนักงาน เอกสาร และบัญชีในธุรกรรมเดียว */
    if (id) createAccount(id, login, today, roles);
    onClose();
    if (id) onAdded?.(id, { name, user: login, pass });
  }

  const btn = "flex-1 justify-center sm:flex-none";

  return (
    <Sheet
      className="he-dlg"
      title="เพิ่มพนักงาน"
      mid
      steady
      onClose={onClose}
      subhead={<StepIndicator step={step} labels={["ข้อมูลพนักงาน", "สร้างบัญชีผู้ใช้"]} />}
      footer={
        step === 1 ? (
          <>
            <button key="cancel" type="button" className={`btn glass-thin ${btn}`} onClick={onClose}>
              ยกเลิก
            </button>
            <button key="next" type="button" className={`btn solid btn-solid ${btn}`} onClick={next}>
              ถัดไป
            </button>
          </>
        ) : (
          <>
            <button key="back" type="button" className={`btn glass-thin ${btn}`} onClick={back}>
              ย้อนกลับ
            </button>
            <button key="save" type="button" className={`btn solid btn-solid ${btn}`} onClick={save}>
              บันทึก
            </button>
          </>
        )
      }
    >
      <div id={ADD_FORM_ID} onClick={() => setPicker("")}>
        <div hidden={step !== 1} className={reached2 ? "step-in-back" : ""}>
          <Sect title="ข้อมูลตัวบุคคล">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="ชื่อและนามสกุล" required hint={hint(e1("name"))}>
                <Input
                  value={f.name}
                  onChange={set("name")}
                  placeholder="เช่น สมชาย ใจดี"
                  aria-label="ชื่อและนามสกุล"
                  aria-invalid={!!e1("name") || undefined}
                  data-miss={e1("name") ? "1" : undefined}
                  className={e1("name") ? bad : ""}
                />
              </Field>
              <Field label="ชื่อเล่น">
                <Input value={f.nick} onChange={set("nick")} placeholder="เช่น ชาย" aria-label="ชื่อเล่น" />
              </Field>
              <Field label="เพศ">
                <Select
                  value={f.sex}
                  aria-label="เพศ"
                  onChange={(e) => setF((x) => ({ ...x, sex: e.target.value }))}
                >
                  {optionsOf("sex").map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>
              </Field>
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
                <Select value={f.pos} onChange={(e) => set("pos")(e)} aria-label="ตำแหน่ง">
                  {hrPositions().map((p) => (
                    <option key={p.v} value={p.v}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="ประเภทการจ้าง">
                <Select value={f.type} onChange={set("type")} aria-label="ประเภทการจ้าง">
                  {(Object.keys(HR_EMPTYPE) as EmpType[]).map((k) => (
                    <option key={k} value={k}>
                      {HR_EMPTYPE[k].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="วันเริ่มงาน" required hint={hint(e1("start"))}>
                <div data-miss={e1("start") ? "1" : undefined}>
                  <ThaiDatePicker
                    value={f.startedAt}
                    min={minStart || undefined}
                    open={picker === "start"}
                    label="วันเริ่มงาน"
                    invalid={!!e1("start")}
                    onToggle={() => setPicker((v) => (v === "start" ? "" : "start"))}
                    onPick={(iso) => {
                      setF((v) => ({ ...v, startedAt: iso }));
                      setPicker("");
                    }}
                  />
                </div>
              </Field>
              {f.type !== "intern" && (
              <Field label="เงินเดือน" required hint={hint(e1("salary"))}>
                <Input
                  value={f.salary}
                  onChange={(e) => setF((v) => ({ ...v, salary: commaInput(e.target.value) }))}
                  inputMode="decimal"
                  placeholder="บาท"
                  className={`num ${e1("salary") ? bad : ""}`}
                  aria-label="เงินเดือน"
                  aria-invalid={!!e1("salary") || undefined}
                  data-miss={e1("salary") ? "1" : undefined}
                />
              </Field>
              )}
            </div>
          </Sect>

          <Sect title="การติดต่อ">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="เบอร์โทร" required hint={hint(e1("phone"))}>
                <Input
                  value={f.phone}
                  onChange={set("phone")}
                  inputMode="tel"
                  placeholder="08X-XXX-XXXX"
                  aria-label="เบอร์โทร"
                  aria-invalid={!!e1("phone") || undefined}
                  data-miss={e1("phone") ? "1" : undefined}
                  className={e1("phone") ? bad : ""}
                />
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

          {/* บัญชีรับเงินเดือน — ไม่บังคับ ว่างได้ ตารางสรุปเงินเดือนแสดง "—" (ผู้ใช้สั่ง 16 ต.ค. 2569) */}
          <Sect title="บัญชีรับเงินเดือน">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="ธนาคาร">
                <Input value={f.bankName} onChange={set("bankName")} placeholder="เช่น กสิกรไทย" aria-label="ธนาคาร" />
              </Field>
              <Field label="เลขที่บัญชี">
                <Input inputMode="numeric" value={f.bankNo} onChange={set("bankNo")} placeholder="xxx-x-xxxxx-x" aria-label="เลขที่บัญชี" />
              </Field>
            </div>
          </Sect>

          {/* ผู้ติดต่อฉุกเฉินเป็นกล่องของตัวเอง แยกจากข้อมูลติดต่อทั่วไป (ผู้ใช้สั่ง 15 ต.ค. 2569) */}
          <Sect title="ผู้ติดต่อฉุกเฉิน">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="ชื่อ">
                <Input value={f.sosName} onChange={set("sosName")} aria-label="ชื่อผู้ติดต่อฉุกเฉิน" />
              </Field>
              <Field label="ความสัมพันธ์">
                <Input value={f.sosRel} onChange={set("sosRel")} placeholder="เช่น มารดา" aria-label="ความสัมพันธ์" />
              </Field>
              <Field label="เบอร์โทร">
                <Input
                  value={f.sosPhone}
                  onChange={set("sosPhone")}
                  inputMode="tel"
                  aria-label="เบอร์โทรผู้ติดต่อฉุกเฉิน"
                />
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
          </Sect>
        </div>

        {/* ขั้น 2 — เดิมชื่อหัวข้อ "บัญชีเข้าระบบ" (ผู้ใช้สั่ง 15 ต.ค. 2569) */}
        <div hidden={step !== 2} className="step-in-next">
          <Sect title="สร้างบัญชีผู้ใช้">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="ชื่อผู้ใช้" required hint={hint(tried2 ? errUser : "")}>
                <Input
                  value={shownUser}
                  onChange={(e) => {
                    setUserEdited(true);
                    setUser(e.target.value);
                  }}
                  aria-label="ชื่อผู้ใช้"
                  aria-invalid={(tried2 && !!errUser) || undefined}
                  data-miss={tried2 && errUser ? "1" : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  className={`num ${tried2 && errUser ? bad : ""}`}
                />
              </Field>
              <Field label="รหัสผ่านชั่วคราว">
                <PassBox pass={pass} onNew={() => setPass(tempPass())} />
              </Field>
            </div>
            <p className="mt-3.5 mb-2 text-[12.5px] font-semibold text-muted-foreground">
              งานที่รับผิดชอบ
            </p>
            <RolePicker roles={roles} onChange={setRoles} onWarn={setWarn} />
          </Sect>
        </div>

        {warn && (
          <p className="mt-4 rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] px-3.5 py-2.5 text-[12.5px] text-destructive">
            {warn}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/** กล่องพ้นสภาพจากเมนูสามจุด — ระบุวันที่กับเหตุผล แล้วระงับบัญชีผู้ใช้ให้เอง (ผู้ใช้สั่ง 13 ต.ค. 2569) */
function LeaveEmpDialog({ emp, onClose }: { emp: Employee; onClose: () => void }) {
  const [at, setAt] = useState(todayIso());
  const [why, setWhy] = useState("");
  const [pick, setPick] = useState(false);
  const [tried, setTried] = useState(false);
  return (
    <Sheet
      title="พ้นสภาพพนักงาน"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid"
            onClick={() => {
              setTried(true);
              if (!at || !why.trim()) return;
              setEmpLeft(emp.id, at, why.trim());
              onClose();
            }}
          >
            ยืนยันพ้นสภาพ
          </button>
        </>
      }
    >
      <p className="mb-3 text-[13.5px]">
        <b>{emp.name}</b>
      </p>
      <Field label="วันที่พ้นสภาพ" required>
        <ThaiDatePicker
          value={at}
          open={pick}
          label="วันที่พ้นสภาพ"
          onToggle={() => setPick((v) => !v)}
          onPick={(iso) => {
            setAt(iso);
            setPick(false);
          }}
        />
      </Field>
      <Field label="เหตุผล" required hint={tried && !why.trim() ? <span className="text-destructive">ระบุเหตุผล</span> : undefined}>
        <Input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="เช่น ลาออก · หมดสัญญา" />
      </Field>
    </Sheet>
  );
}
