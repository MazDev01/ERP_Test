"use client";

/*
 * แดชบอร์ดฝ่ายบุคคล (ตามต้นแบบ dose-erp-maz/hr-dashboard.html)
 *
 * ห้าส่วนตามต้นแบบ — การ์ดสรุปกำลังคน · การลาของนักศึกษาฝึกงาน · ภาพรวมกำลังคน · เงินเดือนรอบนี้ ·
 * งานที่ต้องดำเนินการ
 * ช่วงเวลาที่เลือกมีผลกับ "งานที่ต้องดำเนินการ" เท่านั้น กำลังคนเป็นยอด ณ วันนี้เสมอ
 * เพราะจำนวนพนักงานไม่ได้ขึ้นกับช่วงเวลาที่เลือก
 *
 * ทุกตัวเลขคำนวณสดจากข้อมูลจริงในระบบ ไม่มีตัวเลขที่กรอกซ้ำเข้ามาเอง
 */

import { displayName, initialOf } from "@/lib/emp-name";
import Link from "next/link";
import { useMemo, useState } from "react";
import { TH_MONTHS_SHORT, bkkStamp, daysBetween, thaiDate, toIsoDate, todayIso } from "@/lib/format";
import {
  empOf,
  hrCycle,
  hrDocs,
  hrDepts,
  hrPos,
  HR_EMPTYPE,
  HR_LEAVE_LABEL,
  defaultDailyRange,
  dailyRoundId,
  isDaily,
  probEnd,
  rangeLabel,
  type EmpType,
  type Employee,
} from "@/lib/hr-data";
import { optionsOf } from "@/lib/options";
import { decideInternLeave, useHr } from "@/lib/hr-store";
import { approveLeave, rejectLeave, useAllLeave } from "@/lib/leave-store";
import { fmtLeave } from "@/lib/leave-data"; // ลาแสดงเป็นชั่วโมง (ผู้ใช้สั่ง 19 ต.ค. 2569)
import { ROLE_EMPLOYEE } from "@/lib/hr-data";
import { payHref } from "./hr-steps";
import { UsersIcon, UserIcon, ClockIcon, ChartIcon } from "./icons";

/** ใกล้ครบกำหนดทดลองงานภายในกี่วันถึงจะเตือน */
const PROBATION_WARN_DAYS = 30;

/** ช่วงเวลาของงานที่ต้องดำเนินการ */
type Range = "m" | "q" | "y";

const RANGE_LABEL: Record<Range, string> = { m: "เดือนนี้", q: "ไตรมาส", y: "ปีนี้" };

/** สัดส่วนในโดนัทใช้สีแดงชุดเดิมไล่ความเข้ม ไม่เพิ่มสีใหม่เข้าระบบ */
const TYPE_ROWS: { key: EmpType; alpha: number }[] = [
  { key: "full", alpha: 1 },
  { key: "probat", alpha: 0.55 },
  { key: "intern", alpha: 0.25 },
];

