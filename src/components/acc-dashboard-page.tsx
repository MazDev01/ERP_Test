"use client";

/*
 * แดชบอร์ดบัญชี (ต้นแบบ dose-erp-maz/acc-dashboard.html · ceo-acc.html ใช้แบบเดียวกัน)
 * ลูกหนี้คงเหลือนับเป็นจำนวนใบ · กราฟเส้นวางบิลเทียบรับชำระอยู่ก่อนโดนัท
 * ตารางขวาล่างเป็นภาษีที่บริษัทหักผู้รับเงิน (AC-BR-08) ไม่ใช่ที่ลูกค้าหักบริษัท
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { INVOICE_STATUS, whtAmount, type InvoiceStatus } from "@/lib/acc-data";
import { awaitingReceipt, invoiceDue, invoiceStatus, useAcc } from "@/lib/acc-store";
import { FileIcon, CheckCircleIcon, ClockIcon, BellIcon, TaxIcon } from "./icons";
import {
  TH_MONTHS_FULL,
  baht,
  bkkNow,
  daysBetween,
  thaiDate,
  toIsoDate,
} from "@/lib/format";

type Range = "m" | "q" | "y";

const MON = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

const RANGES: { key: Range; label: string }[] = [
  { key: "m", label: "เดือนนี้" },
  { key: "q", label: "ไตรมาส" },
  { key: "y", label: "ปีนี้" },
];

/** สีของแต่ละสถานะในโดนัท — คู่กับป้ายสถานะที่ใช้ทั้งระบบ */
const SLICE: Record<Exclude<InvoiceStatus, "cancelled">, string> = {
  pending: "var(--warning)",
  partial: "var(--info)",
  paid: "var(--success)",
};

