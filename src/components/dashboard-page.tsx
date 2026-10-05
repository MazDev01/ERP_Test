"use client";

import { holidays } from "@/lib/holidays";
import Link from "next/link";
import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useCrm } from "@/lib/crm-store";
import {
  cardOn,
  DASH_CARDS,
  toggleCard,
  useDashCards,
} from "@/lib/dashboard-cards";
import { downloadCsv, reportCsv } from "@/lib/report-export";
import { bkkNow, greetNow, toIsoDate, todayIso } from "@/lib/format";
import { CURRENT_USER } from "@/lib/mock-data";
import {
  AGENDA_COLOR,
  AGENDA_LABEL,
  buildAgenda,
  buildReport,
  RANGE_LABEL,
  type AgendaEvent,
  type AgendaType,
  type RangeKey,
  type Slice,
} from "@/lib/sales-report";
import {
  CalendarIcon,
  ChartIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DownloadIcon,
  GridIcon,
  TrendDownIcon,
  TrendUpIcon,
  UserIcon,
} from "./icons";
import { SalesDashboardMobile } from "./sales-dashboard-mobile";

const RANGES: RangeKey[] = ["m", "q", "y"];

/** รายงานตัดมาให้แค่ 5 อันดับ ตรงกับ buildReport */
const RANK_LIMIT = 5;

const BREAKDOWNS = [
  { key: "status", label: "สถานะ" },
  { key: "source", label: "แหล่งที่มา" },
  { key: "lost", label: "เหตุผลที่ไม่ตกลง" },
] as const;

