"use client";

/*
 * เวลาเข้างาน — ฝ่ายบุคคลดูเวลาเข้า-ออกงานรายวันของทุกคน รวมนักศึกษาฝึกงาน (ผู้ใช้สั่ง 30 ต.ค. 2569)
 * ดูอย่างเดียว ไม่เกี่ยวกับการปิดรอบ — การแก้เวลาและปิดรอบยังอยู่ที่ "รอบเงินเดือน" เหมือนเดิม
 * เวลาของแต่ละวันคิดด้วย dayTimes ตัวเดียวกับกล่องรายวันของหน้าสรุปเวลาทำงาน ตัวเลขจึงตรงกันเสมอ
 */

import { useState } from "react";
import { HR_EMPTYPE, daysOfIn, hrPos, recInRange, type EmpType, type Employee } from "@/lib/hr-data";
import { useHr } from "@/lib/hr-store";
import { useHrTime, usePunchTimes } from "@/lib/hr-link";
import { scheduleFor } from "@/lib/work-schedule";
import { minutesOfDay } from "@/lib/work-schedule";
import { thaiDate, todayIso } from "@/lib/format";
import { dayTimes } from "./hr-timesheet-page";
import { DateField } from "./thai-date-picker";
import { Sheet } from "./lead-dialogs";
import { SearchBox } from "./sales-ui";
import { Select } from "./ui";

type Status = { label: string; tone: "ok" | "warn" | "bad" | "muted" };

function statusOf(e: Employee, d: string, t: { in: string; out: string }, leave: boolean, today: string): Status {
  if (leave && !t.in) return { label: "ลา", tone: "muted" };
  if (!t.in && !t.out) return { label: "ไม่ได้ลงเวลา", tone: "bad" };
  const late = t.in ? minutesOfDay(t.in) - minutesOfDay(scheduleFor(e).start) : 0;
  if (!t.out) return d === today ? { label: "ยังไม่ออกงาน", tone: "muted" } : { label: "ไม่ได้ลงออก", tone: "bad" };
  if (late > 0) return { label: `สาย ${late} นาที`, tone: "warn" };
  return { label: "ตรงเวลา", tone: "ok" };
}

const TONE: Record<Status["tone"], string> = {
  ok: "bg-[#E7F5EE] text-[#14875A]",
  warn: "bg-[var(--warning-soft)] text-[var(--warning)]",
  bad: "bg-[var(--destructive-soft)] text-destructive",
  muted: "bg-muted text-muted-foreground",
};

