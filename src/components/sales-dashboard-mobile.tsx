"use client";

/*
 * แดชบอร์ดฝ่ายขายบนมือถือ — ตามต้นแบบ dashboard (2).html ส่วน .mob (สไตล์ชุด sd-* ใน globals.css)
 * จอคอมยังเป็นแดชบอร์ดเดิมทุกอย่าง หน้านี้แสดงแทนเฉพาะจอแคบกว่า md (จุดตัดเดียวกับแถบล่างของ app-shell)
 * ตัวเลขมาจาก buildReport / buildAgenda ชุดเดียวกับจอคอม ไม่ได้คิดสูตรใหม่
 */

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { addDays, parseIsoDate, TH_MONTHS_FULL, thaiDate } from "@/lib/format";
import {
  AGENDA_LABEL,
  RANGE_LABEL,
  type AgendaEvent,
  type AgendaType,
  type RangeKey,
  type SalesReport,
} from "@/lib/sales-report";
import { DownloadIcon } from "./icons";

const RANGES: RangeKey[] = ["m", "q", "y"];
const RANGE_WORD: Record<RangeKey, string> = { m: "เดือนนี้", q: "ไตรมาสนี้", y: "ปีนี้" };
const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/* ลายเส้นไอคอนชุดเดียวกับต้นแบบ (G) — วาดใน viewBox 24 */
const G = {
  money: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  people: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </>
  ),
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  doc: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
  alarm: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2M5 3 2 6M19 3l3 3" />
    </>
  ),
  go: <path d="m9 18 6-6-6-6" />,
  back: <path d="M19 12H5M11 18l-6-6 6-6" />,
  next: <path d="M5 12h14M13 6l6 6-6 6" />,
};

function Ico({ g, size = 16, sw = 2.2 }: { g: ReactNode; size?: number; sw?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {g}
    </svg>
  );
}

/* สีของแต่ละประเภทนัด — ไอคอนนูนกับป้าย ใช้โทนเดียวกับจุดในปฏิทินจอคอม */
const EV: Record<AgendaType, { clay: string; chip: string; g: ReactNode }> = {
  follow: { clay: "c-rose", chip: "rose", g: G.phone },
  presale: { clay: "c-sky", chip: "sky", g: G.doc },
  quote: { clay: "c-peach", chip: "peach", g: G.alarm },
};
const RANK_CLAY = ["c-rose", "c-peach", "c-sky"];