const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** dealsHref — ปลายทางของลิงก์ "ดีล" · CEO ใช้หน้านี้แบบดูอย่างเดียวแล้วต้องไปหน้าดีลของตัวเอง */
export function DashboardPage({ dealsHref = "/deals" }: { dealsHref?: string } = {}) {
  const crm = useCrm();
  const cards = useDashCards();
  const [picker, setPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picker) return;
    const onDown = (e: PointerEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPicker(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicker(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [picker]);

  const showChart = cardOn(cards, "chart");
  const showBreakdown = cardOn(cards, "breakdown");
  const showAgenda = cardOn(cards, "agenda");
  const showCompare = cardOn(cards, "compare");
  const showRank = cardOn(cards, "rank");
  const [range, setRange] = useState<RangeKey>("m");
  /* คำทักทายตามช่วงเวลาจริงของวัน — ใช้ตัวช่วยกลางร่วมกับแดชบอร์ดหน้าอื่น */
  const hello = `${greetNow()}, ${CURRENT_USER.name.split(" ")[0]}`;
  const [breakdown, setBreakdown] = useState<"status" | "source" | "lost">("status");

  // ตัวเลขทั้งหน้าคิดจากดีล ใบเสนอราคา และการติดต่อชุดเดียวกับหน้าอื่น
  const d = useMemo(() => buildReport(crm, range, bkkNow()), [crm, range]);
  const agenda = useMemo(() => buildAgenda(crm), [crm]);

  const slices: Slice[] =
    breakdown === "status"
      ? d.statusSlices
      : breakdown === "source"
        ? d.sourceSlices
        : d.lostSlices;

  const exportCsv = () =>
    downloadCsv(
      `รายงานการขาย-${RANGE_LABEL[range]}-${todayIso()}.csv`,
      reportCsv(d, RANGE_LABEL[range]),
    );

  return (
    <>
    {/* จอคอม: แดชบอร์ดเดิมทุกอย่าง · มือถือ (แคบกว่า md) ซ่อนแล้วแสดงแบบแอปด้านล่างแทน (.sd-desk / .sd-mob) */}
    <div className="sd-desk space-y-3.5">
      {/* ── หัวเรื่องแบบตัวอย่าง: คำทักทายซ้าย เครื่องมืออยู่ขวา ── */}
      <div className="bar gap-3">
        <div>
          <h1>{hello}</h1>
          <p>มาดูภาพรวมการขายของคุณกัน</p>
        </div>
        <div ref={pickerRef} className="relative ml-auto hidden sm:block">
          <button
            type="button"
            className="btn glass-thin"
            onClick={() => setPicker((v) => !v)}
            aria-expanded={picker}
          >
            <GridIcon className="size-3.5" strokeWidth={2} />
            ปรับการ์ดที่แสดง
          </button>
          {picker && (
            <div className="glass-solid absolute top-[calc(100%+6px)] left-0 z-60 w-[248px] rounded-xl p-1.5">
              {DASH_CARDS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggleCard(c.key)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-muted"
                >
                  <span
                    className={`grid size-4 flex-none place-items-center rounded-[5px] border ${
                      cardOn(cards, c.key)
                        ? "border-primary bg-primary text-white"
                        : "border-border"
                    }`}
                    aria-hidden="true"
                  >
                    {cardOn(cards, c.key) && <CheckIcon className="size-3" strokeWidth={3} />}
                  </span>
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="tools w-full sm:w-auto">
          <div
            className="seg glass-thin flex-1 sm:flex-none"
            role="group"
            aria-label="ช่วงเวลา"
          >
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                className={range === r ? "on" : ""}
                onClick={() => setRange(r)}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn solid btn-solid"
            data-ceo-hide
            onClick={exportCsv}
          >
            <DownloadIcon className="size-3.5" strokeWidth={2} />
            ส่งออก Excel
          </button>
        </div>
      </div>

      {/* ── ตัวเลขสำคัญ ── */}
      <div className="grid grid-cols-2 gap-3.5 min-[1360px]:grid-cols-4">
        <Kpi
          tone="won"
          icon={<ChartIcon className="size-3.5" strokeWidth={2} />}
          name="มูลค่าที่ปิดได้"
          href={dealsHref}
          value={`${money(d.won)} บาท`}
          foot={`${d.wonDeals} ดีลที่ปิดในช่วงนี้`}
          delta={d.dWon}
        />
        <Kpi
          tone="info"
          icon={<UserIcon className="size-3.5" strokeWidth={2} />}
          name="ผู้สนใจใหม่"
          href="/leads"
          value={`${d.leads} ราย`}
          foot="เทียบช่วงก่อน"
          delta={d.dLead}
        />
        <Kpi
          tone="warn"
          icon={<CheckCircleIcon className="size-3.5" strokeWidth={2} />}
          /* ตัวเลขนี้นับ "ใบเสนอราคาที่ออกในช่วงนี้" ไม่ใช่ "ดีลที่ปิดในช่วงนี้"
             ดีลที่ปิดในช่วงนี้จากใบเก่าจึงไม่เข้าตัวตั้ง — บอกไว้ในบรรทัดล่างของการ์ด
             ไม่งั้นอ่านคู่กับการ์ด "มูลค่าที่ปิดได้" แล้วเหมือนตัวเลขขัดกันเอง
             (ผู้บริหารมี "อัตราปิดการขาย" อีกตัวที่นับผู้สนใจ — คนละฐาน จึงตั้งชื่อไม่ให้ซ้ำกัน) */
          name="ใบเสนอราคาที่ปิดได้"
          href="/quotations"
          value={d.quotes ? `${d.rate}%` : "—"}
          foot={
            d.quotes
              ? `ปิดได้ ${d.quoteWon} จาก ${d.quotes} ฉบับที่ออกในช่วงนี้` +
                (d.wonBefore ? ` · อีก ${d.wonBefore} ดีลปิดจากใบที่ออกก่อนช่วง` : "")
              : d.wonBefore
                ? `ไม่มีใบเสนอราคาที่ออกในช่วงนี้ · ${d.wonBefore} ดีลที่ปิดมาจากใบที่ออกก่อนช่วง`
                : "ไม่มีใบเสนอราคาที่ออกในช่วงนี้"
          }
          delta={d.quotes ? d.dRate : undefined}
        />
        <Kpi
          tone="job"
          icon={<ClockIcon className="size-3.5" strokeWidth={2} />}
          name="ระยะเวลาปิดเฉลี่ย"
          href={dealsHref}
          value={`${d.avgDays} วัน`}
          foot="จากวันออกใบเสนอราคาถึงวันปิดดีล"
        />
      </div>

      {/*
        จัดวางตามตัวอย่าง — แถวบน: กราฟกว้าง + ปฏิทินทางขวา
        แถวล่าง: สัดส่วนผู้สนใจ · ลูกค้าที่ปิดได้สูงสุด · คอลัมน์ขวา (เทียบเสนอ-ปิดได้ + สรุปช่วง)
        เปลี่ยนเฉพาะการจัดเรียง สีและผิวการ์ดยังเป็นชุดเดิมของระบบ
      */}
      {/* จอแคบตั้งคอลัมน์เป็น minmax(0,1fr) ไว้ชัด ๆ — ปล่อยเป็นคอลัมน์อัตโนมัติ ช่องจะกว้างตาม
          เนื้อหาที่ยาวที่สุด (ข้อความไทยตัดคำไม่ได้) แล้วดันทั้งแถวล้นออกนอกจอ */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-3.5 md:grid-cols-6 xl:grid-cols-8">
        {showChart && (
        /* การ์ดกราฟยืดเต็มความสูงของแถว — ถ้าปล่อยให้สูงตามเนื้อหา จะเหลือช่องว่างใต้กราฟ
           เพราะการ์ดปฏิทินข้าง ๆ ยาวกว่า (ผู้ใช้ทักท้วง 24 ก.ย. 2569) */
        <section className="glass flex h-full flex-col rounded-[15px] px-[18px] py-4 md:col-span-4 xl:col-span-6">
          <h2 className="text-sm font-semibold">แนวโน้มมูลค่าที่ปิดได้</h2>
          {/* แต่ละรายการอยู่คนละบรรทัด ไม่ใช้เครื่องหมายคั่น (ต้นแบบ .il) */}
          <p className="mt-[3px] text-[11.5px] text-muted-foreground">
            <span className="block leading-[1.6]">{d.note}</span>
            <span className="block leading-[1.6]">เสนอไป {money(d.quoted)} บาท</span>
          </p>
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <RevenueChart series={d.series} />
          </div>
        </section>
        )}

        {/* ── ปฏิทินนัดหมาย ── */}
        {showAgenda && (
          <div className="md:col-span-2 [&>section]:h-full">
            <AgendaCard events={agenda} />
          </div>
        )}

        {showBreakdown && (
        <section className="glass flex flex-col rounded-[15px] px-[18px] py-4 md:col-span-3">
          <h2 className="text-sm font-semibold">สัดส่วนผู้สนใจ</h2>
          <div className="seg glass-thin mt-3">
            {BREAKDOWNS.map((b) => (
              <button
                key={b.key}
                type="button"
                className={breakdown === b.key ? "on" : ""}
                onClick={() => setBreakdown(b.key)}
              >
                {b.label}
              </button>
            ))}
          </div>
          <Breakdown slices={slices} />
        </section>
        )}

          {/* ── อันดับลูกค้า ── */}
          {showRank && (
          <section className="glass rounded-[15px] px-[18px] py-4 md:col-span-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              ลูกค้าที่ปิดได้สูงสุด
              {/* ช่องขวาแคบเกินใส่ยอดเต็ม จึงย่อเป็นพันบาท แล้วบอกหน่วยไว้ที่หัวเรื่อง */}
              <em className="ml-auto text-[11.5px] font-normal text-muted-foreground not-italic">
                {RANK_LIMIT} อันดับแรก · พันบาท
              </em>
            </h2>
            {d.rank.length === 0 && (
              <p className="py-8 text-center text-[12.5px] text-muted-foreground">
                ยังไม่มีดีลที่ปิดได้ในช่วงนี้
              </p>
            )}
            <div className="mt-2.5 flex flex-col">
              {d.rank.map((r, i) => (
                /* กดชื่อลูกค้าแล้วไปดูรายละเอียดต่อได้ ไม่ใช่ตัวเลขลอย ๆ */
                <Link
                  key={r.code}
                  href={`/leads/${r.code}`}
                  className="grid grid-cols-[18px_minmax(0,1fr)_60px_44px] items-center gap-2 border-b border-border py-[9px] transition-colors last:border-b-0 hover:bg-muted sm:grid-cols-[20px_minmax(0,1fr)_96px_46px] sm:gap-2.5"
                >
                  <span className="num text-[11.5px] font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <b className="truncate text-[12.5px] font-medium">{r.name}</b>
                  <span className="block h-[7px] overflow-hidden rounded-[5px] bg-black/8">
                    <i
                      className="block h-full rounded-[5px] bg-primary"
                      style={{ width: `${Math.max(4, pct(r.value, d.rank[0].value))}%` }}
                    />
                  </span>
                  <span className="num text-right text-xs font-semibold" title={`${money(r.value)} บาท`}>
                    {money(Math.round(r.value / 1000))}k
                  </span>
                </Link>
              ))}
            </div>
            {/* ตามต้นแบบ — ไปดูดีลทั้งหมด */}
            <Link
              href={dealsHref}
              className="mt-3 flex h-9 w-full items-center justify-center gap-[7px] rounded-[10px] border border-border bg-white text-[12.5px] font-semibold text-muted-foreground transition-colors hover:border-[#9aa1ae] hover:text-foreground"
            >
              ดูทั้งหมดในหน้าดีล
              <ChevronRightIcon className="size-3.5" strokeWidth={2.2} />
            </Link>
          </section>
          )}

          {/* ── เทียบเสนอ vs ปิดได้ ── */}
          {showCompare && (
          <section className="glass rounded-[15px] px-[18px] py-4 md:col-span-3 xl:col-span-2">
            <h2 className="text-sm font-semibold">เสนอราคา เทียบ ปิดได้</h2>
            <p className="mt-[3px] text-[11.5px] text-muted-foreground">
              จำนวนฉบับที่เสนอ เทียบกับดีลที่ปิดได้ในเดือนเดียวกัน
            </p>
            <div className="mt-2.5 flex gap-3.5 text-[11.5px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <i className="size-2 rounded-[3px] bg-brand-100" />
                เสนอราคา
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="size-2 rounded-[3px] bg-primary" />
                ปิดได้
              </span>
            </div>
            <CompareBars data={d.compare} />
          </section>
          )}

          {/*
            สรุปช่วงที่เลือกเป็นประโยคเดียวปิดท้ายคอลัมน์ขวา (โครง mockup 24 ก.ย. 2569)
            ตัวเลขชุดเดียวกับการ์ดด้านบน ไม่ได้นับใหม่ — พื้นสีหลัก ไม่มีภาพตกแต่งแบบ mockup
          */}
          <section className="rounded-[15px] bg-primary px-[18px] py-4 text-white md:col-span-3 xl:col-span-2">
            <b className="block text-[15.5px] leading-[1.35] font-bold">
              {d.wonDeals
                ? `${RANGE_LABEL[range]}ปิดได้ ${d.wonDeals} ดีลแล้ว`
                : `ยังไม่มีดีลที่ปิดได้${RANGE_LABEL[range]}`}
            </b>
            <p className="mt-1.5 text-[12.5px] leading-[1.55] text-white/80">
              {d.wonDeals
                ? `รวม ${money(d.won)} บาท · เสนอไปแล้ว ${money(d.quoted)} บาท`
                : "ใบเสนอราคาที่ส่งไว้รอติดตามอยู่ ลุยต่อกัน"}
            </p>
          </section>
      </div>
    </div>

    {/* มือถือ: ตามต้นแบบ dashboard (2).html ส่วน .mob — ใช้ตัวเลขและช่วงเวลาชุดเดียวกับด้านบน */}
    <SalesDashboardMobile
      d={d}
      range={range}
      onRange={setRange}
      events={agenda}
      today={todayIso()}
      hello={hello}
      dealsHref={dealsHref}
      onExport={exportCsv}
    />
    </>
  );
}

// ─── ตัวเลขสำคัญ ──────────────────────────────────────────────────
const KPI_TONE = {
  won: "bg-[#ecfdf5] text-[#009767]",
  info: "bg-[#eff6ff] text-[#155dfc]",
  warn: "bg-[#fffbeb] text-[#b75000]",
  job: "bg-[#f3f0ff] text-[#7552db]",
};

/*
 * ตัวเลขทุกใบมาจากรายการที่มีหน้าของมันอยู่แล้ว จึงทำเป็นลิงก์ทั้งใบ
 * กดแล้วไปดูของจริงที่นับมาได้เลย ไม่ต้องเดาว่าเลขนี้มาจากไหน
 */
function Kpi({
  tone,
  icon,
  name,
  value,
  foot,
  delta,
  href,
}: {
  tone: keyof typeof KPI_TONE;
  icon: React.ReactNode;
  name: string;
  value: string;
  foot: string;
  delta?: number;
  href: string;
}) {
  return (
    <Link href={href} className="glass block min-w-0 rounded-[15px] px-[15px] py-3.5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2.5">
        <span className="text-[12.5px] text-muted-foreground">{name}</span>
        <span className={`grid size-[26px] shrink-0 place-items-center rounded-lg ${KPI_TONE[tone]}`}>
          {icon}
        </span>
      </div>
      <b className="num mt-[9px] block truncate text-[21px] leading-[1.25] font-bold">
        {value}
      </b>
      <div className="mt-[7px] flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
        {/* มือถือการ์ดแคบ ให้คำอธิบายขึ้นบรรทัดใหม่ได้ ไม่ถูกตัดกลางประโยค */}
        <span className="truncate max-sm:whitespace-normal max-sm:leading-snug">{foot}</span>
        {delta != null && (
          <span
            /* ต้นแบบ .pill — ตัวอักษรสีพร้อมลูกศร ไม่มีพื้น */
            className={`inline-flex shrink-0 items-center gap-1 text-[11.5px] font-semibold ${
              delta >= 0 ? "text-[var(--success)]" : "text-destructive"
            }`}
          >
            {delta >= 0 ? (
              <TrendUpIcon className="size-[13px]" strokeWidth={2.4} />
            ) : (
              <TrendDownIcon className="size-[13px]" strokeWidth={2.4} />
            )}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
    </Link>
  );
}

// ─── กราฟเส้น ─────────────────────────────────────────────────────
function RevenueChart({ series }: { series: [string, number][] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 200;

  const { pts, top, step } = useMemo(() => {
    const max = Math.max(...series.map((s) => s[1]), 1);
    const step = Math.ceil(max / 3 / 10000) * 10000 || 1;
    const top = step * 3;
    const n = series.length;
    const pts = series.map(([, v], i) => {
      const x = n > 1 ? Math.round((i / (n - 1)) * W) : W / 2;
      const y = Number((H - (v / top) * H).toFixed(1));
      return [x, y] as [number, number];
    });
    return { pts, top, step };
  }, [series]);

  function pointAt(e: ReactPointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - r.left) / r.width;
    const n = series.length;
    setHover(Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1)))));
  }

  const line = smoothPath(pts, H);
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;

  return (
    <div className="relative mt-4 h-[212px] pb-6 pl-[46px]">
      {[3, 2, 1, 0].map((i) => {
        const v = step * i;
        return (
          <div
            key={i}
            className="absolute right-0 left-[46px] border-t border-dashed border-[#edf0f4]"
            style={{ bottom: 24 + (v / top) * (212 - 24 - 6) }}
          >
            <span className="num absolute -top-2 -left-[46px] text-[10.5px] text-muted-foreground">
              {v ? `${Math.round(v / 1000)}k` : "0"}
            </span>
          </div>
        );
      })}

      <div
        className="relative h-full"
        onPointerLeave={() => setHover(null)}
        /* ใช้ pointer แทน mouse — บนมือถือแตะหรือลากนิ้วบนกราฟก็ขึ้นป้ายยอดของช่วงนั้น */
        onPointerDown={(e) => pointAt(e)}
        onPointerMove={(e) => pointAt(e)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-full w-full overflow-visible"
          role="img"
          aria-label="กราฟมูลค่าที่ปิดได้รายช่วง"
        >
          <defs>
            <linearGradient id="gradWon" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#db0000" stopOpacity=".26" />
              <stop offset="100%" stopColor="#db0000" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#gradWon)" />
          <path
            d={line}
            fill="none"
            stroke="#db0000"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {pts.map(([x, y], i) => (
            <circle
              key={series[i][0]}
              cx={x}
              cy={y}
              r="4"
              fill="#fff"
              stroke="#db0000"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
              opacity={hover === i ? 1 : 0}
            />
          ))}
        </svg>

        {hover !== null && (
          <>
            <span
              className="absolute inset-y-0 w-px bg-[#e4e8ee]"
              style={{
                left: `${series.length > 1 ? (hover / (series.length - 1)) * 100 : 50}%`,
              }}
            />
            <span
              className="glass-solid pointer-events-none absolute z-5 -translate-x-1/2 -translate-y-[108%] rounded-[10px] px-[11px] py-2 text-[11.5px] whitespace-nowrap"
              style={{
                left: `${series.length > 1 ? (hover / (series.length - 1)) * 100 : 50}%`,
                top: `${(pts[hover][1] / H) * 100}%`,
              }}
            >
              {series[hover][0]}
              <b className="num mt-0.5 block text-[13px] font-bold">
                {baht(series[hover][1])} บาท
              </b>
            </span>
          </>
        )}

        <div className="absolute -bottom-[22px] flex w-full justify-between">
          {series.map(([label], i) => (
            <span
              key={label}
              /* มือถือ: ช่วงเยอะเกินจะอ่านไม่ออก (เช่น 12 เดือน) แสดงป้ายเว้นช่อง และไม่ตัดท้ายตัวอักษร */
              className={`flex-1 truncate px-0.5 text-center text-[10.5px] text-muted-foreground max-sm:overflow-visible max-sm:px-0 max-sm:text-[10px] ${
                series.length > 6 && i % 2 ? "max-sm:invisible" : ""
              }`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── สัดส่วน ──────────────────────────────────────────────────────
const DONUT_R = 45;
const DONUT_C = 2 * Math.PI * DONUT_R;

function Breakdown({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((a, s) => a + s.value, 0);

  /* วงกลมวาดทีละส่วนด้วยความยาวเส้นประ จุดเริ่มของแต่ละส่วนคือยอดสะสมก่อนหน้า */
  const visible = slices.filter((s) => s.value > 0);
  const arcs = visible.map((s, i) => {
    const before = visible.slice(0, i).reduce((sum, x) => sum + x.value, 0);
    return {
      ...s,
      length: total ? (DONUT_C * s.value) / total : 0,
      offset: total ? (DONUT_C * before) / total : 0,
    };
  });

  return (
    <div className="mt-3.5 flex flex-1 flex-col items-stretch gap-[22px] sm:flex-row sm:items-center">
      <svg
        viewBox="0 0 120 120"
        className="size-[150px] flex-none self-center"
        role="img"
        aria-label={`สัดส่วนทั้งหมด ${total} ราย`}
      >
        <circle cx="60" cy="60" r={DONUT_R} fill="none" stroke="#edeff3" strokeWidth="17" />
        {arcs.map((a) => (
          <circle
            key={a.label}
            cx="60"
            cy="60"
            r={DONUT_R}
            fill="none"
            stroke={a.color}
            strokeWidth="17"
            strokeDasharray={`${a.length.toFixed(2)} ${(DONUT_C - a.length).toFixed(2)}`}
            strokeDashoffset={(-a.offset).toFixed(2)}
            transform="rotate(-90 60 60)"
          >
            <title>{`${a.label} · ${a.value} ราย`}</title>
          </circle>
        ))}
        <text
          x="60"
          y="59"
          textAnchor="middle"
          className="num fill-foreground text-[19px] font-bold"
        >
          {total}
        </text>
        <text
          x="60"
          y="72"
          textAnchor="middle"
          className="fill-muted-foreground text-[8.5px]"
        >
          ทั้งหมด
        </text>
      </svg>

      <div className="flex min-w-0 flex-1 flex-col gap-[11px]">
        {slices.map((s) => (
          <div
            key={s.label}
            className="flex items-center justify-between gap-3"
            title={`${s.label} · ${s.value} ราย`}
          >
            <span className="flex min-w-0 items-center gap-[7px] text-[12.5px] text-muted-foreground">
              <i className="size-[7px] shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="num shrink-0 text-right text-[12.5px] font-semibold">
              {pct(s.value, total)}%
            </span>
          </div>
        ))}
        {slices.length === 0 && (
          <p className="py-6 text-center text-[12.5px] text-muted-foreground">
            ยังไม่มีข้อมูลในช่วงนี้
          </p>
        )}
      </div>
    </div>
  );
}

// ─── แท่งเทียบ ────────────────────────────────────────────────────
function CompareBars({ data }: { data: [string, number, number][] }) {
  const max = Math.max(...data.map((c) => Math.max(c[1], c[2])), 1);
  return (
    <div className="mt-3 flex h-[132px] items-end gap-[9px] pb-5">
      {data.map(([label, a, b], i) => (
        <div
          key={label}
          className="relative flex h-full flex-1 items-end justify-center gap-[3px]"
          title={`${label} · เสนอ ${a} ปิดได้ ${b}`}
        >
          <span
            className="block w-[9px] rounded-t bg-brand-100"
            style={{ height: `${Math.max(3, Math.round((a / max) * 100))}%` }}
          />
          <span
            className="block w-[9px] rounded-t bg-primary"
            style={{ height: `${Math.max(3, Math.round((b / max) * 100))}%` }}
          />
          <span
            className={`absolute -bottom-[18px] text-[10.5px] text-muted-foreground max-sm:text-[10px] max-sm:whitespace-nowrap ${
              data.length > 6 && i % 2 ? "max-sm:invisible" : ""
            }`}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── ปฏิทินนัดหมาย ────────────────────────────────────────────────
function AgendaCard({ events }: { events: AgendaEvent[] }) {
  const now = bkkNow();
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState(() => toIsoDate(now));

  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const first = new Date(y, m, 1).getDay();
  const last = new Date(y, m + 1, 0).getDate();
  /* วันของเดือนก่อน/ถัดไปที่เติมให้เต็มแถว (สีจาง กดไม่ได้) และวันนี้ — ตาม mockup */
  const prevLast = new Date(y, m, 0).getDate();
  const tail = (7 - ((first + last) % 7)) % 7;
  const todayStr = toIsoDate(now);
  const monthCount = events.filter((e) => {
    const [ey, em] = e.date.split("-").map(Number);
    return ey === y && em - 1 === m;
  }).length;
  const dayEvents = events.filter((e) => e.date === selected);

  return (
    <section className="glass rounded-[15px] px-[18px] py-4">
      <h2 className="flex items-center gap-[9px] text-sm font-semibold">
        <CalendarIcon className="size-[15px]" strokeWidth={2} />
        นัดติดตามและกำหนดส่ง
        <em className="ml-auto text-[11.5px] font-normal text-muted-foreground not-italic">
          เดือนนี้ {monthCount} รายการ
        </em>
      </h2>

      {/* การ์ดนี้อยู่คอลัมน์แคบของแถวบน (ตามการจัดเรียงแบบตัวอย่าง)
          ปฏิทินจึงวางบน รายการนัดของวันที่เลือกวางล่าง ไม่แบ่งสองคอลัมน์อีก */}
      <div className="mt-3.5 grid gap-4">
        <div className="min-w-0">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <button
              type="button"
              className="iconbtn glass-thin size-7 rounded-lg"
              onClick={() => setCursor(new Date(y, m - 1, 1))}
              aria-label="เดือนก่อนหน้า"
            >
              <ChevronLeftIcon className="size-3.5" strokeWidth={2.4} />
            </button>
            <span className="text-[13.5px] font-semibold">
              {TH_MONTHS[m]} {y + 543}
            </span>
            <button
              type="button"
              className="iconbtn glass-thin size-7 rounded-lg"
              onClick={() => setCursor(new Date(y, m + 1, 1))}
              aria-label="เดือนถัดไป"
            >
              <ChevronRightIcon className="size-3.5" strokeWidth={2.4} />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d) => (
              <span
                key={d}
                className="py-1 text-center text-[10.5px] font-semibold text-muted-foreground"
              >
                {d}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: first }, (_, i) => (
              <span
                key={`b${i}`}
                aria-hidden
                className="num flex aspect-square items-center justify-center text-[12.5px] text-[#D3D7DE]"
              >
                {prevLast - first + 1 + i}
              </span>
            ))}
            {Array.from({ length: last }, (_, i) => {
              const d = i + 1;
              const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
              const types: AgendaType[] = [
                ...new Set(events.filter((e) => e.date === iso).map((e) => e.type)),
              ];
              const isSelected = iso === selected;
              const isToday = iso === todayStr;
              const holiday = holidays()[iso];
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelected(iso)}
                  title={holiday}
                  aria-label={holiday ? `${d} ${holiday}` : undefined}
                  className={`num flex aspect-square flex-col items-center justify-center gap-[3px] rounded-[9px] text-[12.5px] transition-colors ${
                    isSelected
                      ? "bg-primary font-semibold text-white"
                      : holiday
                        ? "bg-[var(--destructive-soft)] font-semibold text-destructive hover:bg-[var(--destructive-soft)]"
                        : "hover:bg-black/5"
                  }${isToday && !isSelected ? " font-bold text-primary shadow-[inset_0_0_0_1.5px_var(--primary)]" : ""}`}
                >
                  {d}
                  <span className="flex h-[5px] gap-[3px]">
                    {types.map((t) => (
                      <i
                        key={t}
                        className="block size-[5px] rounded-full"
                        style={{
                          background: isSelected ? "rgb(255 255 255 / 0.9)" : AGENDA_COLOR[t],
                        }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
            {Array.from({ length: tail }, (_, i) => (
              <span
                key={`a${i}`}
                aria-hidden
                className="num flex aspect-square items-center justify-center text-[12.5px] text-[#D3D7DE]"
              >
                {i + 1}
              </span>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2.5 border-t border-border pt-[11px] text-[10.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              {/* สี่เหลี่ยมพื้นอ่อน ให้ต่างจากจุดของนัดหมาย — ตรงกับช่องวันหยุดในปฏิทิน */}
              <i className="size-[9px] rounded-[3px] bg-[var(--destructive-soft)] ring-1 ring-destructive" />
              วันหยุด
            </span>
            {(Object.keys(AGENDA_COLOR) as AgendaType[]).map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <i className="size-[7px] rounded-full" style={{ background: AGENDA_COLOR[t] }} />
                {AGENDA_LABEL[t]}
              </span>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <p className="border-b border-border pb-[9px] text-[12.5px] font-semibold text-muted-foreground">
            <span className="block leading-[1.6]">{thaiFull(selected)}</span>
            <span className="block leading-[1.6]">{dayEvents.length} รายการ</span>
            {holidays()[selected] && (
              <span className="mt-1 inline-block rounded-full bg-[var(--destructive-soft)] px-2 py-0.5 text-[11.5px] text-destructive">
                วันหยุด · {holidays()[selected]}
              </span>
            )}
          </p>
          {dayEvents.length === 0 ? (
            <p className="py-[22px] text-[12.5px] text-muted-foreground">
              ไม่มีนัดหมายหรือกำหนดส่งในวันนี้
            </p>
          ) : (
            dayEvents.map((e) => (
              <Link
                key={e.id}
                href={e.href}
                className="grid grid-cols-[4px_minmax(0,1fr)] gap-[11px] border-b border-border py-3 transition-colors last:border-b-0 hover:bg-muted"
              >
                <span className="rounded-[3px]" style={{ background: AGENDA_COLOR[e.type] }} />
                <span>
                  <b className="block text-[13px] font-medium">{e.title}</b>
                  <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                    {e.detail}
                  </span>
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

// ─── ตัวช่วย ──────────────────────────────────────────────────────
function pad(n: number) {
  return String(n).padStart(2, "0");
}

function money(n: number) {
  return n.toLocaleString("th-TH");
}

function baht(n: number) {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pct(a: number, b: number) {
  return b ? Math.round((a / b) * 1000) / 10 : 0;
}

function thaiFull(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/**
 * เส้นโค้งนุ่ม ๆ แบบ Catmull-Rom แปลงเป็น cubic bezier
 *
 * จุดควบคุมของ Catmull-Rom เหวี่ยงเกินค่าจริงได้ (overshoot) พอช่วงหนึ่งเป็น 0 แล้วช่วงถัดไปพุ่ง
 * เส้นจะแอ่นต่ำกว่าเส้นศูนย์ — อ่านแล้วเหมือนมูลค่าที่ปิดได้ติดลบ ซึ่งเป็นไปไม่ได้
 * จึงหนีบจุดควบคุมให้อยู่ในกรอบกราฟเสมอ (0 = เพดาน · H = เส้นศูนย์ในพิกัด SVG)
 */
function smoothPath(pts: [number, number][], H = 200) {
  if (pts.length < 2) return "";
  const clamp = (y: number) => Math.min(H, Math.max(0, y));
  let p = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = clamp(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = clamp(p2[1] - (p3[1] - p1[1]) / 6);
    p += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0]} ${p2[1]}`;
  }
  return p;
}