function Badge({ s }: { s: Status }) {
  return <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap ${TONE[s.tone]}`}>{s.label}</span>;
}

export function HrAttendancePage() {
  const hr = useHr();
  const time = useHrTime();
  const punch = usePunchTimes();
  const today = todayIso();
  const [day, setDay] = useState(today);
  const [type, setType] = useState<"" | EmpType>("");
  const [q, setQ] = useState("");
  const [viewing, setViewing] = useState<Employee | null>(null);

  /* วันของคนนี้ — วันทำงานที่ยังอยู่ในบริษัท คิดเวลาแบบหน้าสรุปเวลา · วันหยุดแสดงเฉพาะที่ตอกจริง */
  const rowOf = (e: Employee, d: string) => {
    const c = { from: d, to: d };
    const rec = recInRange(time, e.id, c);
    const fixes = hr.time[e.id]?.fix ?? [];
    const work = daysOfIn(e, c).length > 0;
    const real = fixes.find((x) => x.d === d) ?? punch[e.id]?.[d];
    if (!work && !real) return null;
    const t = work ? dayTimes(e, rec, fixes, punch[e.id], d) : { in: real!.in, out: real!.out };
    /* วันนี้ยังไม่จบวัน — เวลาออกมีเฉพาะที่ตอกจริงแล้ว */
    const out = d === today && !real?.out ? "" : t.out;
    const leave = rec.leave.some((x) => x.d === d && x.span === "full");
    return { t: { in: t.in, out }, status: statusOf(e, d, { in: t.in, out }, leave, today) };
  };

  const people = hr.emp
    .filter((e) => e.startedAt <= day && (!e.leftAt || e.leftAt >= day))
    .filter((e) => !type || e.type === type)
    .filter((e) => !q.trim() || `${e.name} ${e.nick} ${hrPos(e.pos).label}`.includes(q.trim()))
    .map((e) => ({ e, r: rowOf(e, day) }))
    .filter((x) => x.r);

  return (
    <div className="space-y-4">
      <div className="bar">
        <div>
          <h1>เวลาเข้างาน</h1>
        </div>
        <div className="tools w-full flex-wrap sm:w-auto">
          <SearchBox value={q} onChange={setQ} placeholder="ค้นหาชื่อหรือตำแหน่ง" />
          {/* .field-control และ w-full ใน Select กว้าง 100% — คุมความกว้างที่กล่องครอบ ตัวกรองจึงอยู่แถวเดียวกัน */}
          <div className="min-w-0 flex-1 sm:w-[170px] sm:flex-none">
            <Select value={type} onChange={(e) => setType(e.target.value as "" | EmpType)} aria-label="ประเภทพนักงาน">
              <option value="">ทุกประเภท</option>
              {(Object.keys(HR_EMPTYPE) as EmpType[]).map((k) => (
                <option key={k} value={k}>
                  {HR_EMPTYPE[k].label}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-0 flex-1 sm:w-[170px] sm:flex-none">
            <DateField value={day} onChange={(v) => v && setDay(v)} max={today} label="วันที่" className="!h-9" />
          </div>
        </div>
      </div>

      <section className="glass overflow-hidden rounded-[18px]">
        <div className="scroll-stable overflow-auto">
          <table className="data-table cards-sm min-w-[760px]">
            <thead>
              <tr>
                <th className="c" style={{ width: 60 }}>ลำดับ</th>
                <th>พนักงาน</th>
                <th style={{ width: 150 }}>ประเภท</th>
                <th style={{ width: 120 }}>เข้างาน</th>
                <th style={{ width: 120 }}>ออกงาน</th>
                <th style={{ width: 160 }}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {people.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[13.5px] text-muted-foreground">
                    ไม่มีข้อมูลเวลาเข้างานของวันนี้
                  </td>
                </tr>
              ) : (
                people.map(({ e, r }, i) => (
                  <tr key={e.id} className="cursor-pointer" onClick={() => setViewing(e)}>
                    <td className="c num" data-label="ลำดับ">{i + 1}</td>
                    <td data-label="พนักงาน">
                      <b className="block text-[14px] font-semibold">{e.nick || e.name}</b>
                      <span className="block text-[12px] text-muted-foreground">{hrPos(e.pos).label}</span>
                    </td>
                    <td data-label="ประเภท" className="text-[13px]">{HR_EMPTYPE[e.type].label}</td>
                    <td data-label="เข้างาน" className="num text-[13.5px]">{r!.t.in || "—"}</td>
                    <td data-label="ออกงาน" className="num text-[13.5px]">{r!.t.out || "—"}</td>
                    <td data-label="สถานะ">
                      <Badge s={r!.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {viewing && <PersonMonth emp={viewing} day={day} rowOf={rowOf} onClose={() => setViewing(null)} />}
    </div>
  );
}

/** รายวันของเดือนที่เลือก ถึงวันนี้ — ดูอย่างเดียว */
function PersonMonth({
  emp,
  day,
  rowOf,
  onClose,
}: {
  emp: Employee;
  day: string;
  rowOf: (e: Employee, d: string) => { t: { in: string; out: string }; status: Status } | null;
  onClose: () => void;
}) {
  const today = todayIso();
  const [y, m] = day.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const days = Array.from({ length: last }, (_, i) => `${day.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`).filter(
    (d) => d <= today,
  );
  const rows = days.map((d) => ({ d, r: rowOf(emp, d) })).filter((x) => x.r);
  return (
    <Sheet
      title={`${emp.name} · ${thaiDate(day).replace(/^\d+\s/, "")}`}
      wide
      onClose={onClose}
      footer={
        <button type="button" className="btn glass-thin" onClick={onClose}>
          ปิด
        </button>
      }
    >
      <table className="data-table">
        <thead>
          <tr>
            <th>วันที่</th>
            <th style={{ width: 110 }}>เข้างาน</th>
            <th style={{ width: 110 }}>ออกงาน</th>
            <th style={{ width: 150 }}>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ d, r }) => (
            <tr key={d}>
              <td className="num text-[13.5px]">{thaiDate(d)}</td>
              <td className="num text-[13.5px]">{r!.t.in || "—"}</td>
              <td className="num text-[13.5px]">{r!.t.out || "—"}</td>
              <td>
                <Badge s={r!.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Sheet>
  );
}
