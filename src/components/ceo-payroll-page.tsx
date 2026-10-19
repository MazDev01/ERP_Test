"use client";

/*
 * ยอดเงินเดือน — CEO ดูอย่างเดียว (ผู้ใช้สั่ง 14 ต.ค. 2569)
 *
 * CEO อนุมัติ/ไม่อนุมัติยอดที่ฝ่ายบุคคลส่งมาได้ที่การ์ดของแต่ละรอบ (กลับมาใช้ ผู้ใช้สั่ง 19 ต.ค. 2569)
 * ไม่มีปุ่มแก้ไขตัวเลข — ไม่อนุมัติพร้อมเหตุผล ฝ่ายบุคคลแก้แล้วส่งใหม่
 *
 * ตัวเลขมาจาก usePayrollSumFn ตัวเดียวกับหน้า /hr/payroll — รอบที่ปิดแล้วอ่านยอดที่บันทึกไว้ ไม่คิดใหม่
 * กลุ่มทดลองงานคือรอบจ่ายรายสัปดาห์ (รอบรายวันเก่าด้วย) ที่วันสุดท้ายตกในรอบเดือนนี้ (dailyRoundsOfMonth ตัวเดียวกับต้นทุนแรงงานบนแดชบอร์ด)
 * ไม่แสดงรหัสพนักงาน (กติกาเจ้าของงาน) — ชื่อและตำแหน่งเท่านั้น
 */

import { nameOf } from "@/lib/emp-name";
import { useState, type ReactNode } from "react";
import { baht, thaiDate, thaiMonth, todayIso } from "@/lib/format";
import {
  dailyRoundsOfMonth,
  defaultHrMonth,
  hrCycle,
  hrPos,
  probRoundLabel,
  type CycleLine,
  type PayGroup,
  type CycleSum,
} from "@/lib/hr-data";
import { usePayrollAutoResubmit, usePayrollSumFn } from "@/lib/hr-link";
import { PayApproveBar } from "./ceo-pay-approve";
import { useHr } from "@/lib/hr-store";
import { MonthStepper, useUrlMonth } from "./hr-steps";
import { PayrollSummaryInline } from "./payroll-summary-sheet";
import { fmtLeave } from "@/lib/leave-data";

type Status = "calc" | "closed" | "published";

const STATUS: Record<Status, { label: string; cls: string }> = {
  calc: { label: "กำลังคำนวณ", cls: "t-early" },
  closed: { label: "ปิดรอบแล้ว", cls: "t-info" },
  published: { label: "เผยแพร่สลิปแล้ว", cls: "t-ok" },
};

/** รายได้เพิ่มเติมของคนหนึ่ง — ค่าคอม Incentive ค่าตำแหน่ง รายได้อื่นที่กรอกเอง และค่าใช้จ่ายคืน
    รายการหักที่กรอกเอง (adj) ย้ายไปอยู่ช่องรายการหัก (ผู้ใช้สั่ง 16 ต.ค. 2569) */
function extraOf(l: CycleLine) {
  return (l.com ?? 0) + (l.inc ?? 0) + (l.allow ?? 0) + (l.more ?? 0) + (l.reimb ?? 0);
}

/** รายการหักของคนหนึ่ง — ประกันสังคม มาสาย รายการหักที่กรอกเอง ภาษีหัก ณ ที่จ่าย */
function cutsOf(l: { ss: number; late: number; adj: number; wht?: number }) {
  return l.ss + l.late - l.adj + (l.wht ?? 0);
}

/** ยอดรวมย่อยจาก CycleSum ที่คำนวณมาแล้ว — แค่จัดกลุ่มตัวเลขเพื่อแสดง ไม่ได้คิดเงินเดือนใหม่ */
function totalsOf(sums: CycleSum[]) {
  const t = { n: 0, base: 0, ot: 0, extra: 0, reimb: 0, ss: 0, late: 0, other: 0, net: 0 };
  for (const s of sums) {
    t.n += s.n;
    t.base += s.base;
    t.ot += s.ot;
    t.extra += s.com + s.inc + s.allow + (s.more ?? 0);
    /* รายการหักที่กรอกเอง + ภาษีหัก ณ ที่จ่าย (ผู้ใช้สั่ง 16 ต.ค. 2569) */
    t.other += (s.wht ?? 0) - s.adj;
    t.reimb += s.reimb ?? 0;
    t.ss += s.ss;
    t.late += s.late;
    t.net += s.net;
  }
  return { ...t, gross: t.base + t.ot + t.extra };
}

