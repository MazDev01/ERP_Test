"use client";

/*
 * รายงานฝ่ายบุคคล — สรุปการลา มาสาย และทำงานล่วงเวลา ที่ HR สรุปส่ง CEO (ตามต้นแบบ hr-report.html)
 *
 * ข้อมูลชุดเดียวกับหน้าสรุปเวลาทำงาน อ่านผ่านสะพาน useHrTime() ใบลาใบโอทีที่อนุมัติจริงจึงมาด้วย
 * ช่วงเวลาใช้รอบตัดวันที่เดียวกับการคิดเงินเดือน — รอบเดือน M คือวันถัดจากวันตัดของเดือนก่อน ถึงวันตัดของเดือน M
 * ส่วน "ทั้งปี" คือ 26 ธ.ค. ของปีก่อน ถึง 25 ธ.ค. ของปีนั้น (ต่อรอบกันพอดี ไม่มีวันตกหล่น)
 *
 * นับทุกคนในทะเบียน รวมคนที่พ้นสภาพแล้ว (แดชบอร์ดฝ่ายบุคคลนับเฉพาะคนที่ยังอยู่ ตัวเลขจึงน้อยกว่าที่นี่) — ต้นแบบกรองเฉพาะสถานะ resigned ซึ่งไม่มีในทะเบียน
 * คนที่ออกไปแล้วจึงยังอยู่ในรายงานย้อนหลังของรอบที่เขายังทำงานอยู่
 *
 * TODO: อ่านจริงจาก attendance_record, leave_request, overtime_request ที่อนุมัติแล้ว
 */

import { useMemo, useState } from "react";
import { thaiDate, TH_MONTHS_FULL } from "@/lib/format";
import { hrCutDay, hrCycle, hrDept, hrPos, type Cycle, type TimeRec } from "@/lib/hr-data";
import { useHr } from "@/lib/hr-store";
import { useHrTime } from "@/lib/hr-link";
import { downloadCsv, toCsv } from "@/lib/report-export";
import { PhoneCard, PhoneList } from "./acchr-phone";

type By = "emp" | "dept" | "pos";
type Row = {
  name: string;
  n: number;
  personal: number;
  vacation: number;
  sick: number;
  lateN: number;
  lateMin: number;
  ot: number;
};

const HEAD: Record<By, string> = { emp: "พนักงาน", dept: "แผนก", pos: "ตำแหน่ง" };
const COLS = ["คน", "ลากิจ (วัน)", "ลาพักร้อน (วัน)", "ลาป่วย (วัน)", "มาสาย (ครั้ง)", "มาสาย (นาที)", "OT (ชม.)"];

const pad = (n: number) => (n < 10 ? "0" : "") + n;
/** ทศนิยมไม่เกินสองตำแหน่ง ตัดศูนย์ท้ายทิ้ง — แบบเดียวกับต้นแบบ */
const num = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const monthLabel = (m: string) => `รอบ${TH_MONTHS_FULL[Number(m.slice(5, 7)) - 1]} ${Number(m.slice(0, 4)) + 543}`;

/** "m:2026-08" → รอบเดือน · "y:2026" → 26 ธ.ค. 2025 ถึง 25 ธ.ค. 2026 */
function rangeOf(v: string): Cycle {
  if (v.startsWith("m:")) return hrCycle(v.slice(2));
  const y = Number(v.slice(2));
  const cut = hrCutDay();
  return { from: `${y - 1}-12-${pad(cut + 1)}`, to: `${y}-12-${pad(cut)}` };
}

function sumFor(t: TimeRec | undefined, r: Cycle) {
  const o = { personal: 0, vacation: 0, sick: 0, lateN: 0, lateMin: 0, ot: 0 };
  const inR = (d: string) => d >= r.from && d <= r.to;
  for (const x of t?.leave ?? []) if (inR(x.d)) o[x.type] += x.span === "half" ? 0.5 : 1;
  for (const x of t?.late ?? [])
    if (inR(x.d)) {
      o.lateN++;
      o.lateMin += x.min || 0;
    }
  for (const x of t?.ot ?? []) if (inR(x.d)) o.ot += x.h || 0;
  return o;
}