export function AccDashboardPage() {
  const acc = useAcc();
  const [range, setRange] = useState<Range>("m");
  const now = bkkNow();
  const today = toIsoDate(now);
  const from = toIsoDate(startOf(range, now));

  const inRange = (iso: string) => Boolean(iso) && iso >= from && iso <= today;

  /* ยอดวางบิล = ยอดตามใบแจ้งหนี้ที่ออกในช่วงนี้ ใบที่ถูกยกเลิกไปแล้วไม่นับเป็นยอดวางบิล */
  const billed = acc.invoices
    .filter((v) => inRange(v.issue) && invoiceStatus(acc, v) !== "cancelled")
    .reduce((a, v) => a + v.total, 0);
  const got = acc.payments
    .filter((p) => inRange(p.date))
    .reduce((a, p) => a + p.received + p.wht, 0);
  /* ลูกหนี้อ่านจาก awaitingReceipt ชุดเดียวกับหน้าใบเสร็จ หน้าวางบิล และกระดิ่ง ตัวเลขจะได้ตรงกันทุกที่ */
  const openInv = awaitingReceipt(acc);
  const late = openInv.filter((v) => daysBetween(v.due, today) > 0);
  const lateSum = late.reduce((a, v) => a + invoiceDue(v), 0);

  const slices = (["pending", "partial", "paid"] as const).map((k) => ({
    key: k,
    label: INVOICE_STATUS[k].label,
    color: SLICE[k],
    n: acc.invoices.filter((v) => invoiceStatus(acc, v) === k && inRange(v.issue)).length,
  }));
  const sliceTotal = slices.reduce((a, s) => a + s.n, 0);

  const buckets = makeBuckets(range, now).map((b) => ({
    label: b.label,
    /* เส้นวางบิลคิดชุดเดียวกับการ์ดตัวเลขด้านบน — ใบที่ยกเลิกแล้วไม่นับ */
    billed: acc.invoices
      .filter((v) => v.issue >= b.from && v.issue <= b.to && invoiceStatus(acc, v) !== "cancelled")
      .reduce((a, v) => a + v.total, 0),
    got: acc.payments
      .filter((p) => p.date >= b.from && p.date <= b.to)
      .reduce((a, p) => a + p.received + p.wht, 0),
  }));

  /* ภาษีที่บริษัทหักผู้รับเงินในช่วงนี้ ชุดเดียวกับหน้ายื่นภาษี — ใหม่สุดก่อน 5 รายการ */
  const whtList = acc.wht
    .filter((r) => inRange(r.date))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return (
    <div className="space-y-3.5">
      <div className="bar">
        <div>
          <h1>แดชบอร์ดบัญชี</h1>
          <p>{rangeNote(range, now)}</p>
        </div>
        <div className="tools">
          <div className="seg">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                className={range === r.key ? "on" : ""}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        <Kpi
          icon={<FileIcon className="size-[17px]" />}
          skin="info"
          title="วางบิลในช่วงนี้"
          value={`${baht(billed)} บาท`}
          meta="ยอดตามใบแจ้งหนี้ที่ออกในช่วงที่เลือก ไม่นับใบที่ยกเลิก"
        />
        <Kpi
          icon={<CheckCircleIcon className="size-[17px]" />}
          skin="won"
          title="รับชำระในช่วงนี้"
          value={`${baht(got)} บาท`}
          meta="เงินโอนบวกภาษีที่ลูกค้าหักไว้"
        />
        <Kpi
          icon={<ClockIcon className="size-[17px]" />}
          skin="warn"
          title="ลูกหนี้คงเหลือ"
          value={`${openInv.length} ใบแจ้งหนี้`}
          meta={`ยังไม่ได้รับชำระ · ${baht(openInv.reduce((a, v) => a + invoiceDue(v), 0))} บาท`}
        />
        <Kpi
          icon={<BellIcon className="size-[17px]" />}
          skin="late"
          title="เกินกำหนด"
          value={`${baht(lateSum)} บาท`}
          meta={`${late.length} ใบแจ้งหนี้`}
          tone={late.length ? "bad" : undefined}
        />
      </div>

      <div className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,1.34fr)_minmax(0,0.66fr)]">
        <section className="glass rounded-[15px] px-5 py-[18px]">
          <h2 className="text-[15px] font-bold">วางบิล เทียบ รับชำระ</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            ยอดตามใบแจ้งหนี้ที่ออก เทียบกับเงินที่รับเข้าจริงในเดือนเดียวกัน
          </p>
          <p className="mt-2.5 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <i
                className="block size-2.5 rounded-[3px] bg-[#F3B7C0]"
                aria-hidden="true"
              />
              วางบิล
            </span>
            <span className="flex items-center gap-1.5">
              <i
                className="block size-2.5 rounded-[3px] bg-primary"
                aria-hidden="true"
              />
              รับชำระ
            </span>
          </p>
          <LineChart buckets={buckets} />
        </section>
        <section className="glass rounded-[15px] px-5 py-[18px]">
          <h2 className="text-[15px] font-bold">สถานะใบแจ้งหนี้</h2>
          <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            <Donut slices={slices} total={sliceTotal} />
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              {/* จำนวนและสัดส่วนอยู่ในบรรทัดเดียวกับชื่อสถานะ (โครง mockup 24 ก.ย. 2569) */}
              {slices.map((s) => (
                <p key={s.key} className="flex items-center gap-2 text-[13px]">
                  <i
                    className="block size-2.5 flex-none rounded-full"
                    style={{ background: s.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.label}</span>
                  <b className="num font-bold">{s.n}</b>
                  <em className="num text-[11.5px] text-muted-foreground not-italic">
                    {sliceTotal ? Math.round((s.n * 1000) / sliceTotal) / 10 : 0}%
                  </em>
                </p>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* แถวล่างตามโครง mockup 24 ก.ย. 2569 — สองตารางซ้าย คอลัมน์ขวาเป็นรับชำระล่าสุดและสรุปช่วงนี้ */}
      {/* จอแคบตั้งคอลัมน์เป็น minmax(0,1fr) ไว้ชัด ๆ — ปล่อยเป็นคอลัมน์อัตโนมัติ ช่องจะกว้างตาม
          เนื้อหาที่ยาวที่สุด (ข้อความไทยตัดคำไม่ได้) แล้วดันทั้งแถวล้นออกนอกจอ */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-3.5 md:grid-cols-6 xl:grid-cols-8">
        {/* สองการ์ดนี้เป็นรายการแถวเดียวจบตามโครง mockup ไม่ใช่ตารางกว้าง
            เพราะอยู่คอลัมน์แคบ ตารางสี่คอลัมน์จะถูกตัดจนอ่านยอดไม่ครบ */}
        <section className="glass flex h-full flex-col md:col-span-3 rounded-[14px] px-5 py-[18px]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-bold">ลูกหนี้ค้างนานสุด</h2>
            <Link href="/acc/billing" className="text-[12.5px] font-semibold text-primary">
              วางบิล
            </Link>
          </div>
          {/* สูงคงที่ตามตัวอย่าง — การ์ดในแถวเดียวกันสูงเท่ากันไม่ว่ามีกี่แถว */}
          {late.length === 0 ? (
            <p className="grid min-h-[240px] flex-1 place-items-center text-center text-[13px] text-muted-foreground">
              ไม่มีใบแจ้งหนี้ที่เกินกำหนด
            </p>
          ) : (
            <ul className="mt-1.5 min-h-[240px] flex-1 divide-y divide-border overflow-y-auto">
              {[...late]
                .sort((x, y) => daysBetween(y.due, today) - daysBetween(x.due, today))
                .slice(0, 5)
                .map((v, i) => (
                  <li key={v.no} className="flex items-center gap-3 py-[11px]">
                    <span className="num grid size-8 flex-none place-items-center rounded-[10px] bg-[var(--accent)] text-[13px] font-bold text-primary">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px] font-medium">{v.cus}</b>
                      <em className="num block truncate text-[11.5px] text-muted-foreground not-italic">
                        {v.no} · {baht(invoiceDue(v))} บาท
                      </em>
                    </span>
                    <span className="tag t-late flex-none">
                      <i />
                      เกิน {daysBetween(v.due, today)} วัน
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className="glass flex h-full flex-col md:col-span-3 rounded-[14px] px-5 py-[18px]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-bold">หัก ณ ที่จ่าย</h2>
            <Link href="/acc/wht" className="text-[12.5px] font-semibold text-primary">
              ยื่นภาษี
            </Link>
          </div>
          {whtList.length === 0 ? (
            <p className="grid min-h-[240px] flex-1 place-items-center text-center text-[13px] text-muted-foreground">
              ไม่มีรายการหักภาษีในช่วงนี้
            </p>
          ) : (
            <ul className="mt-1.5 min-h-[240px] flex-1 divide-y divide-border overflow-y-auto">
              {whtList.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-[11px]">
                  <span className="grid size-8 flex-none place-items-center rounded-[10px] bg-[var(--accent)] text-primary">
                    <TaxIcon className="size-[15px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13.5px] font-medium">{r.name}</b>
                    <em className="num block truncate text-[11.5px] text-muted-foreground not-italic">
                      {thaiDate(r.date)} · หัก {baht(whtAmount(r))} บาท
                    </em>
                  </span>
                  <span className="tag t-early flex-none">
                    <i />
                    {r.kind === "53" ? "ภ.ง.ด.53" : "ภ.ง.ด.3"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex h-full flex-col gap-3.5 md:col-span-6 xl:col-span-2">
          <RecentReceipts acc={acc} />
          <RangeNote got={got} billed={billed} lateCount={late.length} range={range} />
        </div>
      </div>
    </div>
  );
}

/*
 * รับชำระล่าสุด — สี่ใบเสร็จใหม่สุด (โครง mockup 24 ก.ย. 2569)
 * ไม่กรองตามช่วงที่เลือก เพราะการ์ดนี้ตอบว่า "เงินเข้าล่าสุดเมื่อไร" ไม่ใช่ยอดของช่วง
 */
function RecentReceipts({ acc }: { acc: ReturnType<typeof useAcc> }) {
  const list = [...acc.receipts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  return (
    <section className="glass flex flex-1 flex-col rounded-[14px] px-5 py-[18px]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold">รับชำระล่าสุด</h2>
        <Link href="/acc/receipts" className="text-[12.5px] font-semibold text-primary">
          ใบเสร็จ
        </Link>
      </div>
      {list.length === 0 ? (
        <p className="grid flex-1 place-items-center text-[13px] text-muted-foreground">
          ยังไม่มีการรับชำระ
        </p>
      ) : (
        <ul className="mt-2 flex-1 divide-y divide-border overflow-y-auto">
          {list.map((r) => (
            <li key={r.no} className="flex items-center gap-3 py-2.5">
              <span className="grid size-9 flex-none place-items-center rounded-[11px] bg-[var(--accent)] text-primary">
                <CheckCircleIcon className="size-[17px]" />
              </span>
              <span className="min-w-0 flex-1">
              <b className="block truncate text-[13px] font-semibold">
                {r.cus} · <span className="num">{baht(r.base + r.vatAmount)}</span> บาท
              </b>
              <em className="num block truncate text-[11.5px] text-muted-foreground not-italic">
                {thaiDate(r.date)} · {r.no}
              </em>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* สรุปช่วงที่เลือกเป็นประโยคเดียว (mockup เรียกการ์ดนี้ว่า cheer) — พื้นสีหลัก ไม่มีภาพตกแต่ง */
function RangeNote({
  got,
  billed,
  lateCount,
  range,
}: {
  got: number;
  billed: number;
  lateCount: number;
  range: Range;
}) {
  const word = RANGES.find((r) => r.key === range)?.label ?? "";
  return (
    <section className="rounded-[14px] bg-primary px-5 py-[18px] text-white">
      <b className="block text-[16px] leading-[1.35] font-bold">
        {got ? `${word}รับชำระแล้ว ${baht(got)} บาท` : `ยังไม่มีรับชำระ${word}`}
      </b>
      <p className="mt-1.5 text-[12.5px] leading-[1.55] text-white/80">
        {billed
          ? `คิดเป็น ${Math.round((got * 1000) / billed) / 10}% ของยอดที่วางบิล`
          : "ยังไม่มียอดวางบิลในช่วงนี้"}
        {lateCount ? ` · เกินกำหนด ${lateCount} ใบ` : " · ไม่มีใบเกินกำหนด"}
      </p>
    </section>
  );
}

/**
 * กราฟเส้นโค้งวางบิลเทียบรับชำระ (ต้นแบบ ceo-acc.html) — แรเงาใต้เส้น แกนตั้งปัดขึ้นทีละ 50k
 * วัดความกว้างจริงของกล่อง ตัวหนังสือในกราฟจะได้ไม่ถูกยืด
 */
function LineChart({
  buckets: bs,
}: {
  buckets: { label: string; billed: number; got: number }[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(700);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(240, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 240,
    L = 54,
    R = 16,
    T = 14,
    B = 34;
  const top =
    Math.ceil(
      Math.max(1, ...bs.map((b) => Math.max(b.billed, b.got))) / 50000,
    ) * 50000 || 50000;
  const n = bs.length;
  const step = n > 1 ? (W - L - R) / (n - 1) : 0;
  const X = (i: number) => (n > 1 ? L + i * step : (L + W - R) / 2);
  const Y = (v: number) => T + (H - T - B) * (1 - v / top);
  const series = (
    pick: (b: (typeof bs)[number]) => number,
    color: string,
    label: string,
    fill: string,
  ) => {
    const pts = bs.map(
      (b, i) => [X(i), +Y(pick(b)).toFixed(1)] as [number, number],
    );
    const line = smooth(pts, Y(0));
    const base = Y(0).toFixed(1);
    return (
      <g key={label}>
        <path
          d={`${line} L${pts[n - 1][0].toFixed(1)} ${base} L${pts[0][0].toFixed(1)} ${base} Z`}
          fill={`url(#${fill})`}
        />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {pts.map((pt, i) => (
          <circle
            key={i}
            cx={pt[0].toFixed(1)}
            cy={pt[1]}
            r="4"
            fill="#fff"
            stroke={color}
            strokeWidth="2"
          >
            <title>{`${bs[i].label} ${label} ${baht(pick(bs[i]))} บาท`}</title>
          </circle>
        ))}
      </g>
    );
  };
  return (
    <div ref={box} className="mt-2.5">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full overflow-visible"
        role="img"
        aria-label="วางบิลเทียบรับชำระรายเดือน"
      >
        <defs>
          <linearGradient id="gBill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F3B7C0" stopOpacity=".45" />
            <stop offset="100%" stopColor="#F3B7C0" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gPaid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#db0000" stopOpacity=".28" />
            <stop offset="100%" stopColor="#db0000" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((s) => {
          const y = Y((top * s) / 4);
          return (
            <g key={s}>
              <line
                x1={L}
                y1={y.toFixed(1)}
                x2={W - R}
                y2={y.toFixed(1)}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={L - 8}
                y={(y + 4).toFixed(1)}
                textAnchor="end"
                fontSize="11"
                className="fill-muted-foreground"
              >
                {short((top * s) / 4)}
              </text>
            </g>
          );
        })}
        {bs.map((b, i) => (
          <text
            key={b.label}
            x={X(i).toFixed(1)}
            y={H - 10}
            textAnchor="middle"
            fontSize="11.5"
            className="fill-muted-foreground"
          >
            {b.label}
          </text>
        ))}
        {n > 0 && series((b) => b.billed, "#F3B7C0", "วางบิล", "gBill")}
        {n > 0 && series((b) => b.got, "var(--primary)", "รับชำระ", "gPaid")}
      </svg>
    </div>
  );
}

/** เส้นโค้งผ่านทุกจุด — Catmull-Rom แปลงเป็น cubic bezier (สูตรเดียวกับต้นแบบ) */
/* floor = y ของเส้นศูนย์ — จุดควบคุมห้ามต่ำกว่านี้ ไม่งั้นเส้นโค้งจมใต้ศูนย์ระหว่างจุดที่เป็น 0 */
function smooth(pts: [number, number][], floor = Infinity) {
  if (!pts.length) return "";
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] ?? pts[i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6,
      c1y = Math.min(floor, p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6,
      c2y = Math.min(floor, p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)},${c2x.toFixed(1)} ${c2y.toFixed(1)},${p2[0]} ${p2[1]}`;
  }
  return d;
}

/*
 * สีแผ่นไอคอนของการ์ดสรุป — ชุดเดียวกับแดชบอร์ดขายและแดชบอร์ด PM
 * ทุกแดชบอร์ดหน้าตาเดียวกัน คนที่สวมหลายบทบาทไม่ต้องเรียนรู้ใหม่
 */
const KPI_TONE = {
  won: "bg-[#ecfdf5] text-[#009767]",
  info: "bg-[#eff6ff] text-[#155dfc]",
  warn: "bg-[#fffbeb] text-[#b75000]",
  late: "bg-[#fef2f2] text-[#c0121f]",
};

/* การ์ดสรุป — ชื่อกับไอคอนอยู่แถวบน ตัวเลขอยู่ใต้ลงมา (ดีไซน์ใหม่ 25 ก.ย. 2569)
   เดิมบนมือถือไอคอนอยู่บรรทัดของตัวเอง การ์ดจึงสูงเกินจำเป็น */
function Kpi({
  icon,
  title,
  value,
  meta,
  tone,
  skin = "info",
}: {
  icon?: React.ReactNode;
  title: string;
  value: string;
  meta: string;
  tone?: "bad";
  skin?: keyof typeof KPI_TONE;
}) {
  return (
    <div className="glass flex h-full flex-col rounded-[14px] px-4 py-3.5 sm:px-5 sm:py-[18px]">
      <span className="flex items-start justify-between gap-2.5">
        <b className="min-w-0 text-[12.5px] leading-snug font-semibold text-muted-foreground">
          {title}
        </b>
        {icon && (
          <i className={`grid size-[30px] flex-none place-items-center rounded-[10px] ${KPI_TONE[skin]}`}>
            {icon}
          </i>
        )}
      </span>
      <p
        className={`num mt-2 text-[20px] leading-tight font-bold sm:text-[22px] ${tone === "bad" ? "text-destructive" : ""}`}
      >
        {value}
      </p>
      <p className="mt-auto pt-1.5 line-clamp-2 text-xs text-muted-foreground">{meta}</p>
    </div>
  );
}

function Donut({
  slices,
  total,
}: {
  slices: { key: string; label: string; color: string; n: number }[];
  total: number;
}) {
  const R = 45;
  const C = 2 * Math.PI * R;
  /* คิดจุดเริ่มของแต่ละชิ้นล่วงหน้า — ห้ามสะสมค่าไประหว่างวาด JSX */
  const drawn = slices.filter((s) => s.n > 0);
  const arcs = drawn.map((s, i) => ({
    ...s,
    len: total ? (C * s.n) / total : 0,
    offset: total
      ? drawn.slice(0, i).reduce((a, x) => a + (C * x.n) / total, 0)
      : 0,
  }));
  return (
    <svg
      viewBox="0 0 120 120"
      className="size-[132px] flex-none"
      role="img"
      aria-label={`ใบแจ้งหนี้ทั้งหมด ${total} ใบ`}
    >
      <circle
        cx="60"
        cy="60"
        r={R}
        fill="none"
        stroke="var(--border)"
        strokeWidth="17"
      />
      {arcs.map((s) => (
        <circle
          key={s.key}
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={s.color}
          strokeWidth="17"
          strokeDasharray={`${s.len} ${C - s.len}`}
          strokeDashoffset={-s.offset}
          transform="rotate(-90 60 60)"
        >
          {/* ต้องเป็นข้อความก้อนเดียว — React 19 จัดการ <title> เป็นพิเศษ ถ้าแยกเป็นหลายท่อน
              HTML ฝั่งเซิร์ฟเวอร์กับฝั่งเบราว์เซอร์จะไม่ตรงกัน (hydration error) */}
          <title>{`${s.label} ${s.n} ใบ ${total ? Math.round((s.n * 1000) / total) / 10 : 0}%`}</title>
        </circle>
      ))}
      <text
        x="60"
        y="59"
        textAnchor="middle"
        className="fill-foreground text-[19px] font-bold"
      >
        {total}
      </text>
      <text
        x="60"
        y="72"
        textAnchor="middle"
        className="fill-muted-foreground text-[8.5px]"
      >
        ใบแจ้งหนี้
      </text>
    </svg>
  );
}

// ─── ช่วงเวลา ────────────────────────────────────────────────────
function startOf(range: Range, now: Date) {
  if (range === "m") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === "q")
    return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  return new Date(now.getFullYear(), 0, 1);
}

function rangeNote(range: Range, now: Date) {
  const year = now.getFullYear() + 543;
  if (range === "m") return `${TH_MONTHS_FULL[now.getMonth()]} ${year}`;
  if (range === "q") {
    const q = Math.floor(now.getMonth() / 3);
    const first = q * 3;
    return `ไตรมาส ${q + 1} ${TH_MONTHS_FULL[first]} – ${TH_MONTHS_FULL[first + 2]} ${year}`;
  }
  return `ปี ${year} ${TH_MONTHS_FULL[0]} – ${TH_MONTHS_FULL[now.getMonth()]} ${year}`;
}

/**
 * แท่งกราฟ — เดือนนี้แบ่งเป็นสัปดาห์ ช่วงยาวกว่านั้นแบ่งเป็นเดือน
 * ไม่แบ่งเป็นวันเพราะเอกสารบัญชีออกไม่กี่ใบต่อวัน กราฟจะโล่งจนอ่านไม่ได้
 */
function makeBuckets(range: Range, now: Date) {
  const out: { label: string; from: string; to: string }[] = [];
  if (range === "m") {
    for (let i = 3; i >= 0; i--) {
      const end = new Date(now);
      end.setDate(end.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      out.push({
        label: `${start.getDate()}–${end.getDate()} ${MON[end.getMonth()]}`,
        from: toIsoDate(start),
        to: toIsoDate(end),
      });
    }
    return out;
  }
  const first = startOf(range, now);
  const months =
    now.getFullYear() * 12 +
    now.getMonth() -
    (first.getFullYear() * 12 + first.getMonth()) +
    1;
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    out.push({
      label:
        MON[d.getMonth()] +
        (months > 12 ? ` ${String(d.getFullYear() + 543).slice(-2)}` : ""),
      from: toIsoDate(d),
      to: toIsoDate(last),
    });
  }
  return out;
}

/** ตัวเลขบนแท่งกราฟมีที่แคบ ย่อหลักพันเป็น k */
function short(n: number) {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n));
}
