"use client";

/*
 * หน้าหลักมือถือของบัญชี (?as=acc) — ตามต้นแบบ home-glass-ref.html ทุกชิ้น (ผู้ใช้สั่ง 13 ต.ค. 2569)
 * ไม่ใช้กริดเมนูจากเมนูข้างเหมือนบทบาทอื่น: เมนูตายตัว 5 ช่อง · สิ่งที่ต้องทำ 3 การ์ด · วันนี้ของฉัน 3 แถว
 * ตัวเลขทุกตัวอ่านจากสโตร์จริง สูตรเดียวกับ useHomeData ใน ceo-home-page (ไม่แตะบทบาทอื่น)
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { type NavItem } from "@/lib/nav";
import { ROLE_EMPLOYEE } from "@/lib/hr-link";
import { daysBetween, greetNow, thaiMonth, toIsoDate, todayIso } from "@/lib/format";
import { awaitingReceipt, invoiceDue, seqStatus, useAcc } from "@/lib/acc-store";
import { useHr } from "@/lib/hr-store";
import { initialOf, useNameOf } from "@/lib/emp-name";
import { inPeriod, inRange, isDaily, probEnd, rangeLabel } from "@/lib/hr-data";
import { leaveUsage, useLeaveRecords } from "@/lib/leave-store";
import { fmtLeave } from "@/lib/leave-data";
import { getRecordsServerSnapshot, getRecordsSnapshot, subscribeRecords } from "@/lib/attendance-store";
import { formatClock, recordsOfDay } from "@/lib/attendance";
import { WORK_SCHEDULE } from "@/lib/work-schedule";
import { ICONS } from "./app-shell";
import { HomeIcon } from "./icons";
import { NotificationMenu } from "./notification-menu";

const INK = "#2A1F22";
const GLASS: React.CSSProperties = {
  background: "rgba(255,255,255,.72)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  border: "1px solid rgba(255,255,255,.95)",
  boxShadow: "0 12px 30px -20px rgba(140,20,40,.45)",
};

/* ไอคอนเส้นชุดเดียวกับต้นแบบ — คัดลอก path ตรงจากไฟล์ (ผู้ใช้สั่ง 13 ต.ค. 2569) */
function Svg({ size, sw = 2, children }: { size: number; sw?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const P_DOC = (<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>);
const P_CAL = (<><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>);
const P_USER = (<><circle cx="12" cy="8" r="3.6" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></>);
const P_CASH = (<><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /></>);
const P_CHEV = <path d="m9 18 6-6-6-6" />;

/* เมนู 5 ช่องตามต้นแบบ — ลำดับ สี และไอคอนตายตัว */
const TILES: { label: string; href: string; grad: string; icon: ReactNode }[] = [
  {
    label: "เรียกเก็บเงิน",
    href: "/acc/billing",
    grad: "linear-gradient(150deg,#F2A93B,#D9731A)",
    icon: (<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" /><path d="M14 3v5h5" /><path d="M8 9h4M8 13h3" /><circle cx="17" cy="17" r="4" /><path d="M17 15.5v3M15.8 16.4h2a.8.8 0 0 1 0 1.2h-1.6a.8.8 0 0 0 0 1.2h2" /></>),
  },
  {
    label: "ยื่นภาษี",
    href: "/acc/wht",
    grad: "linear-gradient(150deg,#9B83F0,#5B3FBF)",
    icon: (<><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>),
  },
  {
    label: "พนักงาน",
    href: "/hr/employees",
    grad: "linear-gradient(150deg,#5A9BF0,#1F63C4)",
    icon: (<><circle cx="9" cy="8" r="3.4" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M16 4.5a3.4 3.4 0 0 1 0 6.6M18 14.8c1.8.7 3 2.5 3 5.2" /></>),
  },
  {
    label: "รอบเงินเดือน",
    href: "/hr/timesheet",
    grad: "linear-gradient(150deg,#EE5A6F,#B0101F)",
    icon: P_CASH,
  },
  /* ช่องที่ 5 เปลี่ยนจากตารางงานเป็นใบเสนอราคาของบัญชี (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  {
    label: "ใบเสนอราคา",
    href: "/acc/quotations",
    grad: "linear-gradient(150deg,#2EC4B6,#13867D)",
    icon: (<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M8 12h8M8 16h5" /></>),
  },
  /* โอทีต้องเข้าได้จากหน้าหลักมือถือ — การ์ดแบบเดียวกับช่องอื่น ไอคอนเดียวกับเมนูโอที (ผู้ใช้สั่ง 29 ต.ค. 2569) */
  {
    label: "โอที",
    href: "/ot",
    grad: "linear-gradient(150deg,#F2A93B,#D9731A)",
    icon: (<><path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /><circle cx="12" cy="12" r="3.6" /></>),
  },
];
const TILE_SHADOW = "inset 0 1px 0 rgba(255,255,255,.35), 0 10px 18px -10px rgba(90,20,30,.55)";

/** ตัวเลขย่อแบบต้นแบบ — 171K · 1.2M */
function shortNum(n: number) {
  const a = Math.abs(n);
  if (a >= 1e6) return `${Math.round((n / 1e6) * 10) / 10}M`;
  if (a >= 1e3) return `${Math.round(n / 1e3)}K`;
  return `${Math.round(n)}`;
}

/** ตัวเลขจากสโตร์จริง — สูตรเดียวกับหน้าที่ลิงก์ไป (ผู้ใช้สั่ง 13 ต.ค. 2569) */
function useAccHomeData() {
  const acc = useAcc();
  const hr = useHr();
  const leaves = useLeaveRecords();
  const punches = useSyncExternalStore(subscribeRecords, getRecordsSnapshot, getRecordsServerSnapshot);

  return useMemo(() => {
    const today = todayIso();
    const left = (t: string) => leaveUsage(leaves, t).remaining;
    /* แดชบอร์ดบัญชีช่วง "เดือนนี้" — รับชำระ = รับจริง + ภาษีที่ลูกค้าหัก */
    const from = `${today.slice(0, 7)}-01`;
    const got = acc.payments
      .filter((p) => p.date && p.date >= from && p.date <= today)
      .reduce((a, p) => a + p.received + p.wht, 0);
    const owe = awaitingReceipt(acc).reduce((a, v) => a + invoiceDue(v), 0);
    const active = hr.emp.filter((e) => e.status === "active");
    /* วันลาคงเหลือแสดงเป็นชั่วโมง — เลขแรกตัวใหญ่ หน่วยที่เหลือตัวเล็ก "29" + "วัน 4 ชม." (ผู้ใช้สั่ง 19 ต.ค. 2569) */
    const leaveTxt = fmtLeave(left("ลากิจ") + left("ลาพักร้อน"));
    const leaveCut = leaveTxt.indexOf(" ");

    /* สิ่งที่ต้องทำ — เงื่อนไขเดียวกับแท็บรอวางบิล · แดชบอร์ดบุคคล · ทดลองงานภายใน 30 วัน */
    const toBill = acc.deals.filter(
      (d) => !d.cancelled && (d.plan.length === 0 || d.plan.some((p) => seqStatus(acc, d.no, p.seq) === "pending")),
    ).length;
    const leaveWait = hr.internLeave.filter((r) => r.status === "pending").length;
    const prob = active.filter(
      (e) => e.type === "probat" && daysBetween(today, toIsoDate(probEnd(e.startedAt))) <= 30,
    ).length;

    const day = recordsOfDay(punches, today);
    const firstIn = day.find((r) => r.type === "in");
    const last = day.at(-1);
    const checkin =
      !firstIn || !last
        ? { title: "ยังไม่ได้เช็คอิน", sub: `เข้างาน ${WORK_SCHEDULE.start} น.` }
        : last.type === "in"
          ? { title: "เช็คอินแล้ว", sub: `เข้างาน ${formatClock(new Date(firstIn.at))} น.` }
          : { title: "ออกงานแล้ว", sub: `${formatClock(new Date(firstIn.at))} – ${formatClock(new Date(last.at))} น.` };

    /* สลิปล่าสุดที่เผยแพร่แล้ว — เงื่อนไขเดียวกับหน้าสลิปของฉัน */
    const emp = hr.emp.find((e) => e.id === ROLE_EMPLOYEE.acc);
    let payslip = "ยังไม่มีสลิปที่เผยแพร่";
    if (emp) {
      const label = isDaily(emp)
        ? [...hr.dailyRounds]
            .filter((r) => r.published && inRange(emp, r))
            .sort((a, b) => a.to.localeCompare(b.to))
            .map((r) => ` ${rangeLabel(r)}`)
            .at(-1)
        : hr.slips
            .filter((s) => s.published && inPeriod(emp, s.month))
            .map((s) => s.month)
            .sort()
            .map((m) => thaiMonth(m))
            .at(-1);
      if (label) payslip = `รอบ${label}`;
    }

    return {
      stats: [
        { value: shortNum(got), unit: "฿", label: "รับชำระแล้ว", href: "/acc/billing?tab=rc" },
        { value: shortNum(owe), unit: "฿", label: "ลูกหนี้คงเหลือ", href: "/acc/billing" },
        { value: `${active.length}`, unit: "คน", label: "พนักงาน", href: "/hr/employees" },
        { value: leaveTxt.slice(0, leaveCut), unit: leaveTxt.slice(leaveCut + 1), label: "วันลาคงเหลือ", href: "/leave" },
      ],
      todos: { toBill, leaveWait, prob },
      checkin,
      leaveBox: [
        { label: "ลากิจ", n: fmtLeave(left("ลากิจ")) },
        { label: "พักร้อน", n: fmtLeave(left("ลาพักร้อน")) },
        { label: "ลาป่วย", n: fmtLeave(left("ลาป่วย")) },
      ],
      payslip,
    };
  }, [acc, hr, leaves, punches]);
}

export function AccMobileHome({
  hits,
  q,
  setQ,
  name,
  photo,
}: {
  hits: NavItem[];
  q: string;
  setQ: (v: string) => void;
  name: string;
  photo: string | null | undefined;
}) {
  const { stats, todos, checkin, leaveBox, payslip } = useAccHomeData();
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /* หัวหน้าจอทักด้วยชื่อเล่น อวาตาร์ใช้ตัวแรกของชื่อเล่น (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  const shownName = useNameOf()(name);
  const initials = initialOf(shownName);
  const showSearch = searching || q !== "";
  useEffect(() => {
    if (searching) inputRef.current?.focus();
  }, [searching]);

  const roundBtn: React.CSSProperties = {
    position: "relative",
    width: 46,
    height: 46,
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,.95)",
    background: "rgba(255,255,255,.85)",
    color: INK,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 10px 24px -16px rgba(140,20,40,.5)",
  };
  const h2Row: React.CSSProperties = { position: "relative", display: "flex", alignItems: "center", gap: 8, padding: "0 20px" };
  const h2: React.CSSProperties = { margin: 0, fontSize: 16, fontWeight: 700 };

  return (
    <div
      className="rh-home rh-acc relative -mx-4 -mt-[18px] min-h-full sm:hidden [&>*]:shrink-0"
      style={{ display: "flex", flexDirection: "column", gap: 18, padding: "22px 0 16px", background: "#FAF6F6", color: INK }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 380,
          pointerEvents: "none",
          background:
            "radial-gradient(60% 55% at 18% 18%, #FFFFFF 0%, rgba(255,255,255,0) 70%), radial-gradient(55% 60% at 85% 10%, #FFE9EC 0%, rgba(255,233,236,0) 70%), radial-gradient(70% 60% at 60% 60%, #FCD9DF 0%, rgba(252,217,223,0) 75%), linear-gradient(180deg, #F9D3DA 0%, #FDF0F2 70%, #FAF6F6 100%)",
        }}
      />

      {/* หัวหน้า — โลโก้ MAZ + ERP · ค้นหาเมนู · กระดิ่ง (แทนแถบบนของแอป) */}
      <header style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="64" height="17" viewBox="60 115 1560 410" role="img" aria-label="MAZ">
            <g fill="none" stroke="#B0101F" strokeWidth="90" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="115,470 115,170 335,355 555,170 555,470" />
              <polyline points="670,470 885,170 1105,470" />
              <polyline points="1215,170 1565,170 1215,470 1565,470" />
            </g>
          </svg>
          <span style={{ fontSize: 18, fontWeight: 700 }}>ERP</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            aria-label="ค้นหาเมนู"
            aria-expanded={showSearch}
            onClick={() => {
              if (showSearch) {
                setSearching(false);
                setQ("");
              } else setSearching(true);
            }}
            style={roundBtn}
          >
            <Svg size={20}>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </Svg>
          </button>
          {/* กระดิ่งตัวเดียวกับแถบบนของแอป — ตัวเลขคือแจ้งเตือนที่ยังไม่อ่านจริง · กดแล้วเปิดแผงแจ้งเตือนเต็มจอ (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
          <div className="rh-bell">
            <NotificationMenu
              icon={
                <Svg size={20}>
                  <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
                </Svg>
              }
            />
          </div>
        </div>
      </header>

      {/* ค้นหาเมนู — เปิดเมื่อกดแว่นขยาย ค้นจากเมนูทั้งหมดของบัญชี (ช่องค้นหาเดิมของหน้าหลัก) */}
      {showSearch && (
        <label className="relative mx-4 flex h-[46px] items-center gap-2.5 rounded-full border border-[#EFE6E8] bg-white px-4">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาเมนู..."
            aria-label="ค้นหาเมนู"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#9A8E91]"
          />
        </label>
      )}

      {/* การ์ดทักทาย + ตัวเลขสรุป 4 ช่อง */}
      <section style={{ ...GLASS, position: "relative", margin: "0 16px", padding: 16, borderRadius: 28, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              flex: "none",
              width: 52,
              height: 52,
              borderRadius: "50%",
              overflow: "hidden",
              background: "#FCE3E7",
              color: "#B0101F",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 17,
              fontWeight: 700,
              boxShadow: "0 0 0 2.5px #FFFFFF, 0 0 0 4.5px rgba(200,16,46,.35)",
            }}
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="size-full object-cover" />
            ) : (
              initials
            )}
          </span>
          <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span style={{ fontSize: 12.5, color: "#6B5F62" }}>{greetNow()}</span>
            <span className="truncate" style={{ fontSize: 17, fontWeight: 700 }}>{shownName}</span>
          </span>
        </div>
        <nav aria-label="สรุปเดือนนี้" style={{ display: "flex", padding: "12px 0", borderRadius: 16, border: "1px solid #E3D3D7", background: "rgba(250,244,245,.9)" }}>
          {stats.map((s, i) => (
            <Link
              key={s.label}
              href={s.href}
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                padding: "2px 4px",
                color: INK,
                borderRight: i < stats.length - 1 ? "1px solid #D9C8CC" : undefined,
              }}
            >
              <span style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {s.value}
                <span style={{ fontSize: 11, fontWeight: 600, color: "#6B5F62", marginLeft: 2 }}>{s.unit}</span>
              </span>
              <span style={{ fontSize: 11, color: "#8A7E81", whiteSpace: "nowrap" }}>{s.label}</span>
            </Link>
          ))}
        </nav>
      </section>

      {/* เมนู 5 ช่อง — ตอนค้นหาแสดงเมนูที่ตรงคำค้นแทน */}
      <div style={h2Row}>
        <h2 style={h2}>เมนู</h2>
      </div>
      {showSearch && q.trim() !== "" ? (
        hits.length === 0 ? (
          <p className="relative mx-4 rounded-[18px] bg-white/70 px-4 py-6 text-center text-[13px] text-[#6E6164]">
            ไม่พบเมนูที่ตรงกับ “{q}”
          </p>
        ) : (
          <nav aria-label="ผลค้นหาเมนู" style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, rowGap: 14, padding: "0 12px" }}>
            {hits.map((i, n) => {
              const Icon = ICONS[i.icon] ?? HomeIcon;
              return (
                <Tile key={i.href} href={i.href} label={i.label} grad={TILES[n % TILES.length].grad}>
                  <Icon className="size-[26px]" strokeWidth={2} />
                </Tile>
              );
            })}
          </nav>
        )
      ) : (
        <nav aria-label="เมนู" style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, padding: "0 12px" }}>
          {TILES.map((t) => (
            <Tile key={t.href} href={t.href} label={t.label} grad={t.grad}>
              <Svg size={26}>{t.icon}</Svg>
            </Tile>
          ))}
        </nav>
      )}

      {/* สิ่งที่ต้องทำวันนี้ — 3 การ์ดตามต้นแบบ ตัวเลขบนป้ายมุมขวาบนมาจากสโตร์จริง */}
      <div style={h2Row}>
        <h2 style={h2}>สิ่งที่ต้องทำวันนี้</h2>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF", background: "#C8102E", borderRadius: 6, padding: "1px 6px" }}>03</span>
      </div>
      <div className="rh-scroll" style={{ position: "relative", display: "flex", gap: 12, padding: "0 0 0 20px", overflowX: "auto" }}>
        <TodoCard href="/acc/billing" pill={`${todos.toBill} ดีล`} icon={P_DOC} title={["รอวางบิล"]} source="วางบิล" bg="#FBF1E6">
          {[70, 61, 52, 43].map((w) => (
            <FauxRow key={w} w={w} ac="#E0A04A" />
          ))}
        </TodoCard>
        <TodoCard href="/hr/dashboard" pill={`${todos.leaveWait} คำขอ`} icon={P_CAL} title={["คำขอลา", "รออนุมัติ"]} source="แดชบอร์ดบุคคล" bg="#EEF3FB">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 4, padding: 8, borderRadius: 12, background: "#F4F7FC" }}>
            {Array.from({ length: 28 }, (_, i) => {
              const on = i === 9 || i === 10 || i === 17;
              return <span key={i} style={{ height: 14, borderRadius: 4, background: on ? "#5A8FDB" : "#FFFFFF", opacity: on ? 1 : 0.95 }} />;
            })}
          </div>
          {[70, 61].map((w) => (
            <FauxRow key={w} w={w} ac="#5A8FDB" />
          ))}
        </TodoCard>
        <TodoCard href="/hr/employees" pill={`${todos.prob} คน`} icon={P_USER} title={["ครบกำหนด", "ทดลองงาน"]} source="ข้อมูลพนักงาน" bg="#FCEFF1">
          {[64, 56, 48, 40].map((w, i) => (
            <div key={w} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", borderRadius: 9, background: "#FFFFFF" }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#D9475E", opacity: i === 1 ? 0.9 : 0.35 }} />
              <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ height: 5, width: `${w}%`, borderRadius: 3, background: "#3A2A2E", opacity: 0.55 }} />
                <span style={{ height: 4, width: "40%", borderRadius: 3, background: "#9A8E91", opacity: 0.5 }} />
              </span>
            </div>
          ))}
        </TodoCard>
        <span aria-hidden="true" style={{ flex: "none", width: 8 }} />
      </div>

      {/* วันนี้ของฉัน — ลงเวลา · วันลาคงเหลือ · สลิปล่าสุด */}
      <div style={h2Row}>
        <h2 style={h2}>วันนี้ของฉัน</h2>
      </div>
      <div style={{ ...GLASS, position: "relative", margin: "0 16px", borderRadius: 24, display: "flex", flexDirection: "column" }}>
        <MyRow href="/" pad="11px 14px" iconBg="#FCE3E7" iconFg="#B0101F" icon={<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}>
          <span style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{checkin.title}</span>
            <span style={{ fontSize: 12, color: "#6B5F62" }}>{checkin.sub}</span>
          </span>
        </MyRow>
        <Hair />
        <MyRow href="/leave" pad="10px 14px" iconBg="#E3EEFC" iconFg="#1A5DB5" icon={P_CAL}>
          <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>วันลาคงเหลือ</span>
            <span style={{ display: "flex", gap: 6 }}>
              {leaveBox.map((b) => (
                <span key={b.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 0", borderRadius: 12, background: "rgba(236,240,250,.9)" }}>
                  <span style={{ fontSize: 11, color: "#6B5F62" }}>{b.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1A5DB5", whiteSpace: "nowrap" }}>{b.n}</span>
                </span>
              ))}
            </span>
          </span>
        </MyRow>
        <Hair />
        <MyRow href="/payslip" pad="11px 14px" iconBg="#DDF2E6" iconFg="#0F7049" icon={P_CASH}>
          <span style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>สลิปเงินเดือน</span>
            <span style={{ fontSize: 12, color: "#6B5F62" }}>{payslip}</span>
          </span>
        </MyRow>
      </div>
    </div>
  );
}