export function CeoPayrollPage() {
  const hr = useHr();
  const sumOf = usePayrollSumFn();
  usePayrollAutoResubmit();
  const today = todayIso();
  const months = hr.periods.map((p) => p.month).sort();
  /* ลิงก์จากกระดิ่ง "ปิดรอบเงินเดือน … แล้ว" ส่ง ?m= มา */
  const urlMonth = useUrlMonth(months);
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked ?? (urlMonth || defaultHrMonth(months, today));

  if (!month)
    return (
      <div className="space-y-4">
        <h1 className="page-h1">ยอดเงินเดือน</h1>
        <p className="glass rounded-[14px] px-5 py-10 text-center text-[13px] text-muted-foreground">ยังไม่มีรอบเงินเดือน</p>
      </div>
    );

  const c = hrCycle(month);
  const payrun = hr.payruns.find((p) => p.month === month);
  const slip = hr.slips.find((s) => s.month === month);
  const monthSum = sumOf(month, "month");
  const monthStatus: Status = slip?.published ? "published" : payrun?.closed ? "closed" : "calc";
  const rounds = dailyRoundsOfMonth(hr.dailyRounds, month).map((r) => ({
    r,
    sum: sumOf(r.id, "day"),
    status: (r.published ? "published" : r.payClosedAt ? "closed" : "calc") as Status,
  }));
  const all = totalsOf([monthSum, ...rounds.map((x) => x.sum)]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-h1">ยอดเงินเดือน</h1>
        <div className="tools ml-auto">
          <MonthStepper months={months} value={month} onChange={setPicked} />
          {/* ปุ่ม "ตารางสรุปเงินเดือน" ย้ายเป็นตารางในการ์ดพนักงานประจำ (ผู้ใช้สั่ง 19 ต.ค. 2569) */}
        </div>
      </div>

      {/* ภาพรวมของรอบเดือน — รวมพนักงานประจำกับทุกรอบจ่ายของทดลองงานในเดือนนี้ */}
      <section className="glass rounded-[14px] px-5 py-4">
        <p className="text-[13px] text-muted-foreground">
          รอบ {thaiMonth(month)} · {thaiDate(c.from)} – {thaiDate(c.to)}
        </p>
        <Kpis t={all} />
      </section>

      <RoundCard
        title="พนักงานประจำ"
        sub={`รอบ ${thaiMonth(month)}`}
        status={monthStatus}
        sum={monthSum}
        runKey={month}
        group="month"
        sheet={<PayrollSummaryInline month={month} />}
      />

      <h2 className="pt-2 text-[15px] font-bold">ทดลองงาน (จ่ายรายสัปดาห์)</h2>
      {rounds.length === 0 ? (
        <p className="glass rounded-[14px] px-5 py-8 text-center text-[13px] text-muted-foreground">
          ยังไม่มีรอบจ่ายทดลองงานในรอบเดือนนี้
        </p>
      ) : (
        [...rounds]
          .reverse()
          .map(({ r, sum, status }) => (
            <RoundCard key={r.id} title="ทดลองงาน" sub={`รอบ ${probRoundLabel(r)}`} status={status} sum={sum} daily runKey={r.id} group="day" />
          ))
      )}
    </div>
  );
}

function Kpis({ t }: { t: ReturnType<typeof totalsOf> }) {
  const items: [string, string][] = [
    ["จำนวนคน", `${t.n} คน`],
    ["รายได้รวมก่อนหัก", baht(t.gross)],
    ["โอที", baht(t.ot)],
    ["Incentive/รายการเพิ่มเติม", baht(t.extra)],
    ["หักประกันสังคม", baht(t.ss)],
    ["หักมาสาย", baht(t.late)],
    ...(t.other ? ([["หักอื่น/ภาษีหัก ณ ที่จ่าย", baht(t.other)]] as [string, string][]) : []),
    ...(t.reimb > 0 ? ([["ค่าใช้จ่ายคืน", baht(t.reimb)]] as [string, string][]) : []),
  ];
  return (
    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <p className="truncate text-[12px] text-muted-foreground">{k}</p>
          <b className="num block text-[15px] font-semibold">{v}</b>
        </div>
      ))}
      <div className="col-span-2 min-w-0 sm:col-span-4">
        <p className="text-[12px] text-muted-foreground">ยอดจ่ายสุทธิ</p>
        <b className="num block text-[20px] font-bold text-primary">{baht(t.net)} บาท</b>
      </div>
    </div>
  );
}