export function HrReportPage() {
  const hr = useHr();
  const time = useHrTime();

  /* รอบล่าสุดขึ้นก่อน แล้วต่อด้วยทั้งปี — ปีมาจากรอบที่มีจริงเท่านั้น */
  const options = useMemo(() => {
    const months = hr.periods.map((p) => p.month).sort().reverse();
    const years = [...new Set(months.map((m) => m.slice(0, 4)))].sort().reverse();
    return [
      ...months.map((m) => ({ v: `m:${m}`, label: monthLabel(m) })),
      ...years.map((y) => ({ v: `y:${y}`, label: `ทั้งปี ${Number(y) + 543}` })),
    ];
  }, [hr.periods]);

  /* คนที่ยังอยู่วันนี้ — ใช้บอกว่ายอดรวมของหน้านี้ต่างจากแดชบอร์ดฝ่ายบุคคลเพราะอะไร */
  const activeCount = hr.emp.filter((e) => e.status === "active").length;

  const [sel, setSel] = useState(options[0]?.v ?? "");
  const [by, setBy] = useState<By>("emp");
  const r = useMemo(() => rangeOf(sel), [sel]);

  const rows = useMemo(() => {
    const g = new Map<string, Row>();
    for (const e of hr.emp) {
      const pos = hrPos(e.pos);
      const key = by === "emp" ? e.id : by === "dept" ? pos.dept : e.pos;
      const name =
        by === "emp" ? `${e.name} (${pos.label})` : by === "dept" ? hrDept(pos.dept)?.label || pos.dept || "—" : pos.label;
      const a = g.get(key) ?? { name, n: 0, personal: 0, vacation: 0, sick: 0, lateN: 0, lateMin: 0, ot: 0 };
      const s = sumFor(time[e.id], r);
      a.n++;
      a.personal += s.personal;
      a.vacation += s.vacation;
      a.sick += s.sick;
      a.lateN += s.lateN;
      a.lateMin += s.lateMin;
      a.ot += s.ot;
      g.set(key, a);
    }
    /* คนที่มาสายและทำโอทีมากที่สุดขึ้นก่อน — ชั่วโมงโอทีคิดเป็นนาทีให้ชั่งน้ำหนักเท่ากัน */
    return [...g.values()].sort(
      (a, b) => b.lateMin + b.ot * 60 - (a.lateMin + a.ot * 60) || a.name.localeCompare(b.name, "th"),
    );
  }, [hr.emp, time, by, r]);

  const tot: Row = rows.reduce(
    (t, a) => ({
      name: t.name,
      n: t.n + a.n,
      personal: t.personal + a.personal,
      vacation: t.vacation + a.vacation,
      sick: t.sick + a.sick,
      lateN: t.lateN + a.lateN,
      lateMin: t.lateMin + a.lateMin,
      ot: t.ot + a.ot,
    }),
    { name: "รวมทั้งทะเบียน (รวมผู้พ้นสภาพ)", n: 0, personal: 0, vacation: 0, sick: 0, lateN: 0, lateMin: 0, ot: 0 },
  );

  function exportCsv() {
    const lines: (string | number)[][] = [
      [HEAD[by], ...COLS],
      ...rows.map((a) => [a.name, a.n, a.personal, a.vacation, a.sick, a.lateN, a.lateMin, a.ot]),
    ];
    downloadCsv(`hr-report-${sel.replace(":", "-")}.csv`, toCsv(lines));
  }

  return (
    <div className="space-y-4">
      <div className="bar">
        <div>
          <h1>รายงาน</h1>
          {/* บอกฐานที่นับไว้ตรงนี้ — หน้านี้นับทั้งทะเบียนรวมผู้พ้นสภาพ ส่วนแดชบอร์ดฝ่ายบุคคลนับเฉพาะคนที่ยังอยู่
              ตัวเลขสองหน้าจึงไม่เท่ากันโดยตั้งใจ ไม่ใช่ขัดกัน */}
          <p>
            สรุปการลา มาสาย และทำงานล่วงเวลา · {thaiDate(r.from)} – {thaiDate(r.to)}
            <br />
            นับทั้งทะเบียน {hr.emp.length} คน — คนที่ยังอยู่ {activeCount} คน · พ้นสภาพแล้ว{" "}
            {hr.emp.length - activeCount} คน
          </p>
        </div>
        <div className="tools w-full flex-wrap items-end sm:w-auto">
          <label className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
            <span className="text-[12px] font-semibold text-muted-foreground">ช่วงเวลา</span>
            <select
              value={sel}
              onChange={(e) => setSel(e.target.value)}
              className="field-control h-10 w-full cursor-pointer text-[13.5px] sm:w-[190px]"
            >
              {options.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
            <span className="text-[12px] font-semibold text-muted-foreground">สรุปตาม</span>
            <select
              value={by}
              onChange={(e) => setBy(e.target.value as By)}
              className="field-control h-10 w-full cursor-pointer text-[13.5px] sm:w-[150px]"
            >
              <option value="emp">รายคน</option>
              <option value="dept">รายแผนก</option>
              <option value="pos">รายตำแหน่ง</option>
            </select>
          </label>
          <button type="button" onClick={exportCsv} className="btn glass-thin shrink-0 max-sm:basis-full!">
            ส่งออก CSV
          </button>
        </div>
      </div>

      <section className="panel glass flex min-w-0 flex-col">
        <div className="scroll-stable min-h-0 flex-1 overflow-auto max-sm:hidden">
          <table className="data-table cards-sm min-w-[860px]">
            <thead>
              <tr>
                <th>{HEAD[by]}</th>
                {COLS.map((c) => (
                  <th key={c} className="r">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <ReportRow key={a.name} a={a} head={HEAD[by]} />
              ))}
            </tbody>
            <tfoot>
              <ReportRow a={tot} head={HEAD[by]} total />
            </tfoot>
          </table>
        </div>

        {/* มือถือ: ยอดรวมทั้งหมดขึ้นก่อนเป็นการ์ดเด่น แล้วตามด้วยการ์ดย่อของแต่ละแถว */}
        <PhoneList>
          <ReportCard a={tot} total />
          {rows.map((a) => (
            <ReportCard key={a.name} a={a} />
          ))}
        </PhoneList>
      </section>
    </div>
  );
}

function ReportCard({ a, total }: { a: Row; total?: boolean }) {
  return (
    <PhoneCard
      title={a.name}
      amount={`${a.n} คน`}
      alert={total}
      stats={[
        { label: "ลากิจ (วัน)", value: num(a.personal), muted: !a.personal },
        { label: "ลาพักร้อน (วัน)", value: num(a.vacation), muted: !a.vacation },
        { label: "ลาป่วย (วัน)", value: num(a.sick), muted: !a.sick },
        { label: "มาสาย (ครั้ง)", value: a.lateN, muted: !a.lateN },
        { label: "มาสาย (นาที)", value: num(a.lateMin), muted: !a.lateMin },
        { label: "OT (ชม.)", value: num(a.ot), muted: !a.ot },
      ]}
    />
  );
}

function ReportRow({ a, head, total }: { a: Row; head: string; total?: boolean }) {
  const cells = [a.n, num(a.personal), num(a.vacation), num(a.sick), a.lateN, num(a.lateMin), num(a.ot)];
  return (
    <tr className={total ? "font-bold" : undefined}>
      <td data-label={head}>{a.name}</td>
      {cells.map((v, i) => (
        <td key={COLS[i]} data-label={COLS[i]} className="r num">
          {v}
        </td>
      ))}
    </tr>
  );
}