export function HrDashboardPage() {
  const hr = useHr();
  const today = todayIso();
  const [range, setRange] = useState<Range>("m");

  /* รอบล่าสุดที่มีอยู่ ใช้เป็นกรอบอ้างอิงของเงินเดือน */
  const lastMonth = hr.periods[hr.periods.length - 1].month;
  const active = useMemo(() => hr.emp.filter((e) => e.status === "active"), [hr.emp]);
  const byType = (t: EmpType) => active.filter((e) => e.type === t);

  /* เรียงคนที่ใกล้ครบกำหนดที่สุดขึ้นก่อน เพราะนั่นคือคนที่ต้องตัดสินใจก่อน */
  const probation = active
    .filter((e) => e.type === "probat")
    .map((e) => ({ e, left: daysBetween(today, toIsoDate(probEnd(e.startedAt))) }))
    .sort((a, b) => a.left - b.left);
  const nearEnd = probation.filter((p) => p.left <= PROBATION_WARN_DAYS).length;

  const payClosed = hr.payruns.some((p) => p.month === lastMonth && p.closed);
  /* ช่วงวันจริงของรอบ — 26 ของเดือนก่อน ถึง 25 ของเดือนรอบ ไม่ใช่ 1–30 ของเดือนปฏิทิน */
  const payCycle = hrCycle(lastMonth);
  const span = rangeSpan(today, range);
  /* แยกการ์ดเงินเดือนเป็นพนักงานประจำ (รอบเดือน) กับทดลองงาน (รอบรายวัน) (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  const monthStaff = active.filter((e) => !isDaily(e)).length;
  const dayStaff = active.filter((e) => isDaily(e)).length;
  const dayRange = defaultDailyRange(hr.dailyRounds, today, (r) => !r.payClosedAt);
  const dayRound = hr.dailyRounds.find((r) => r.id === dailyRoundId(dayRange));
  const dayPaid = Boolean(dayRound?.payClosedAt);

  return (
    <div className="space-y-4">
      <div className="bar">
        <div>
          <h1>แดชบอร์ดฝ่ายบุคคล</h1>
          <p>ภาพรวมกำลังคนและงานที่ต้องดำเนินการ</p>
        </div>
        <div className="tools">
          <div className="seg" role="group" aria-label="ช่วงเวลา">
            {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                className={range === r ? "on" : ""}
                aria-pressed={range === r}
                onClick={() => setRange(r)}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {/* ทุกการ์ดนับ "คนที่ยังอยู่วันนี้" — หน้ารายงานนับทั้งทะเบียนรวมผู้พ้นสภาพ จึงได้ตัวเลขมากกว่า
            แต่ละใบจึงต้องบอกฐานที่นับไว้ในการ์ดเอง ไม่ให้ดูเหมือนตัวเลขขัดกันเอง */}
        <Kpi
          icon={<UsersIcon className="size-[17px]" />}
          skin="info"
          title="พนักงานปัจจุบัน"
          value={`${active.length} คน`}
          note={`ในทะเบียนทั้งหมด ${hr.emp.length} คน · พ้นสภาพแล้ว ${hr.emp.length - active.length} คน`}
        />
        <Kpi
          icon={<UserIcon className="size-[17px]" />}
          skin="won"
          title="พนักงานประจำ"
          value={`${byType("full").length} คน`}
          note={`จากคนที่ยังอยู่ ${active.length} คน`}
        />
        <Kpi
          icon={<ClockIcon className="size-[17px]" />}
          skin="warn"
          title="ทดลองงาน"
          value={`${byType("probat").length} คน`}
          note={
            nearEnd
              ? `ใกล้ครบกำหนด ${nearEnd} คน · จากคนที่ยังอยู่ ${active.length} คน`
              : `จากคนที่ยังอยู่ ${active.length} คน`
          }
          warn={nearEnd > 0}
        />
        <Kpi
          icon={<ChartIcon className="size-[17px]" />}
          skin="job"
          title="ฝึกงาน"
          value={`${byType("intern").length} คน`}
          note={`จากคนที่ยังอยู่ ${active.length} คน`}
        />
      </div>

      {/*
        โครงตาม mockup ชุด 24 ก.ย. 2569 (hr-dashboard.html) — เอาเฉพาะโครงหน้า ไม่เอาธีม clay
        แถวบน: ภาพรวมกำลังคน (กว้าง) + เงินเดือนรอบนี้ (แคบ)
        แถวล่าง: งานที่ต้องดำเนินการ · การลาของนักศึกษาฝึกงาน · คอลัมน์ขวา (เริ่มงานล่าสุด + สรุปทีม)
      */}
      {/* จอแคบตั้งคอลัมน์เป็น minmax(0,1fr) ไว้ชัด ๆ — ปล่อยเป็นคอลัมน์อัตโนมัติ ช่องจะกว้างตาม
          เนื้อหาที่ยาวที่สุด (ข้อความไทยตัดคำไม่ได้) แล้วดันทั้งแถวล้นออกนอกจอ */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-3.5 md:grid-cols-6 xl:grid-cols-8">
        <Panel title="ภาพรวมกำลังคน" className="md:col-span-4 xl:col-span-6">
          <PeopleDonut active={active} />
        </Panel>

        <Panel title="เงินเดือนรอบนี้" className="md:col-span-2">
          {/* สองส่วน: พนักงานประจำ (รอบเดือน) · ทดลองงาน (รอบจ่ายรายวัน) (ผู้ใช้สั่ง 13 ต.ค. 2569)
              รอบเดือนตัดวันที่ 25 ไม่ใช่เดือนปฏิทิน — บอกช่วงวันจริงไว้ด้วย (ตรงกับหน้าสลิปและหน้าคำนวณ) */}
          <PaySection
            title="พนักงานประจำ"
            total={monthStaff}
            done={payClosed}
            round={`รอบ ${shortMonth(lastMonth)}`}
            dates={`${thaiDate(payCycle.from)} – ${thaiDate(payCycle.to)}`}
            href="/hr/payroll?g=month"
          />
          <PaySection
            title="ทดลองงาน (จ่ายรายสัปดาห์)"
            total={dayStaff}
            done={dayPaid}
            round="รอบจ่าย"
            dates={rangeLabel(dayRange)}
            href={payHref("/hr/payroll", "daily", null, dayRange)}
            last
          />
        </Panel>

        <div className="md:col-span-3 h-full">
          <TodoTable
            active={active}
            probation={probation}
            hr={hr}
            lastMonth={lastMonth}
            span={span}
          />
        </div>

        <div className="md:col-span-3 h-full">
          <InternLeaveCard hr={hr} />
        </div>

        <div className="flex h-full flex-col gap-3.5 md:col-span-6 xl:col-span-2">
          <RecentStarters active={active} />
          <TeamNote active={active} today={today} />
        </div>
      </div>
    </div>
  );
}

