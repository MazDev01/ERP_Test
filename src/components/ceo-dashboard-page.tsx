"use client";

/*
 * แดชบอร์ดผู้บริหาร (ตามต้นแบบ dose-erp-maz/ceo-dashboard.html)
 *
 * ภาพรวมทั้งบริษัทในหน้าเดียว — ตัวเลขทุกตัวอ่านสดจากสโตร์ของแต่ละฝ่าย ไม่มีตัวเลขกรอกซ้ำ
 *   เงิน   : รับชำระ ค้างรับ (บัญชี) · ดีลที่ปิดได้ ยอดขายแยกบริการ (ขาย) · ต้นทุนแรงงาน (ฝ่ายบุคคล)
 *
 * ทุกตัวเลขเงินในหน้านี้มีหน่วย "บาท" กำกับเสมอ และคั่นหลักพันแบบเดียวกับทุกหน้า (format.ts money)
 * "ต้นทุนแรงงาน" = ก่อนหัก + ประกันสังคมส่วนบริษัท ของทั้งกลุ่มรายเดือนและรายวัน
 * ไม่ใช่ "ยอดสุทธิที่จ่าย" ที่หน้าคำนวณเงินเดือนของฝ่ายบุคคลแสดง — คนละตัวเลขโดยตั้งใจ
 *   คน    : พนักงานวันนี้ (ตอกบัตร + ใบลา) · งานโปรเจคที่เลยกำหนด (PM)
 *   ต้องทำ : คำขอที่รอผู้บริหารอนุมัติ → กดไปหน้าคำขออนุมัติ (?req=)
 *
 * ปุ่มช่วงเวลามีผลกับการ์ดเงินสามใบแรก ยอดขายแยกบริการ และรับชำระต่อคน
 * การ์ดต้นทุนแรงงาน กราฟรายเดือน พนักงานวันนี้ อัตราปิดงาน และคำขอรออนุมัติไม่ขึ้นกับช่วง (ตามต้นแบบ)
 * การ์ดไหนขึ้นกับช่วงไหนเขียนบอกไว้ในหน้าจอแล้ว ไม่ต้องเดาจากหัวเรื่อง
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAcc } from "@/lib/acc-store";
import { useCrm } from "@/lib/crm-store";
import { TH_MONTHS_SHORT, money, thaiDate, todayIso, toIsoDate } from "@/lib/format";
import { quotationValidUntil } from "@/lib/crm-data";
import {
  GROUP_LABEL,
  HR_LEAVE_LABEL,
  empOf,
  hrCycle,
  hrPos,
  payApproval,
  type CycleSum,
  type PayGroup,
  type Period,
} from "@/lib/hr-data";
import { useTodayAttendance, type AttState } from "@/lib/hr-link";
import { useHr } from "@/lib/hr-store";
import { services } from "@/lib/pm-data";
import { usePm } from "@/lib/pm-store";
import { useCeoRequests } from "./ceo-approvals-page";
import { Sheet } from "./lead-dialogs";

type Range = "m" | "q" | "y";
const RANGE_LABEL: Record<Range, string> = {
  m: "เดือนนี้",
  q: "ไตรมาส",
  y: "ปีนี้",
};

const ATT: { key: AttState; label: string; color: string }[] = [
  { key: "ontime", label: "ตรงเวลา", color: "#14875A" },
  { key: "late", label: "มาสาย", color: "#E8AE1B" },
  { key: "leave", label: "ลา", color: "#3B6FD8" },
  { key: "none", label: "ยังไม่เข้างาน", color: "#9CA3AF" },
];

/** ตารางคำขอรออนุมัติแสดงกี่แถว ที่เหลือบอกเป็นจำนวน */
const REQ_LIMIT = 5;