function Tile({ href, label, grad, children }: { href: string; label: string; grad: string; children: ReactNode }) {
  return (
    <Link href={href} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, color: INK, minWidth: 0 }}>
      <span style={{ width: 58, height: 58, borderRadius: 18, background: grad, color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: TILE_SHADOW }}>
        {children}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, textAlign: "center", lineHeight: 1.25 }}>{label}</span>
    </Link>
  );
}

function FauxRow({ w, ac }: { w: number; ac: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 8px", borderRadius: 9, background: "#FFFFFF", boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}>
      <span style={{ width: 18, height: 18, borderRadius: 6, background: ac, opacity: 0.8 }} />
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ height: 5, width: `${w}%`, borderRadius: 3, background: "#3A2A2E", opacity: 0.55 }} />
        <span style={{ height: 4, width: "45%", borderRadius: 3, background: "#9A8E91", opacity: 0.5 }} />
      </span>
      <span style={{ height: 6, width: 26, borderRadius: 3, background: ac }} />
    </div>
  );
}

/** การ์ดสิ่งที่ต้องทำ 150×184 — ภาพหลังเบลอเป็นลวดลายจากต้นแบบ ตัวเลขจริงอยู่ที่ป้ายมุมขวาบน */
function TodoCard({
  href,
  pill,
  icon,
  title,
  source,
  bg,
  children,
}: {
  href: string;
  pill: string;
  icon: ReactNode;
  title: string[];
  source: string;
  bg: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{ position: "relative", flex: "none", width: 150, height: 184, borderRadius: 24, overflow: "hidden", color: "#FFFFFF", boxShadow: "0 14px 28px -18px rgba(60,10,20,.7)" }}
    >
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: -6, padding: "16px 12px", display: "flex", flexDirection: "column", gap: 6, background: bg, filter: "blur(1.6px)", transform: "scale(1.04)" }}
      >
        {children}
      </div>
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(38,16,22,.92) 0%, rgba(38,16,22,.55) 45%, rgba(38,16,22,.05) 75%)" }}
      />
      <span
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          display: "flex",
          alignItems: "center",
          gap: 5,
          height: 28,
          padding: "0 10px",
          borderRadius: 999,
          background: "rgba(255,255,255,.28)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,.45)",
          fontSize: 12,
          fontWeight: 700,
          color: "#FFFFFF",
        }}
      >
        <Svg size={13} sw={2.2}>{icon}</Svg>
        {pill}
      </span>
      <span style={{ position: "absolute", left: 12, right: 12, bottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>
          {title.map((line, i) => (
            <span key={i} style={{ display: "block" }}>
              {line}
            </span>
          ))}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,.9)", color: "#B0101F", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Svg size={12} sw={2.2}>{icon}</Svg>
          </span>
          <span style={{ fontSize: 11.5, color: "rgba(255,255,255,.85)" }}>{source}</span>
        </span>
      </span>
    </Link>
  );
}

function MyRow({
  href,
  pad,
  iconBg,
  iconFg,
  icon,
  children,
}: {
  href: string;
  pad: string;
  iconBg: string;
  iconFg: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link href={href} style={{ display: "flex", alignItems: "center", gap: 12, padding: pad, color: INK }}>
      <span style={{ flex: "none", width: 38, height: 38, borderRadius: 12, background: iconBg, color: iconFg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Svg size={18} sw={2.1}>{icon}</Svg>
      </span>
      <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>{children}</span>
      <span style={{ flex: "none", color: "#9A8E91", display: "flex" }}>
        <Svg size={18} sw={2.1}>{P_CHEV}</Svg>
      </span>
    </Link>
  );
}

function Hair() {
  return <span aria-hidden="true" style={{ display: "block", height: 1, margin: "0 14px", background: "rgba(42,31,34,.07)" }} />;
}