/** ส่วนย่อยของการ์ดเงินเดือนรอบนี้ — หนึ่งกลุ่มการจ่าย (ผู้ใช้สั่ง 13 ต.ค. 2569) */
function PaySection({
  title,
  total,
  done,
  round,
  dates,
  href,
  last,
}: {
  title: string;
  total: number;
  done: boolean;
  round: string;
  dates: string;
  href: string;
  last?: boolean;
}) {
  return (
    <div className={last ? "mt-4 border-t border-border pt-4" : ""}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <span className="num text-[12px] text-muted-foreground">{total} คน</span>
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">
        {round} <span className="num">{dates}</span>
      </p>
      <ul className="mt-2 grid grid-cols-2 gap-2 text-[12.5px]">
        <li className="rounded-[10px] bg-muted/50 px-2.5 py-1.5">
          ดำเนินการแล้ว <b className="num block text-[15px]">{done ? total : 0}</b>
        </li>
        <li className="rounded-[10px] bg-muted/50 px-2.5 py-1.5">
          รอดำเนินการ <b className="num block text-[15px]">{done ? 0 : total}</b>
        </li>
      </ul>
      <Link href={href} className="btn glass-thin btn-mini mt-2.5 w-full justify-center" data-ceo-hide>
        จัดการเงินเดือน
      </Link>
    </div>
  );
}

/*
 * เริ่มงานล่าสุด — สี่คนที่เข้ามาใหม่ที่สุด (โครง mockup 24 ก.ย. 2569 การ์ด "เริ่มงานล่าสุด")
 * ฝ่ายบุคคลต้องรู้ว่าใครเพิ่งเข้า เพราะเป็นกลุ่มที่เอกสารยังไม่ครบและมีวันครบทดลองงานตามมา
 */