export function SalesDashboardMobile({
  d,
  range,
  onRange,
  events,
  today,
  hello,
  dealsHref,
  onExport,
}: {
  d: SalesReport;
  range: RangeKey;
  onRange: (r: RangeKey) => void;
  events: AgendaEvent[];
  today: string;
  hello: string;
  dealsHref: string;
  onExport: () => void;
}) {
  /* แถบสัปดาห์เริ่มวันอาทิตย์ของสัปดาห์นี้ · วันที่เลือกเริ่มที่วันนี้ */
  const [wStart, setWStart] = useState(() => addDays(today, -parseIsoDate(today).getDay()));
  const [sel, setSel] = useState(today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(wStart, i));
  const mid = parseIsoDate(week[3]);
  const dayList = events.filter((e) => e.date === sel);

  const R = 46;
  const C = 2 * Math.PI * R;
  const rate = d.quotes ? Math.min(d.rate, 100) : 0;

  return (
    <section className="sd sd-mob" aria-label="แดชบอร์ดบนมือถือ">
      {/* ชื่อหน้าและกระดิ่งอยู่ที่แถบบนของระบบแล้ว (ต้นแบบ .m-head) เหลือคำทักทายบรรทัดเดียว */}
      <p className="sd-hi">{hello}</p>

      <div className="sd-hero">
        <div className="min-w-0">
          <div className="sd-chips" role="group" aria-label="ช่วงเวลา">
            {RANGES.map((r) => (
              <button key={r} type="button" className={range === r ? "on" : ""} onClick={() => onRange(r)}>
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
          <h2>มูลค่าที่ปิดได้</h2>
          <p className="v">{d.won.toLocaleString("th-TH")} ฿</p>
          <p className="d">
            <span className={d.dWon >= 0 ? "up" : "dn"}>
              {d.dWon >= 0 ? "+" : "−"}
              {Math.abs(d.dWon)}%
            </span>{" "}
            {d.wonDeals} ดีล · เทียบช่วงก่อน
          </p>
        </div>
        <div className="sd-ring">
          <svg viewBox="0 0 112 112" aria-hidden="true">
            <circle cx="56" cy="56" r={R} fill="none" stroke="#fff" strokeWidth="11" />
            <circle
              cx="56"
              cy="56"
              r={R}
              fill="none"
              stroke="#d0021b"
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={`${((C * rate) / 100).toFixed(1)} ${C.toFixed(1)}`}
            />
          </svg>
          {/* ฐานเดียวกับการ์ด "ใบเสนอราคาที่ปิดได้" บนจอคอม — ชื่อตามการ์ดนั้น ไม่ใช้ "อัตราปิดการขาย"
              เพราะผู้บริหารมีตัวชื่อนั้นที่นับคนละฐาน */}
          <span className="c">
            <b>{d.quotes ? `${d.rate}%` : "—"}</b>
            <small>
              ใบเสนอราคา
              <br />
              ที่ปิดได้
            </small>
          </span>
        </div>
      </div>

      <div className="sd-mcal">
        <div className="hd">
          <b>
            {TH_MONTHS_FULL[mid.getMonth()]} {mid.getFullYear() + 543}
          </b>
          <div>
            <button type="button" aria-label="สัปดาห์ก่อน" onClick={() => setWStart(addDays(wStart, -7))}>
              <Ico g={G.back} sw={2.4} />
            </button>
            <button type="button" aria-label="สัปดาห์ถัดไป" onClick={() => setWStart(addDays(wStart, 7))}>
              <Ico g={G.next} sw={2.4} />
            </button>
          </div>
        </div>
        <div className="sd-week">
          {week.map((iso, i) => {
            const has = events.some((e) => e.date === iso);
            const date = parseIsoDate(iso);
            return (
              <button
                key={iso}
                type="button"
                className={[iso === today ? "today" : "", iso === sel ? "sel" : "", has ? "ev" : ""]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={iso === sel}
                aria-label={`${date.getDate()} ${TH_MONTHS_FULL[date.getMonth()]}${has ? " มีนัดหมาย" : ""}`}
                onClick={() => setSel(iso)}
              >
                <small>{DOW[i]}</small>
                <b>{date.getDate()}</b>
                <i />
              </button>
            );
          })}
        </div>
      </div>

      <div className="sd-sec">
        <h3>{sel === today ? "นัดหมายวันนี้" : `นัดหมาย ${thaiDate(sel)}`}</h3>
        <Link href="/leads-quotes">ดูทั้งหมด</Link>
      </div>
      <div className="sd-mlist">
        {dayList.length === 0 ? (
          <p className="sd-mempty">ไม่มีนัดหมายในวันนี้</p>
        ) : (
          dayList.map((e) => (
            /* กดแล้วไปหน้าที่เรื่องนั้นอยู่จริง (ผู้สนใจ / คำขอ / ใบเสนอราคา) ตาม buildAgenda */
            <Link key={e.id} href={e.href} className="sd-item">
              <span className="min-w-0">
                <b>{e.title}</b>
                <span className={`meta sd-chip ${EV[e.type].chip}`}>
                  <Ico g={EV[e.type].g} size={13} />
                  {AGENDA_LABEL[e.type]}
                </span>
              </span>
              <span className="end">
                <span className={`clay ${EV[e.type].clay}`}>
                  <Ico g={G.people} />
                </span>
                <span className="sd-go">
                  <Ico g={G.go} />
                </span>
              </span>
            </Link>
          ))
        )}
      </div>

      <div className="sd-sec">
        <h3>ลูกค้าที่ปิดได้สูงสุด</h3>
        <Link href={dealsHref}>ดูดีล</Link>
      </div>
      <div className="sd-mlist">
        {d.rank.length === 0 ? (
          <p className="sd-mempty">ยังไม่มีดีลที่ปิดได้ในช่วงนี้</p>
        ) : (
          d.rank.slice(0, 3).map((r, i) => (
            <Link key={r.code} href={`/leads/${r.code}`} className="sd-item">
              <span className="min-w-0">
                <b>{r.name}</b>
                <span className="meta sd-chip rose">
                  <Ico g={G.money} size={13} />
                  {r.value.toLocaleString("th-TH")} ฿
                </span>
              </span>
              <span className="end">
                <span className={`clay ${RANK_CLAY[i]}`}>{i + 1}</span>
                <span className="sd-go">
                  <Ico g={G.go} />
                </span>
              </span>
            </Link>
          ))
        )}
      </div>

      {/* ต้นแบบมือถือไม่มีปุ่มนี้ แต่แดชบอร์ดเดิมบนมือถือมีให้ส่งออกรายงาน — เก็บไว้ท้ายหน้า ไม่ให้ฟีเจอร์หาย */}
      <button type="button" className="btn glass-thin w-full justify-center" data-ceo-hide onClick={onExport}>
        <DownloadIcon className="size-3.5" strokeWidth={2} />
        ส่งออก Excel ({RANGE_WORD[range]})
      </button>
    </section>
  );
}