function RoundCard({
  title,
  sub,
  status,
  sum,
  daily = false,
  runKey,
  group,
  sheet,
}: {
  title: string;
  sub: string;
  status: Status;
  sum: CycleSum;
  daily?: boolean;
  /** รอบและกลุ่มของการอนุมัติ — ยังไม่ปิดรอบเงินเดือนจึงมีแถบอนุมัติ (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  runKey: string;
  group: PayGroup;
  /** ตารางสรุปเงินเดือนในการ์ด (รอบเดือนของพนักงานประจำ) — แทนตารางรายคน ไม่ให้ซ้ำกัน (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  sheet?: ReactNode;
}) {
  const [open, setOpen] = useState(!daily);
  const st = STATUS[status];
  const t = totalsOf([sum]);
  return (
    <section className="glass rounded-[14px]">
      <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
        <b className="text-[14.5px] font-semibold">{title}</b>
        <span className="text-[13px] text-muted-foreground">{sub}</span>
        <span className={`tag ${st.cls} ml-auto`}>{st.label}</span>
      </div>
      <div className="px-5 pb-4">
        <Kpis t={t} />
      </div>
      {/* อนุมัติ/ไม่อนุมัติยอด — รอบที่ปิดแล้วแสดงสถานะอย่างเดียว (ผู้ใช้สั่ง 19 ต.ค. 2569) */}
      {sum.n > 0 && (
        <div className="border-t border-border px-5 py-3">
          <PayApproveBar runKey={runKey} group={group} sum={sum} />
        </div>
      )}
      {sum.n > 0 && sheet}
      {sum.n > 0 && !sheet && (
        <div className="border-t border-border px-5 py-3">
          <button
            type="button"
            className="btn glass-thin max-sm:!h-11 max-sm:w-full max-sm:justify-center"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? "ซ่อนรายชื่อ" : `ดูรายชื่อ ${sum.n} คน`}
          </button>
        </div>
      )}
      {open && sum.n > 0 && !sheet && <Lines sum={sum} daily={daily} />}
    </section>
  );
}

/* ตารางรายคน — บรรทัดชุดเดียวกับหน้า /hr/payroll (sum.lines) ยอดรวมท้ายตารางจึงตรงกับยอดของรอบ */
function Lines({ sum, daily }: { sum: CycleSum; daily: boolean }) {
  return (
    <>
      {/* จอคอม */}
      <div className="overflow-x-auto border-t border-border max-md:hidden">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead className="text-[12px] text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-5 py-2 text-left font-medium">พนักงาน</th>
              <th className="px-3 py-2 text-right font-medium">{daily ? "ค่าจ้างรายวัน" : "เงินเดือน"}</th>
              <th className="px-3 py-2 text-right font-medium">โอที</th>
              <th className="px-3 py-2 text-right font-medium">รายการเพิ่มเติม</th>
              <th className="px-3 py-2 text-right font-medium">รายการหัก</th>
              <th className="px-5 py-2 text-right font-medium">สุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {sum.lines.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-0">
                <td className="px-5 py-2">
                  <b className="block font-semibold">{nameOf(l.name)}</b>
                  <span className="text-[12px] text-muted-foreground">{hrPos(l.pos).label}</span>
                </td>
                <td className="num px-3 py-2 text-right">
                  {baht(l.base)}
                  {daily && (
                    <span className="block text-[11.5px] text-muted-foreground">
                      {fmtLeave(l.days)} × {baht(l.rate)}
                    </span>
                  )}
                </td>
                <td className="num px-3 py-2 text-right">{baht(l.ot)}</td>
                <td className="num px-3 py-2 text-right">{baht(extraOf(l))}</td>
                <td className="num px-3 py-2 text-right">
                  {baht(cutsOf(l))}
                  {l.late > 0 && (
                    <span className="block text-[11.5px] text-muted-foreground">มาสาย {baht(l.late)}</span>
                  )}
                </td>
                <td className="num px-5 py-2 text-right font-semibold">{baht(l.net)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted font-semibold">
              <td className="px-5 py-2">รวม {sum.n} คน</td>
              <td className="num px-3 py-2 text-right">{baht(sum.base)}</td>
              <td className="num px-3 py-2 text-right">{baht(sum.ot)}</td>
              <td className="num px-3 py-2 text-right">
                {baht(sum.com + sum.inc + sum.allow + (sum.more ?? 0) + (sum.reimb ?? 0))}
              </td>
              <td className="num px-3 py-2 text-right">{baht(cutsOf(sum))}</td>
              <td className="num px-5 py-2 text-right font-bold">{baht(sum.net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* มือถือ */}
      <ul className="divide-y divide-border border-t border-border text-[12.5px] md:hidden">
        {sum.lines.map((l) => (
          <li key={l.id} className="px-4 py-2.5">
            <div className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1">
                <b className="block truncate font-semibold">{nameOf(l.name)}</b>
                <em className="text-[11.5px] text-muted-foreground not-italic">{hrPos(l.pos).label}</em>
              </span>
              <span className="num flex-none font-semibold">{baht(l.net)}</span>
            </div>
            <p className="num mt-1 text-[11.5px] text-muted-foreground">
              {daily ? `${fmtLeave(l.days)} · ` : ""}ฐาน {baht(l.base)} · โอที {baht(l.ot)} · เพิ่ม {baht(extraOf(l))} · หัก{" "}
              {baht(cutsOf(l))}
            </p>
          </li>
        ))}
        <li className="flex items-baseline gap-3 bg-muted px-4 py-2">
          <b className="min-w-0 flex-1 font-semibold">รวม {sum.n} คน</b>
          <b className="num flex-none font-bold">{baht(sum.net)} บาท</b>
        </li>
      </ul>
    </>
  );
}