function RecentStarters({ active }: { active: Employee[] }) {
  const list = [...active].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, 4);
  return (
    <section className="glass flex flex-1 flex-col rounded-[14px] px-5 py-[18px]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold">เริ่มงานล่าสุด</h2>
        <Link href="/hr/employees" className="text-[12.5px] font-semibold text-primary" data-ceo-hide>
          ข้อมูลพนักงาน
        </Link>
      </div>
      <ul className="mt-2 flex-1 divide-y divide-border overflow-y-auto">
        {list.map((e) => (
          <li key={e.id} className="flex items-center gap-3 py-2.5">
            <span className="grid size-9 flex-none place-items-center rounded-[11px] bg-[var(--accent)] text-[12px] font-bold text-primary">
              {initialOf(e)}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[13px] font-semibold">{displayName(e)}</b>
              <em className="block truncate text-[11.5px] text-muted-foreground not-italic">
                {hrPos(e.pos).label} · {HR_EMPTYPE[e.type].label} · เริ่ม {thaiDate(e.startedAt)}
              </em>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/*
 * สรุปทีมสั้น ๆ ท้ายคอลัมน์ขวา (mockup เรียกการ์ดนี้ว่า cheer)
 * ไม่ใส่ภาพตกแต่งแบบ mockup — ธีมของระบบเป็นพื้นเรียบ ใช้สีหลักของบริษัทแทน
 */
function TeamNote({ active, today }: { active: Employee[]; today: string }) {
  const longest = [...active].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))[0];
  const years = longest ? Math.floor(daysBetween(longest.startedAt, today) / 365.25) : 0;
  return (
    <section className="rounded-[14px] bg-primary px-5 py-[18px] text-white">
      <b className="block text-[16px] leading-[1.35] font-bold">
        ทีม MAZ ตอนนี้มี {active.length} คน
      </b>
      <p className="mt-1.5 text-[12.5px] leading-[1.55] text-white/80">
        {longest
          ? `อยู่ด้วยกันนานที่สุดคือ ${displayName(longest)} ${years} ปีแล้ว`
          : "ยังไม่มีพนักงานในทะเบียน"}
      </p>
    </section>
  );
}

/** ช่วงวันของตัวเลือกช่วงเวลา — ใช้กรองเฉพาะงานที่มีกำหนด */
function rangeSpan(today: string, range: Range) {
  const d = new Date(`${today}T00:00:00`);
  const y = d.getFullYear();
  if (range === "y") return { from: toIsoDate(new Date(y, 0, 1)), to: toIsoDate(new Date(y, 11, 31)) };
  if (range === "q") {
    const q = Math.floor(d.getMonth() / 3) * 3;
    return { from: toIsoDate(new Date(y, q, 1)), to: toIsoDate(new Date(y, q + 3, 0)) };
  }
  return {
    from: toIsoDate(new Date(y, d.getMonth(), 1)),
    to: toIsoDate(new Date(y, d.getMonth() + 1, 0)),
  };
}

/** สัดส่วนพนักงานตามประเภท — ส่วนย่อยของก้อนเดียว จึงใช้โดนัทตามต้นแบบ */
function PeopleDonut({ active }: { active: Employee[] }) {
  const all = active.length || 1;
  const R = 60;
  const C = 2 * Math.PI * R;
  /* คิดความยาวส่วนโค้งและจุดเริ่มของแต่ละชั้นไว้ก่อนวาด จะได้ไม่ต้องสะสมค่าระหว่างวาด */
  const slices = TYPE_ROWS.reduce<
    { key: EmpType; alpha: number; n: number; len: number; start: number }[]
  >((acc, { key, alpha }) => {
    const n = active.filter((e) => e.type === key).length;
    const len = (C * n) / all;
    const start = acc.reduce((sum, x) => sum + x.len, 0);
    return [...acc, { key, alpha, n, len, start }];
  }, []);

  /*
   * จำนวนตามแผนก (โครง mockup 24 ก.ย. 2569) — แท่งเดียวแบ่งสีตามประเภทพนักงาน
   * ความยาวเทียบกับแผนกที่คนเยอะที่สุด จะได้เห็นว่ากำลังคนกองอยู่ที่ไหน
   */
  const depts = hrDepts().map((d) => {
    const list = active.filter((e) => hrPos(e.pos).dept === d.v);
    return { label: d.label, n: list.length, parts: TYPE_ROWS.map(({ key, alpha }) => ({
      key,
      alpha,
      n: list.filter((e) => e.type === key).length,
    })) };
  });
  const most = Math.max(1, ...depts.map((d) => d.n));

  /*
   * จำนวนตามเพศ — อ่านรายการเพศจากข้อมูลหลัก ไม่ใช่ค่าตายตัว (เจ้าของสั่ง 28 ก.ย. 2569)
   * เพิ่มเพศใหม่ที่ /admin/options แล้วภาพรวมนี้ต้องขึ้นให้ครบทุกเพศเอง
   * ค่าที่เคยบันทึกไว้แต่ถูกเอาออกจากรายการแล้ว ยังนับรวมไว้ท้ายสุด จำนวนคนจะได้ไม่หาย
   */
  const sexList = [...optionsOf("sex"), ...new Set(active.map((e) => e.sex).filter((v) => v && !optionsOf("sex").includes(v)))];
  const sexes = sexList.map((g) => ({ label: g, n: active.filter((e) => e.sex === g).length }));
  const mostSex = Math.max(1, ...sexes.map((x) => x.n));

  return (
    <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      {/* จอแคบ: วงกลมอยู่บน รายการอยู่ล่าง — ปล่อยให้ flex-wrap ตัดเองไม่ได้ผล
          เพราะความกว้างขั้นต่ำของรายการดันให้แผงทั้งใบกว้างเกินจอ */}
      {/* วงโดนัทอยู่กึ่งกลางคอลัมน์ รายการประเภทอยู่ใต้วง (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
      <div className="flex min-w-0 flex-col items-center gap-5">
      <span className="relative block size-[140px] flex-none">
        <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="สัดส่วนพนักงานตามประเภท">
          <circle cx="70" cy="70" r={R} fill="none" stroke="var(--muted)" strokeWidth="12" />
          {slices.map(({ key, alpha, n, len, start }) => (
            <circle
              key={key}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke="var(--primary)"
              strokeOpacity={alpha}
              strokeWidth="12"
              strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
              strokeDashoffset={(-start).toFixed(2)}
              transform="rotate(-90 70 70)"
            >
              <title>{`${HR_EMPTYPE[key].label} ${n} คน ${Math.round((n * 100) / all)}%`}</title>
            </circle>
          ))}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <b className="num text-[22px] leading-none font-extrabold">{active.length}</b>
          <em className="text-[11.5px] text-muted-foreground not-italic">คน</em>
        </span>
      </span>

      <ul className="w-full min-w-0 space-y-2.5 sm:min-w-[200px] sm:flex-1 sm:basis-[200px]">
        {slices.map(({ key, alpha, n }) => (
            <li key={key}>
              {/* ฝ่ายบุคคลกดไปหน้าพนักงานได้ · ในมุมมองของ CEO เป็นข้อความธรรมดา ไม่มีสีตอนชี้ (ต้นแบบ ceo-hr) */}
              <Link
                href="/hr/employees"
                className="flex items-center gap-3 rounded-[10px] border border-border px-4 py-3 hover:bg-muted [.ceo-view_&]:hover:bg-transparent"
              >
                <i
                  className="size-2.5 flex-none rounded-[3px] bg-primary"
                  style={{ opacity: alpha }}
                />
                <span className="min-w-0 flex-1 text-[13.5px]">
                  <b className="font-semibold">{HR_EMPTYPE[key].label}</b>
                  <em className="ml-1.5 text-[11.5px] text-muted-foreground not-italic">{n} คน</em>
                </span>
                <span className="num text-[17px] font-bold text-muted-foreground">
                  {Math.round((n * 100) / all)}%
                </span>
              </Link>
            </li>
        ))}
      </ul>
      </div>

      <div className="min-w-0">
        {/* หัวข้อย่อยจางลงให้อ่านเป็นป้าย ไม่ใช่ข้อมูล (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
        <h3 className="mb-2 text-[12px] font-normal text-muted-foreground/70">จำนวนตามแผนก</h3>
        {depts.map((d) => (
          <div
            key={d.label}
            className="grid grid-cols-[110px_minmax(0,1fr)_30px] items-center gap-3 py-[7px] sm:grid-cols-[150px_minmax(0,1fr)_34px]"
          >
            <span className="truncate text-[13px]">{d.label}</span>
            <span className="flex h-2 overflow-hidden rounded-full bg-muted">
              {d.parts.map((x) =>
                x.n ? (
                  <i
                    key={x.key}
                    className="block h-full bg-primary"
                    style={{ width: `${(x.n / most) * 100}%`, opacity: x.alpha }}
                    title={`${HR_EMPTYPE[x.key].label} ${x.n} คน`}
                  />
                ) : null,
              )}
            </span>
            <span className="num text-right text-[13px] font-bold">{d.n}</span>
          </div>
        ))}

        <h3 className="mt-4 mb-2 text-[12px] font-normal text-muted-foreground/70">จำนวนตามเพศ</h3>
        {sexes.map((g) => (
          <div
            key={g.label}
            className="grid grid-cols-[110px_minmax(0,1fr)_30px] items-center gap-3 py-[7px] sm:grid-cols-[150px_minmax(0,1fr)_34px]"
          >
            <span className="truncate text-[13px]">{g.label}</span>
            <span className="flex h-2 overflow-hidden rounded-full bg-muted">
              {g.n > 0 && (
                <i className="block h-full bg-primary" style={{ width: `${(g.n / mostSex) * 100}%`, opacity: 0.85 }} />
              )}
            </span>
            <span className="num text-right text-[13px] font-bold">{g.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/*
 * การลาของนักศึกษาฝึกงาน — ฝ่ายบุคคลอนุมัติเอง (ต้นแบบ hr-dashboard.html)
 * แสดงเฉพาะใบที่รออนุมัติ กดแล้วตัดสินทันที ใบที่อนุมัติลงเวลาทำงานของคนนั้นเป็นวันลา
 *
 * 2 ต.ค. 2569 นักศึกษาฝึกงานมีบัญชีแล้ว ยื่นใบลาเองในแอปได้ (ใบขึ้นรายการรออนุมัติของฝ่ายบุคคล)
 * ผู้ใช้สั่งให้การ์ดนี้ดึงใบจากแอปมาด้วย — สองแหล่งรวมเป็นรายการเดียว ตัดสินที่นี่หรือที่ /approvals ก็ได้
 * ใบจากแอปลงเวลาทำงานผ่านสะพาน hr-link เหมือนใบของบทบาทอื่น
 */
type InternWait = {
  key: string;
  emp: string;
  type: string;
  from: string;
  to: string;
  days: number;
  note: string;
  decide: (ok: boolean) => void;
};

function InternLeaveCard({ hr }: { hr: ReturnType<typeof useHr> }) {
  const allLeave = useAllLeave();
  const fromHr: InternWait[] = hr.internLeave
    .filter((r) => r.status === "pending")
    .map((r) => ({
      key: r.id,
      emp: r.emp,
      type: HR_LEAVE_LABEL[r.lt],
      from: r.from,
      to: r.to,
      days: r.days,
      note: r.note,
      decide: (ok) => decideInternLeave(r.id, ok, bkkStamp()),
    }));
  const fromApp: InternWait[] = (allLeave.intern ?? [])
    .filter((r) => r.status === "รอการอนุมัติ")
    .map((r) => ({
      key: `app-${r.id}`,
      emp: ROLE_EMPLOYEE.intern ?? "",
      type: r.type,
      from: r.date,
      to: r.toDate,
      days: r.days,
      note: r.comment,
      /* ไม่อนุมัติจากการ์ดนี้ไม่มีช่องเหตุผล เหมือนใบชุดเดิม — ต้องการเหตุผลให้ตัดสินที่รายการรออนุมัติ */
      decide: (ok) => (ok ? approveLeave("intern", r.id) : rejectLeave("intern", r.id, "")),
    }));
  const wait = [...fromApp, ...fromHr];
  return (
    <section className="glass flex h-full flex-col rounded-[14px]">
      <h2 className="px-5 pt-[15px] pb-2 text-[15px] font-bold">
        การลาของนักศึกษาฝึกงาน <b className="ml-1 text-primary">{wait.length}</b>
      </h2>
      {wait.length === 0 ? (
        <p className="grid min-h-[240px] flex-1 place-items-center px-5 text-[13px] text-muted-foreground">
          ไม่มีคำขอลาของนักศึกษาฝึกงานที่รออนุมัติ
        </p>
      ) : (
        <div className="min-h-[240px] flex-1 overflow-y-auto">
        {wait.map((r) => (
          <div
            key={r.key}
            className="flex flex-wrap items-center gap-3.5 border-t border-border px-5 py-3 first-of-type:border-t-0"
          >
            <div className="flex min-w-[240px] flex-1 flex-col gap-0.5">
              <b className="text-[13.5px] font-semibold">
                {displayName(empOf(hr.emp, r.emp)) || "—"} · {r.type}
              </b>
              <span className="text-[12.5px] text-muted-foreground">
                {thaiDate(r.from)}
                {r.from !== r.to && ` – ${thaiDate(r.to)}`} รวม {fmtLeave(r.days)}
              </span>
              {/* การ์ดแดชบอร์ดแสดงแค่ชื่อ ประเภท และวันที่ขอ (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
            </div>
            {/* ฝ่ายบุคคลเป็นผู้อนุมัติ — มุมมอง CEO (ceo-hr.html) ก็เห็นปุ่มเหมือนกัน ตามต้นแบบ */}
            <div className="flex gap-2">
              <button
                type="button"
                className="btn glass-thin"
                style={{ height: 34 }}
                onClick={() => r.decide(false)}
              >
                ไม่อนุมัติ
              </button>
              <button
                type="button"
                className="btn solid btn-solid"
                style={{ height: 34 }}
                onClick={() => r.decide(true)}
              >
                อนุมัติ
              </button>
            </div>
          </div>
        ))}
        </div>
      )}
    </section>
  );
}


/* การ์ดสรุป — ไอคอนซ้าย ตัวเลขขวา (โครงจาก mockup 24 ก.ย. 2569 · สีใช้ชุดเดียวของระบบ) */
/* สีแผ่นไอคอน — ชุดเดียวกับแดชบอร์ดขาย บัญชี และ PM */
const KPI_TONE = {
  won: "bg-[#ecfdf5] text-[#009767]",
  info: "bg-[#eff6ff] text-[#155dfc]",
  warn: "bg-[#fffbeb] text-[#b75000]",
  job: "bg-[#f3f0ff] text-[#7552db]",
};

/* ชื่อกับไอคอนอยู่แถวบน ตัวเลขอยู่ใต้ลงมา (ดีไซน์ใหม่ 25 ก.ย. 2569) */
function Kpi({
  icon,
  title,
  value,
  note,
  warn,
  skin = "info",
}: {
  icon?: React.ReactNode;
  title: string;
  value: string;
  note: string;
  warn?: boolean;
  skin?: keyof typeof KPI_TONE;
}) {
  return (
    /* การ์ดสรุปเป็นตัวเลขเฉย ๆ ไม่ใช่ลิงก์ (ต้นแบบ .scard) */
    <div className="glass flex h-full flex-col rounded-[14px] px-4 py-3.5 sm:px-5 sm:py-[15px]">
      <span className="flex items-start justify-between gap-2.5">
        <b className="min-w-0 text-[12.5px] leading-snug font-semibold text-muted-foreground">{title}</b>
        {icon && (
          <i className={`grid size-[30px] flex-none place-items-center rounded-[10px] ${KPI_TONE[skin]}`}>
            {icon}
          </i>
        )}
      </span>
      <p
        className={`num mt-2 text-[20px] leading-none font-extrabold sm:text-[22px] ${
          warn ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
      <p className="mt-auto pt-1.5 line-clamp-2 text-[11.5px] text-muted-foreground">{note}</p>
    </div>
  );
}

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass flex min-w-0 flex-col rounded-[14px] px-5 py-[18px] ${className}`}>
      <h2 className="text-[15px] font-bold">{title}</h2>
      <div className="mt-3.5 min-w-0 flex-1">{children}</div>
    </section>
  );
}

/** "2026-09" → "ก.ย. 2569" — การ์ดเงินเดือนในต้นแบบใช้เดือนย่อ */
function shortMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${TH_MONTHS_SHORT[m - 1]} ${y + 543}`;
}

// ─── งานที่ต้องดำเนินการ ──────────────────────────────────────────

/*
 * รวมเรื่องที่ค้างอยู่จริงมาไว้ที่เดียว เรียงตามความเร่ง
 * เลยกำหนดขึ้นก่อน แล้วค่อยเรื่องที่ยังมีเวลา — คนเปิดหน้านี้จะได้เห็นของด่วนก่อน
 */
type Todo = {
  key: string;
  what: string;
  who: string;
  detail: string;
  due: string;
  state: string;
  late?: boolean;
  /** ลำดับความเร่ง — เลขน้อยขึ้นก่อน */
  rank: number;
};

function TodoTable({
  active,
  probation,
  hr,
  lastMonth,
  span,
}: {
  active: Employee[];
  probation: { e: Employee; left: number }[];
  hr: ReturnType<typeof useHr>;
  lastMonth: string;
  /* ช่วงเวลาที่เลือก — กรองเฉพาะงานที่มีกำหนด งานที่ไม่มีกำหนดแสดงเสมอ */
  span: { from: string; to: string };
}) {
  const rows = useMemo<Todo[]>(() => {
    const need = hrDocs().filter((d) => d.req);
    const out: Todo[] = [];

    /* เอกสารประจำตัวที่บังคับแต่ยังไม่ได้ส่ง */
    for (const e of active) {
      const missing = need.filter((d) => !e.docs.includes(d.v));
      if (missing.length) {
        out.push({
          key: `doc-${e.id}`,
          what: "เอกสารยังไม่ครบ",
          who: displayName(e),
          detail: `${missing.length} รายการ`,
          due: "",
          state: "รอเพิ่มข้อมูล",
          rank: 1,
        });
      }
    }

    /* ทดลองงานที่ใกล้ครบกำหนด ต้องตัดสินใจก่อนถึงวัน */
    for (const { e, left } of probation) {
      if (left > PROBATION_WARN_DAYS) continue;
      out.push({
        key: `prob-${e.id}`,
        what: "ครบกำหนดทดลองงาน",
        who: displayName(e),
        detail: `เริ่มงาน ${thaiDate(e.startedAt)}`,
        due: toIsoDate(probEnd(e.startedAt)),
        state: left < 0 ? `เลยกำหนด ${Math.abs(left)} วัน` : `เหลือ ${left} วัน`,
        late: left < 0,
        rank: left < 0 ? 0 : 2,
      });
    }

    /* รอบเงินเดือนล่าสุดที่ยังไม่ปิด — อ่านรอบเงินเดือนชุดเดียวกับการ์ด "เงินเดือนรอบนี้" */
    const closed = hr.payruns.some((p) => p.month === lastMonth && p.closed);
    if (!closed) {
      out.push({
        key: "pay",
        what: "เงินเดือนรอดำเนินการ",
        who: "ทั้งบริษัท",
        detail: `รอบ ${shortMonth(lastMonth)} (${thaiDate(hrCycle(lastMonth).from)} – ${thaiDate(hrCycle(lastMonth).to)})`,
        due: "",
        state: "รอดำเนินการ",
        rank: 1,
      });
    }

    return out
      .filter((r) => !r.due || (r.due >= span.from && r.due <= span.to))
      .sort((a, b) => a.rank - b.rank);
  }, [active, probation, hr.payruns, lastMonth, span.from, span.to]);

  return (
    /*
     * โครง mockup 24 ก.ย. 2569 — รายการแถวเดียวจบ ไม่ใช่ตารางกว้าง
     * เพราะการ์ดนี้อยู่คอลัมน์แคบข้างการ์ดใบลา และแต่ละแถวอ่านแค่ "เรื่อง ใคร และด่วนแค่ไหน"
     * สูงคงที่ แถวเกินเลื่อนในกล่อง การ์ดข้าง ๆ จะได้ไม่ถูกดันจนสูงตาม
     */
    <section className="glass flex h-full min-w-0 flex-col rounded-[14px] px-5 py-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold">งานที่ต้องดำเนินการ</h2>
        {/* ช่วงนี้เป็นตัวกรอง "งานที่มีกำหนด" ตามปุ่มช่วงเวลา ไม่ใช่รอบเงินเดือน (รอบตัดวันที่ 25) */}
        <span className="text-[11.5px] text-muted-foreground">
          กำหนดในช่วง {thaiDate(span.from)} – {thaiDate(span.to)}
        </span>
      </div>
      {/* การ์ดสามใบในแถวนี้สูงเท่ากันทั้งแถว รายการกินที่ที่เหลือ แถวเกินเลื่อนในกล่อง
         (ตั้งความสูงตายตัวไม่ได้ เพราะหัวการ์ดแต่ละใบสูงไม่เท่ากัน การ์ดจะเหลื่อมกัน) */}
      {rows.length === 0 ? (
        <p className="grid min-h-[240px] flex-1 place-items-center text-[13px] text-muted-foreground">
          ไม่มีงานที่ต้องดำเนินการ
        </p>
      ) : (
        <ul className="mt-1.5 min-h-[240px] flex-1 divide-y divide-border overflow-y-auto">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 py-[11px]">
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[13.5px] font-medium">
                  {r.what} · {r.who}
                </b>
                <em className="block truncate text-[11.5px] text-muted-foreground not-italic">
                  {r.detail} · {r.due ? `กำหนด ${thaiDate(r.due)}` : "ไม่มีกำหนด"}
                </em>
              </span>
              <span className={`tag flex-none ${r.late ? "t-late" : "t-early"}`}>
                <i />
                {r.state}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