export function CeoDashboardPage() {
  const acc = useAcc();
  const crm = useCrm();
  const hr = useHr();
  const pm = usePm();
  const att = useTodayAttendance();
  const reqs = useCeoRequests();
  const router = useRouter();
  const today = todayIso();
  const [range, setRange] = useState<Range>("m");
  const [attOpen, setAttOpen] = useState<AttState | null>(null);

  const span = rangeSpan(today, range);
  const inR = (iso: string) => Boolean(iso) && iso >= span.from && iso <= span.to;

  /* ── การ์ดสรุป ── */
  const pays = acc.payments.filter((p) => inR(p.date));
  const got = pays.reduce((a, p) => a + p.received + p.wht, 0);
  const open = acc.invoices.filter((v) => v.outstanding > 0);
  const over = open.filter((v) => v.due && v.due < today);
  const won = crm.deals.filter((d) => d.status === "ปิดการขาย" && inR(d.closedAt));
  const last = lastCost(hr.payruns);

  /*
   * รอบเงินเดือนที่ฝ่ายบุคคลส่งมาแล้วรอเราอนุมัติ
   * การ์ดต้นทุนแรงงานพูดถึงรอบที่ "ปิดแล้ว" (ล่าสุดคือ ก.ค.) ส่วนรอบที่ต้องลงมือคือรอบที่รออนุมัติ
   * ถ้าไม่ขึ้นตรงนี้ CEO จะเห็นแต่รอบเก่า แล้วไม่รู้ว่ามีรอบใหม่ค้างรอลายเซ็นอยู่
   */
  const waitPay = useMemo(() => {
    const out: { month: string; group: PayGroup }[] = [];
    for (const p of hr.periods)
      for (const g of ["month", "day"] as PayGroup[])
        if (payApproval(hr.payApprove, p.month, g).status === "waiting") out.push({ month: p.month, group: g });
    return out.sort((a, b) => a.month.localeCompare(b.month));
  }, [hr.periods, hr.payApprove]);
  const waitPayMonths = [...new Set(waitPay.map((x) => x.month))];

  /*
   * ── ยอดขายแยกบริการ — บริการมาจากใบเสนอราคาของดีล (1 ใบ = 1 บริการ)
   * ใบเสนอราคาเก่าที่ยังไม่มีช่องบริการ ใช้บริการของงานฝั่ง PM ที่มาจากดีลเดียวกันแทน
   * หาไม่ได้จริง ๆ ไม่นับเข้าแถวไหน — ต้นแบบมีเฉพาะแถวบริการ ไม่มีแถว "ไม่ระบุบริการ"
   * เรียงยอดมากไปน้อย ยอดเท่ากันคงลำดับบริการเดิม (sort ของ JS คงลำดับเดิมอยู่แล้ว)
   */
  const svc = useMemo(() => {
    const sum = new Map(services().map((s) => [s.key, 0]));
    for (const d of won) {
      const key =
        crm.quotations.find((x) => x.no === d.quotationNo)?.service ??
        /* ยอดขายนับตามดีล — โปรเจคที่มาจากดีลนี้ (ถ้ามี) บอกประเภทบริการ ไม่ได้ใช้ดีลระบุโปรเจค */
        pm.projects.find((p) => p.deal === d.no)?.service ??
        pm.inbox.find((j) => j.deal === d.no)?.service;
      if (key && sum.has(key)) sum.set(key, (sum.get(key) ?? 0) + d.total);
    }
    return services()
      .map((s) => ({ label: s.label, v: sum.get(s.key) ?? 0 }))
      .sort((a, b) => b.v - a.v);
  }, [won, crm.quotations, pm.projects, pm.inbox]);
  const svcMax = Math.max(0, ...svc.map((s) => s.v));

  /* ── ประสิทธิภาพ ── */
  const closed = crm.customers.filter((c) => c.status === "ปิดงาน").length;
  /* ตาม mockup: ลูกค้าตัดสินแล้ว = มีดีลอ้างถึง หรือลูกค้าปฏิเสธ หรือเลยวันที่มีผลโดยไม่ถูกออกใบใหม่แทน
     ตกลง = มีดีล · ใบที่ไม่มีเลขที่ไม่นับ */
  const dealQuotes = new Set(crm.deals.map((d) => d.quotationNo));
  const decided = crm.quotations.filter(
    (q) =>
      Boolean(q.no) &&
      (dealQuotes.has(q.no) || Boolean(q.rejectedAt) || (!q.replacedBy && quotationValidUntil(q) < today)),
  );
  const qOk = decided.filter((q) => dealQuotes.has(q.no)).length;
  const tasks = pm.projects.filter((p) => p.status !== "cancelled").flatMap((p) => p.tasks);
  const openTasks = tasks.filter((t) => t.status !== "done");
  /* กติกาเดียวกับแดชบอร์ด PM และกระดิ่ง — งานที่ทีมส่งมารอ PM ตรวจแล้วไม่นับว่าทีมล่าช้า */
  const lateTasks = openTasks.filter((t) => t.status !== "sent" && t.due && t.due < today).length;
  /* ผู้ได้รับค่าจ้าง = คนที่ยังอยู่และไม่ใช่นักศึกษาฝึกงาน (รวมกลุ่มจ่ายรายเดือนกับกลุ่มทดลองงานจ่ายรายวัน) */
  const paidStaff = hr.emp.filter((e) => e.status === "active" && e.type !== "intern").length;
  const kpis = [
    {
      /* นับ "ผู้สนใจ" ไม่ใช่ "ใบเสนอราคา" — หน้ารายงานของฝ่ายขายนับใบเสนอราคา ตัวเลขจึงคนละตัว */
      k: "ผู้สนใจที่ปิดงานได้",
      v: `${pct(closed, crm.customers.length)}%`,
      s: `ปิดงาน ${closed} จากผู้สนใจทั้งหมด ${crm.customers.length} ราย (ไม่ขึ้นกับช่วงที่เลือก)`,
    },
    {
      k: "ใบเสนอราคาที่ลูกค้าตกลง",
      v: `${pct(qOk, decided.length)}%`,
      s: `${qOk} จาก ${decided.length} ใบที่ลูกค้าตัดสินแล้ว (ไม่ขึ้นกับช่วงที่เลือก)`,
    },
    {
      /* นับใบงานย่อยในโปรเจค ไม่ใช่จำนวนโปรเจค — หน้ารายการโปรเจคของ PM นับโปรเจค */
      k: "งานย่อยในโปรเจคที่เลยกำหนด",
      v: `${lateTasks} งานย่อย`,
      s: `จากงานย่อยที่ยังไม่เสร็จ ${openTasks.length} งาน`,
      bad: lateTasks > 0,
    },
    {
      k: "รับชำระต่อผู้ได้รับค่าจ้าง 1 คน",
      v: `${whole(paidStaff ? got / paidStaff : 0)} บาท`,
      s: `หารด้วยผู้ได้รับค่าจ้าง ${paidStaff} คน (คนที่ยังอยู่ ไม่รวมนักศึกษาฝึกงาน)`,
    },
  ];

  /* ── พนักงานวันนี้ ── */
  const cnt = (k: AttState) => att.filter((a) => a.state === k).length;

  /* ── คำขอรออนุมัติ — ใบลาและโอทีที่รอ CEO เรียงจากส่งก่อน (ต้นแบบเรียงตาม at จากเก่าไปใหม่)
     ยอดเงินเดือนที่ฝ่ายบุคคลส่งมาไม่อยู่ในตารางนี้ ต้นแบบให้ไปอยู่ในหน้าคำขออนุมัติกับแจ้งเตือน ── */
  const pending = [
    ...reqs
      .filter((r) => r.status === "pending")
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((r) => ({
        key: `${r.kind}-${r.id}`,
        who: empOf(hr.emp, r.emp)?.name ?? r.emp,
        type: r.kind === "ot" ? "OT" : r.label,
        detail: r.big,
        when: r.lines[0],
        sent: r.hasTime ? r.at : "",
        href: `/ceo/approvals?req=${encodeURIComponent(r.id)}`,
      })),
  ];

  return (
    <div className="space-y-4">
      <div className="bar">
        <div>
          <h1>แดชบอร์ด</h1>
          {/* ช่วงนี้มีผลเฉพาะการ์ดเงิน ยอดขายแยกบริการ และประสิทธิภาพ
              การ์ดต้นทุนแรงงานเป็น "รอบเงินเดือนล่าสุดที่ปิดแล้ว" ซึ่งเป็นคนละช่วงเสมอ จึงบอกไว้ตรงนี้ */}
          <p>
            ช่วงที่เลือก {thaiDate(span.from)} – {thaiDate(span.to)} · มีผลกับการ์ดรับชำระ ค้างรับ ดีลที่ปิดได้
            ยอดขายแยกบริการ และประสิทธิภาพ
          </p>
        </div>
        {/* มือถือ: ปุ่มช่วงเวลาเต็มแถว สูงพอให้นิ้วกด */}
        <div className="tools max-sm:w-full">
          <div
            className="seg max-sm:w-full max-sm:[&>button]:!h-10 max-sm:[&>button]:!text-[14px]"
            role="group"
            aria-label="ช่วงเวลา"
          >
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
        <Kpi title="รับชำระแล้ว" value={`${whole(got)} บาท`} note={`จาก ${pays.length} ใบแจ้งหนี้ในช่วงที่เลือก`} />
        <Kpi
          title="ค้างรับ"
          value={`${whole(open.reduce((a, v) => a + v.outstanding, 0))} บาท`}
          note={over.length ? `เกินกำหนด ${over.length} ใบ` : "ไม่มีใบเกินกำหนด"}
          warn={over.length > 0}
        />
        <Kpi
          title="ดีลที่ปิดได้"
          value={`${won.length} ดีล`}
          note={`มูลค่า ${whole(won.reduce((a, d) => a + d.total, 0))} บาท ในช่วงที่เลือก`}
        />
        {/*
          ต้นทุนแรงงาน ≠ ยอดที่โอนให้พนักงาน
          ตัวนี้ = รายได้รวมก่อนหัก + ประกันสังคมส่วนบริษัท ของทั้งกลุ่มรายเดือนและกลุ่มรายวัน
          ส่วนหน้าคำนวณเงินเดือนของฝ่ายบุคคลบอก "ยอดสุทธิที่จ่าย" ของกลุ่มรายเดือนอย่างเดียว
          สองตัวนี้ต่างกันโดยตั้งใจ ชื่อการ์ดจึงต้องบอกให้ชัดว่าเป็นต้นทุน ไม่ใช่ยอดจ่าย
        */}
        <Kpi
          title="ต้นทุนแรงงาน (ก่อนหัก + ปกส.ส่วนบริษัท)"
          value={last ? `${whole(last.cost)} บาท` : "—"}
          note={
            last
              ? `รอบเงินเดือนล่าสุดที่ปิดแล้ว ${shortRound(last.month)} (${thaiDate(hrCycle(last.month).from)} – ${thaiDate(hrCycle(last.month).to)}) · ${last.n} คน`
              : "ยังไม่มีรอบที่ปิดแล้ว"
          }
        />
      </div>

      {/* รอบเงินเดือนที่รอลายเซ็นของเรา — ต้องเห็นบนหน้าแรก ไม่ใช่ต้องเข้าไปหาในหน้าคำขออนุมัติ */}
      {waitPayMonths.length > 0 && (
        <Link
          href="/ceo/approvals?k=pay"
          className="glass flex items-center gap-3 rounded-[14px] border border-[var(--warning)] px-5 py-3.5 text-[13.5px] hover:bg-muted max-sm:min-h-14"
        >
          <span className="min-w-0 flex-1">
            <b className="block font-semibold text-destructive">
              ยอดเงินเดือนรอเราอนุมัติ {waitPayMonths.map(shortRound).join(" · ")}
            </b>
            <em className="mt-0.5 block text-[12px] text-muted-foreground not-italic">
              {waitPay.map((x) => `${shortRound(x.month)} ${GROUP_LABEL[x.group]}`).join(" · ")} · ยังไม่อนุมัติ
              รอบนี้จึงยังไม่เข้าการ์ดต้นทุนแรงงาน
            </em>
          </span>
          <span aria-hidden className="flex-none text-[18px] text-muted-foreground">
            ›
          </span>
        </Link>
      )}

      <div className="grid items-stretch gap-3.5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="รับชำระเทียบต้นทุนแรงงาน (รอบที่ปิดแล้ว)">
          <Trend payments={acc.payments} payruns={hr.payruns} today={today} />
        </Panel>

        <Panel title="พนักงานวันนี้">
          <p className="num text-[40px] leading-none font-extrabold">{cnt("ontime") + cnt("late")}</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            มาทำงานแล้ว จากคนที่ยังอยู่วันนี้ {att.length} คน
          </p>
          <div className="mt-3 space-y-0.5">
            {ATT.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => setAttOpen(a.key)}
                className="flex w-full items-center justify-between rounded-[10px] px-2 py-2 text-[13.5px] hover:bg-muted hover:text-primary max-sm:min-h-11 max-sm:text-[14.5px]"
              >
                <span className="flex items-center gap-2.5">
                  <i className="size-2.5 rounded-full" style={{ background: a.color }} />
                  {a.label}
                </span>
                <b className="num">{cnt(a.key)}</b>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid items-stretch gap-3.5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="ยอดขายแยกบริการ (บาท · ช่วงที่เลือก)">
          <ul className="space-y-2.5">
            {svc.map((s) => (
              <li
                key={s.label}
                className={`grid grid-cols-[110px_minmax(0,1fr)_96px] items-center gap-3 text-[13px] sm:grid-cols-[150px_minmax(0,1fr)_110px] ${
                  s.v ? "" : "text-muted-foreground"
                }`}
              >
                <span className="truncate">{s.label}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{
                      width: `${svcMax ? Math.max(s.v ? 2 : 0, (s.v * 100) / svcMax) : 0}%`,
                    }}
                  />
                </span>
                <span className="num text-right">{whole(s.v)} บาท</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="ประสิทธิภาพ">
          <ul className="divide-y divide-border">
            {kpis.map((k) => (
              <li key={k.k} className="py-2.5 first:pt-0 last:pb-0">
                <span className="block text-[12.5px] text-muted-foreground">{k.k}</span>
                <span className={`num block text-[20px] font-extrabold ${k.bad ? "text-destructive" : ""}`}>{k.v}</span>
                <span className="block text-[12px] text-muted-foreground">{k.s}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <section className="panel glass flex min-w-0 flex-col">
        <div className="strip">
          <h2 className="py-2.5 text-[14.5px] font-bold">คำขอรออนุมัติ</h2>
        </div>
        {/* มือถือ: รายการสั้นแถวละคำขอ แตะแล้วไปหน้าคำขออนุมัติ แทนการ์ดตารางที่ยาวห้าบรรทัดต่อใบ */}
        <ul className="divide-y divide-border sm:hidden">
          {pending.length === 0 ? (
            <li className="py-9 text-center text-[13px] text-muted-foreground">ไม่มีคำขอรออนุมัติ</li>
          ) : (
            pending.slice(0, REQ_LIMIT).map((r) => (
              <li key={r.key}>
                <Link href={r.href} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5 active:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <b className="min-w-0 flex-1 truncate text-[14px] font-semibold">{r.who}</b>
                      <span className="num flex-none text-[13.5px] font-bold">{r.detail}</span>
                    </span>
                    <span className="mt-0.5 flex gap-2 text-[12.5px] text-muted-foreground">
                      <span className="flex-none font-semibold text-primary">{r.type}</span>
                      <span className="min-w-0 flex-1 truncate">{r.when}</span>
                      <span className="flex-none">ส่ง {r.sent ? thaiDate(r.sent.slice(0, 10)) : "—"}</span>
                    </span>
                  </span>
                  <span aria-hidden className="flex-none text-[18px] text-muted-foreground">
                    ›
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
        <div className="scroll-stable hidden overflow-auto sm:block">
          <table className="data-table cards-sm min-w-[760px]">
            <thead>
              <tr>
                <th>ผู้ขอ</th>
                <th style={{ width: 150 }}>ประเภท</th>
                <th style={{ width: 150 }}>รายละเอียด</th>
                <th style={{ width: 210 }}>วันที่</th>
                <th style={{ width: 150 }}>ส่งเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-9 text-center text-muted-foreground">
                    ไม่มีคำขอรออนุมัติ
                  </td>
                </tr>
              ) : (
                pending.slice(0, REQ_LIMIT).map((r) => {
                  const go = () => router.push(r.href);
                  return (
                    <tr
                      key={r.key}
                      tabIndex={0}
                      style={{ cursor: "pointer" }}
                      onClick={go}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          go();
                        }
                      }}
                    >
                      <td data-label="ผู้ขอ">{r.who}</td>
                      <td data-label="ประเภท">{r.type}</td>
                      <td data-label="รายละเอียด">{r.detail}</td>
                      <td data-label="วันที่" className="muted">
                        {r.when}
                      </td>
                      <td data-label="ส่งเมื่อ" className="muted">
                        {/* ต้นแบบบอกเฉพาะวันที่ ไม่มีเวลา */}
                        {r.sent ? thaiDate(r.sent.slice(0, 10)) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {/* ต้นแบบเป็นลิงก์ตัวหนังสือสีแดงชิดซ้าย ไม่ใช่ปุ่ม (ceo-dashboard.html · .ceod-more) */}
        {pending.length > REQ_LIMIT && (
          <Link
            href="/ceo/approvals"
            className="lnk-code self-start px-4 py-3 text-[13px] max-sm:min-h-11"
          >
            อีก {pending.length - REQ_LIMIT} รายการ
          </Link>
        )}
      </section>

      {attOpen && (
        <Sheet
          title={`${ATT.find((a) => a.key === attOpen)!.label} ${cnt(attOpen)} คน`}
          onClose={() => setAttOpen(null)}
          narrow
          footer={
            <button type="button" className="btn glass-thin" onClick={() => setAttOpen(null)}>
              ปิด
            </button>
          }
        >
          {cnt(attOpen) === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">ไม่มีพนักงานในสถานะนี้</p>
          ) : (
            <ul className="divide-y divide-border">
              {att
                .filter((a) => a.state === attOpen)
                .map((a) => (
                  <li key={a.e.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span>
                      <b className="block text-[13.5px] font-semibold">{a.e.name}</b>
                      <em className="text-[12px] text-muted-foreground not-italic">{hrPos(a.e.pos).label}</em>
                    </span>
                    {/* ลาบอกแค่ประเภท ไม่บอกเหตุผล (ต้นแบบ) */}
                    <span className="num text-[13px] text-muted-foreground">
                      {"leave" in a && a.leave ? HR_LEAVE_LABEL[a.leave] : a.time ? `${a.time} น.` : ""}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Sheet>
      )}
    </div>
  );
}

// ─── ชิ้นส่วน ─────────────────────────────────────────────────────

function Kpi({ title, value, note, warn }: { title: string; value: string; note: string; warn?: boolean }) {
  return (
    <div className="glass min-h-[120px] rounded-[14px] px-5 py-[15px]">
      <b className="text-[12.5px] font-semibold text-muted-foreground">{title}</b>
      <p className={`num mt-2 text-[26px] leading-none font-extrabold ${warn ? "text-destructive" : ""}`}>{value}</p>
      <p className="mt-2 text-[11.5px] text-muted-foreground">{note}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass flex min-w-0 flex-col rounded-[14px] px-5 py-[18px]">
      <h2 className="mb-3.5 text-[15px] font-bold">{title}</h2>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

/**
 * รับชำระ (เส้นทึบแดง) เทียบต้นทุนเงินเดือน (เส้นประเทา) รายเดือน
 * ตั้งแต่เดือนแรกที่มีการรับชำระจนถึงเดือนนี้ · เดือนที่รอบเงินเดือนยังไม่ปิดไม่มีจุด ไม่ประมาณเอง
 */
function Trend({
  payments,
  payruns,
  today,
}: {
  payments: { date: string; received: number; wht: number }[];
  payruns: Period[];
  today: string;
}) {
  const first = payments.reduce((m, p) => (!m || p.date < m ? p.date : m), "").slice(0, 7) || today.slice(0, 7);
  const months: {
    key: string;
    label: string;
    inc: number;
    pay: number | null;
  }[] = [];
  for (let [y, m] = first.split("-").map(Number); `${y}-${String(m).padStart(2, "0")}` <= today.slice(0, 7);) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    months.push({
      key,
      label: TH_MONTHS_SHORT[m - 1],
      inc: payments.filter((p) => p.date.startsWith(key)).reduce((a, p) => a + p.received + p.wht, 0),
      pay: costOf(payruns.find((r) => r.month === key))?.cost ?? null,
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  const top = Math.ceil(Math.max(0, ...months.map((x) => Math.max(x.inc, x.pay ?? 0))) / 100000) * 100000 || 100000;
  const n = months.length;

  /* จอใหญ่กว้าง 640 · มือถือวาดใหม่ที่กว้าง 340 ตัวหนังสือบนแกนจะไม่หดจนอ่านไม่ออก */
  const chart = (W: number, H: number, L: number, cls: string) => {
    const R = 16;
    const T = 14;
    const B = 34;
    const X = (i: number) => (n > 1 ? L + (i * (W - L - R)) / (n - 1) : (L + W - R) / 2);
    const Y = (v: number) => T + (H - T - B) * (1 - v / top);

    const line = (key: "inc" | "pay", color: string, dash: boolean) => {
      const pts = months.flatMap((x, i) => (x[key] === null ? [] : [`${X(i)},${Y(x[key] as number)}`]));
      return (
        <g>
          <polyline
            points={pts.join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeDasharray={dash ? "6 5" : undefined}
            strokeLinejoin="round"
          />
          {months.map((x, i) =>
            x[key] === null ? null : (
              <circle key={x.key} cx={X(i)} cy={Y(x[key] as number)} r={4} fill="#FFF" stroke={color} strokeWidth={2}>
                <title>{`${x.label} ${key === "inc" ? "รับชำระ" : "ต้นทุนแรงงาน"} ${whole(x[key] as number)} บาท`}</title>
              </circle>
            ),
          )}
        </g>
      );
    };

    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={`w-full ${cls}`}
        role="img"
        aria-label="รับชำระเทียบต้นทุนแรงงานรายเดือน (บาท)"
      >
        {[0, 1, 2, 3, 4].map((k) => {
          const v = (top * k) / 4;
          return (
            <g key={k}>
              <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--border)" />
              <text x={L - 8} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">
                {short(v)}
              </text>
            </g>
          );
        })}
        {months.map((x, i) => (
          <text key={x.key} x={X(i)} y={H - 10} textAnchor="middle" fontSize={12} fill="var(--muted-foreground)">
            {x.label}
          </text>
        ))}
        {line("pay", "#6B7280", true)}
        {line("inc", "var(--primary)", false)}
      </svg>
    );
  };

  return (
    <div>
      <ul className="mb-2 flex gap-4 text-[12px] text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <i className="h-[3px] w-4 rounded bg-primary" />
          รับชำระแล้ว
        </li>
        <li className="flex items-center gap-1.5">
          <i className="h-[3px] w-4 rounded bg-[#6B7280]" />
          ต้นทุนแรงงาน
        </li>
      </ul>
      {chart(640, 230, 58, "hidden sm:block")}
      {chart(340, 220, 46, "sm:hidden")}
    </div>
  );
}

// ─── ตัวช่วย ──────────────────────────────────────────────────────

function pct(a: number, b: number) {
  return b ? Math.round((a * 100) / b) : 0;
}

/** "2026-07" → "ก.ค. 2569" — ชื่อรอบเงินเดือน */
function shortRound(month: string) {
  return `${TH_MONTHS_SHORT[Number(month.slice(5, 7)) - 1]} ${Number(month.slice(0, 4)) + 543}`;
}

function short(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")} ล้าน`;
  if (v >= 1000) return `${Math.round(v / 1000)}K`;
  return String(Math.round(v));
}

/*
 * ต้นทุนเงินเดือนของรอบ = รายได้รวมก่อนหัก (เงินเดือน/ค่าจ้าง โอที คอมมิชชั่น Incentive ค่าตำแหน่ง ปรับเพิ่มลด)
 * + ประกันสังคมส่วนบริษัท (เท่ากับส่วนลูกจ้าง) — สูตรเดียวกับต้นแบบ grossOf + ss
 * ค่าใช้จ่ายคืน (ใบเบิก) ไม่ใช่ค่าจ้าง จึงไม่นับ · ใช้ยอดที่ฝ่ายบุคคลบันทึกไว้ตอนปิดรอบ รอบที่ยังไม่ปิดไม่นับ
 */
function sumCost(x: CycleSum) {
  return x.base + x.ot + x.com + x.inc + x.allow + x.adj + x.ss;
}

function costOf(run?: Period) {
  if (!run || !run.closed || !run.sum) return null;
  let cost = sumCost(run.sum);
  let n = run.sum.n;
  if (run.dayClosed && run.daySum) {
    cost += sumCost(run.daySum);
    n += run.daySum.n;
  }
  return { cost, n, month: run.month };
}

function lastCost(runs: Period[]) {
  return runs
    .map((r) => costOf(r))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .sort((a, b) => b.month.localeCompare(a.month))[0];
}

function rangeSpan(today: string, range: Range) {
  const d = new Date(`${today}T00:00:00`);
  const y = d.getFullYear();
  if (range === "y")
    return {
      from: toIsoDate(new Date(y, 0, 1)),
      to: toIsoDate(new Date(y, 11, 31)),
    };
  if (range === "q") {
    const q = Math.floor(d.getMonth() / 3) * 3;
    return {
      from: toIsoDate(new Date(y, q, 1)),
      to: toIsoDate(new Date(y, q + 3, 0)),
    };
  }
  return {
    from: toIsoDate(new Date(y, d.getMonth(), 1)),
    to: toIsoDate(new Date(y, d.getMonth() + 1, 0)),
  };
}

/**
 * ยอดเงินเต็มบาท ไม่มีทศนิยม ตาม mockup ceo-dashboard (baht = Math.round + คั่นหลักพัน)
 * ใช้ตัวคั่นหลักพันแบบไทยเหมือนทุกหน้าในระบบ (format.ts money) ไม่ใช่ en-US
 * หน่วยไม่ได้ติดมากับตัวเลข ผู้เรียกต้องเติม "บาท" เสมอ — ตัวเลขเงินลอย ๆ ไม่มีหน่วยอ่านไม่ออกว่าเป็นอะไร
 */
function whole(n: number) {
  return money(n);
}
