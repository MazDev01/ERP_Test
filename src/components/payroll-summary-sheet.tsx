"use client";

/*
 * ตารางสรุปเงินเดือน — A4 แนวนอน พิมพ์/บันทึก PDF ได้ (ผู้ใช้สั่ง 16 ต.ค. 2569)
 * เปิดจากหน้าคำนวณเงินเดือน (กลุ่มรายเดือน) และหน้ายอดเงินเดือนของ CEO — CEO ใช้ตารางนี้โอนเงินเดือน
 *
 * ตัวเลขมาจาก payLines ตัวเดียวกับหน้าคำนวณเงินเดือน — รอบที่ปิดแล้วอ่านยอดที่บันทึกไว้ ไม่คิดใหม่ (HR-BR-03)
 * เฉพาะพนักงานรายเดือนของรอบนี้ (ทดลองงานจ่ายตามรอบรายวัน แยกโอนต่างหาก)
 * จัดกลุ่มตามแผนก แถวรวมย่อยสีตามแบบ แล้วรวมยอดภายใน/รวม — รวมเฉพาะช่องเงิน ไม่รวมชื่อ/เลขบัญชี
 *
 * คอลัมน์:
 *   อัตราเงินเดือน = เงินเดือนที่จ่ายรอบนี้ (หลังเฉลี่ยตามวันที่อยู่ในรอบ) · ค่า OT แยก ×1.5 / ×2 (โอที 3 เท่าวันแรงงานรวมใน ×2)
 *   เงินประกันผลงาน = "หัก ประกันผลงาน" ของเดือนนี้ · สรุปเงินประกัน = ยอดสะสมถึงเดือนนี้ นับต่อเนื่องข้ามปี
 *   หักอื่นๆ = รายการหักที่กรอกเองทุกช่อง ยกเว้นประกันผลงานและ กยศ. · คงเหลือ = ยอดสุทธิ
 *   รายได้ที่ไม่มีคอลัมน์ (ค่าคอม Incentive ค่าครองชีพ ฯลฯ ค่าใช้จ่ายคืน) บอกในหมายเหตุ ยอดคงเหลือจะได้ตรวจย้อนได้
 */

import { useLayoutEffect, useRef, useState } from "react";
import { baht, thaiMonth, todayIso } from "@/lib/format";
import { issuerOf } from "@/lib/crm-data";
import {
  bankText,
  BUILTIN_HR_DEPT,
  guaranteeHeld,
  hrCycle,
  hrDept,
  hrDepts,
  hrPos,
  linesOfGroup,
  payLines,
  PAY_INCOME_ITEMS,
  type Employee,
  type PayItemKey,
  type PaySlipCalc,
} from "@/lib/hr-data";
import { useHr } from "@/lib/hr-store";
import { useComSource, useHrTime } from "@/lib/hr-link";
import { Sheet } from "./lead-dialogs";
import { otSplit } from "./payslip-paper";
import { DownloadIcon, PrintIcon } from "./icons";

/* รายการหักที่กรอกเองที่รวมเป็น "หักอื่นๆ" */
const OTHER_CUTS: PayItemKey[] = ["absent", "sick", "personal", "otherCut", "welfare", "advance", "otherPay"];
/* รายได้ที่ไม่มีคอลัมน์ของตัวเอง — ขึ้นในหมายเหตุ */
const NOTE_INCOME = PAY_INCOME_ITEMS.filter(({ k }) => k !== "position" && k !== "fuel" && k !== "commission");

/* สีแถวรวมย่อยตามแบบ — แผนกที่ผู้ดูแลระบบเพิ่มเองใช้สีเขียวอ่อน */
const DEPT_STYLE: Record<string, { label: string; bg: string }> = {
  backoffice: { label: "รวมยอด Back office", bg: "#ffe699" },
  marketing: { label: "รวมยอดทีม MARKETING", bg: "#e8c3dc" },
  bd: { label: "รวมยอดทีม BD", bg: "#f4b183" },
  website: { label: "รวมยอดทีม WEBSITE", bg: "#bdd7ee" },
  developer: { label: "รวมยอดทีม DEV", bg: "#d9d9d9" },
};

type Money = {
  rate: number;
  pos: number;
  fuel: number;
  ot15: number;
  ot2: number;
  ss: number;
  guar: number;
  other: number;
  loan: number;
  late: number;
  net: number;
  guarYtd: number;
};
const MONEY_KEYS: (keyof Money)[] = ["rate", "pos", "fuel", "ot15", "ot2", "ss", "guar", "other", "loan", "late", "net", "guarYtd"];

type SumRow = { e: Employee; m: Money; note: string };

function r2(v: number) {
  return Math.round(v * 100) / 100;
}

function zero(): Money {
  return Object.fromEntries(MONEY_KEYS.map((k) => [k, 0])) as Money;
}

function addTo(a: Money, b: Money) {
  for (const k of MONEY_KEYS) a[k] = r2(a[k] + b[k]);
}

/** พิมพ์เฉพาะกระดาษตารางสรุป แนวนอน (ดู .print-sum ใน globals.css)
    คัดลอกกระดาษไปไว้ใต้ body ตรงๆ ก่อนพิมพ์ — กระดาษอยู่ในการ์ดของหน้า (ย่อด้วย transform) ได้ด้วย
    พิมพ์ออกมาเต็ม A4 แนวนอนเสมอ ไม่ติดขนาดที่ย่อบนจอ (ผู้ใช้สั่ง 19 ต.ค. 2569) */
export function printSummary() {
  const paper = document.querySelector(".pr-sum");
  if (!paper) return;
  const host = document.createElement("div");
  host.className = "pr-sum-host";
  host.appendChild(paper.cloneNode(true));
  document.body.appendChild(host);
  const st = document.createElement("style");
  st.textContent = "@page { size: A4 landscape; margin: 8mm; }";
  document.head.appendChild(st);
  document.body.classList.add("print-sum");
  window.print();
  window.setTimeout(() => {
    document.body.classList.remove("print-sum");
    st.remove();
    host.remove();
  }, 400);
}

/* ความกว้างตามแบบ A4 แนวนอน — บนจอย่อทั้งแผ่นให้พอดีกล่อง ไม่ตัดขอบขวา (ผู้ใช้สั่ง 19 ต.ค. 2569) */
const PAPER_W = 1100;

/** ย่อกระดาษกว้าง PAPER_W ให้พอดีความกว้างที่มี (ไม่ขยายเกิน 100%) แล้วตั้งความสูงตามที่ย่อ
    ResizeObserver วัดใหม่เมื่อกล่องหรือกระดาษเปลี่ยนขนาด · ตอนพิมพ์ใช้สำเนาใต้ body จึงไม่โดนย่อ (ผู้ใช้สั่ง 19 ต.ค. 2569) */
function FitWidth({ children }: { children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ s: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const w = Math.max(i.scrollWidth, PAPER_W);
      const s = Math.min(1, o.clientWidth / w);
      const h = Math.ceil(i.offsetHeight * s);
      setFit((p) => (p && p.s === s && p.h === h ? p : { s, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, []);
  const s = fit?.s ?? 1;
  return (
    <div ref={outer} className="pr-sum-fit w-full overflow-hidden" style={fit ? { height: fit.h } : undefined}>
      <div
        ref={inner}
        className={`w-max ${s >= 1 ? "mx-auto" : ""}`}
        style={{ transform: s < 1 ? `scale(${s})` : undefined, transformOrigin: "top left" }}
      >
        {children}
      </div>
    </div>
  );
}

type SummaryData = ReturnType<typeof useSummaryData>;

/** ตัวเลขของตารางสรุป — ใช้ร่วมกันทั้งกล่อง (หน้าคำนวณเงินเดือน) และการ์ดในหน้า CEO */
function useSummaryData(month: string) {
  const hr = useHr();
  const time = useHrTime();
  const src = useComSource();
  const today = todayIso();
  const range = hrCycle(month);

  const linesOf = (m: string) => {
    const c = hrCycle(m);
    const run = hr.payruns.find((p) => p.month === m);
    return linesOfGroup(payLines(hr.emp, c, time, hr.extras, today, src, run, m), "month", c);
  };

  const rowOf = (e: Employee, c: PaySlipCalc): SumRow => {
    const it = c.items;
    const ot = otSplit(e, range, time, c.ot);
    const notes: string[] = [];
    const com = r2(c.com + (it.commission ?? 0));
    if (com) notes.push(`ค่าคอม ${baht(com)}`);
    for (const { k, label } of NOTE_INCOME) if (it[k]) notes.push(`${label.replace(/^ค่า /, "")} ${baht(it[k] ?? 0)}`);
    if (c.reimb) notes.push(`ค่าใช้จ่ายคืน ${baht(c.reimb)}`);
    if (c.wht) notes.push(`ภาษีหัก ณ ที่จ่าย ${baht(c.wht)}`);
    if (!ot.split && c.ot) notes.push("โอทีแยกอัตราไม่ได้ ลงช่อง ×1.5");
    else if (ot.ot3) notes.push(`รวมโอที 3 เท่า ${baht(ot.ot3)}`);
    return {
      e,
      note: notes.join(" · "),
      m: {
        rate: c.base,
        pos: it.position ?? 0,
        fuel: it.fuel ?? 0,
        ot15: ot.split ? ot.ot15 : c.ot,
        ot2: ot.split ? r2(ot.ot2 + ot.ot3) : 0,
        ss: c.ss,
        guar: it.guarantee ?? 0,
        other: r2(OTHER_CUTS.reduce((a, k) => a + (it[k] ?? 0), 0)),
        loan: it.studentLoan ?? 0,
        late: c.late,
        net: c.net,
        guarYtd: guaranteeHeld(e, month, hr.extras),
      },
    };
  };

  const rows = linesOf(month).map(({ e, c }) => rowOf(e, c));

  /* แผนกตามลำดับในแบบ แล้วตามด้วยแผนกที่เพิ่มเอง · แผนกที่ไม่มีคนไม่ต้องมีแถว */
  const order = [...BUILTIN_HR_DEPT.map((d) => d.v), ...hrDepts().map((d) => d.v)].filter((v, i, a) => a.indexOf(v) === i);
  const deptOf = (e: Employee) => hrPos(e.pos).dept;
  const known = new Set(order);
  const groups = [
    ...order,
    ...rows.map((r) => deptOf(r.e)).filter((d, i, a) => !known.has(d) && a.indexOf(d) === i),
  ]
    .map((d) => ({ d, rows: rows.filter((r) => deptOf(r.e) === d) }))
    .filter((g) => g.rows.length);
  const grand = zero();
  for (const r of rows) addTo(grand, r.m);
  /* ลำดับเรียงต่อกันทุกแผนก */
  const ordered = groups.flatMap((g) => g.rows);
  return { rows, groups, grand, ordered };
}

/** กล่องตารางสรุป — หน้าคำนวณเงินเดือน (HR) เปิดจากปุ่ม */
export function PayrollSummarySheet({ month, onClose }: { month: string; onClose: () => void }) {
  const data = useSummaryData(month);
  return (
    <Sheet
      title={`ตารางสรุปเงินเดือน · ${thaiMonth(month)}`}
      wide
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-[12.5px] text-muted-foreground">
            พนักงานรายเดือน {data.rows.length} คน · คงเหลือรวม {baht(data.grand.net)} บาท
          </span>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ปิด
          </button>
          <button type="button" className="btn glass-thin max-md:hidden" onClick={printSummary}>
            <PrintIcon className="size-[15px]" strokeWidth={1.9} />
            พิมพ์
          </button>
          <button type="button" className="btn solid btn-solid" onClick={printSummary}>
            <DownloadIcon className="size-3.5" strokeWidth={2} />
            ดาวน์โหลด PDF
          </button>
        </>
      }
    >
      <SummaryPaper month={month} data={data} />
    </Sheet>
  );
}

/** ตารางสรุปในการ์ดรอบเดือนของหน้า CEO — แสดงในหน้าเลย ไม่ใช้ปุ่ม+กล่อง (ผู้ใช้สั่ง 19 ต.ค. 2569) */
export function PayrollSummaryInline({ month }: { month: string }) {
  const data = useSummaryData(month);
  return (
    <div className="border-t border-border px-5 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <b className="text-[13.5px] font-semibold">ตารางสรุปเงินเดือน</b>
        <span className="text-[12.5px] text-muted-foreground">
          {data.rows.length} คน · คงเหลือรวม {baht(data.grand.net)} บาท
        </span>
        <span className="ml-auto flex gap-2">
          <button type="button" className="btn glass-thin max-md:hidden" style={{ height: 32 }} onClick={printSummary}>
            <PrintIcon className="size-[14px]" strokeWidth={1.9} />
            พิมพ์
          </button>
          <button type="button" className="btn glass-thin" style={{ height: 32 }} onClick={printSummary}>
            <DownloadIcon className="size-3.5" strokeWidth={2} />
            ดาวน์โหลด PDF
          </button>
        </span>
      </div>
      <SummaryPaper month={month} data={data} />
    </div>
  );
}

function SummaryPaper({ month, data }: { month: string; data: SummaryData }) {
  const { rows, groups, grand, ordered } = data;

  /* หัวกระดาษจากผู้ออกเอกสารตั้งต้น MAZ (/admin/company) แบบเดียวกับสลิป */
  const co = issuerOf("MAZ");
  const maz = co.code === "MAZ";
  const address = co.address.split("\n").filter(Boolean);

  const BD = "border border-[#3a4048]";
  const cell = `${BD} px-1 py-[2px]`;
  const money = (v: number) => (v ? baht(v) : "");
  const moneyCells = (m: Money, bold = false) =>
    (["rate", "pos", "fuel", "ot15", "ot2", "ss", "guar", "other", "loan", "late", "net"] as (keyof Money)[]).map((k) => (
      <td key={k} className={`num ${cell} text-right ${bold || k === "net" ? "font-bold" : ""}`}>
        {money(m[k])}
      </td>
    ));
  const totalRow = (label: string, m: Money, bg: string, key: string) => (
    <tr key={key} style={{ background: bg }} className="font-bold">
      <td className={`${cell} text-center`} colSpan={3}>
        {label}
      </td>
      {moneyCells(m, true)}
      <td className={cell} />
      <td className={`num ${cell} text-right`}>{money(m.guarYtd)}</td>
      <td className={cell} />
    </tr>
  );

  return (
    <FitWidth>
        <article
          className="pr-sum w-[1100px] max-w-none bg-white px-[24px] py-[22px] text-[10.5px] leading-[1.45] text-[#1f2328] shadow-sm"
          style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
        >
          <header className="flex items-start justify-between gap-6">
            <div className="flex-none pt-1">
              {maz ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src="/maz-logo.png" alt={co.name} className="h-[40px] w-auto" />
              ) : (
                <p className="text-[18px] leading-tight font-extrabold">{co.name}</p>
              )}
            </div>
            {/* หัวบริษัทด้านขวาตัดบรรทัดได้ ไม่ตัดท้ายข้อความ (ผู้ใช้สั่ง 19 ต.ค. 2569) */}
            <div className="max-w-[60%] min-w-0 text-right text-[11px] font-semibold break-words whitespace-normal">
              <p className="text-[12.5px] font-bold">{co.name}</p>
              {address.map((a) => (
                <p key={a}>{a}</p>
              ))}
              <p className="num">เลขผู้เสียภาษี : {co.taxId || "—"}</p>
            </div>
          </header>

          <h2 className="mt-2 text-center text-[15px] font-bold underline underline-offset-4">ตารางสรุปเงินเดือน</h2>

          <table className={`mt-2 w-full border-collapse ${BD}`}>
            <thead>
              <tr>
                <th className={`${cell} py-1 text-[11.5px]`} colSpan={18}>
                  รายงานสรุปเงินประจำเดือน {thaiMonth(month)}
                </th>
              </tr>
              <tr>
                <th className={`${cell} py-1 text-[11.5px]`} colSpan={18}>
                  {co.name}
                </th>
              </tr>
              <tr className="bg-[#a9c4f5]">
                {["ลำดับ", "ชื่อ-นามสกุล", "ชื่อเล่น", "อัตราเงินเดือน", "ค่าตำแหน่ง", "ค่าน้ำมันรถ"].map((h) => (
                  <th key={h} rowSpan={2} className={`${cell} text-center font-bold`}>
                    {h}
                  </th>
                ))}
                <th colSpan={2} className={`${cell} text-center font-bold`}>
                  ค่า OT
                </th>
                {[
                  "ประกันสังคม",
                  "เงินประกันผลงาน",
                  "หักอื่นๆ",
                  "หัก กยศ.",
                  "หักค่าจ้าง (มาสาย)",
                  "คงเหลือ",
                  "เลขบัญชีโอนเงิน",
                  "สรุปเงินประกัน",
                  "หมายเหตุ",
                ].map((h) => (
                  <th key={h} rowSpan={2} className={`${cell} text-center font-bold`}>
                    {h}
                  </th>
                ))}
              </tr>
              <tr className="bg-[#a9c4f5]">
                <th className={`${cell} text-center font-bold`}>x1.5</th>
                <th className={`${cell} text-center font-bold`}>x2</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={18} className={`${cell} py-6 text-center`}>
                    ไม่มีพนักงานรายเดือนในรอบนี้
                  </td>
                </tr>
              ) : (
                groups.flatMap(({ d, rows: list }) => {
                  const sub = zero();
                  for (const r of list) addTo(sub, r.m);
                  const style = DEPT_STYLE[d] ?? { label: `รวมยอดทีม ${hrDept(d).label.toUpperCase()}`, bg: "#e2efda" };
                  return [
                    ...list.map((r) => {
                      return (
                        <tr key={r.e.id}>
                          <td className={`num ${cell} text-center`}>{ordered.indexOf(r) + 1}</td>
                          <td className={`${cell} whitespace-nowrap`}>{r.e.name}</td>
                          <td className={cell}>{r.e.nick}</td>
                          {moneyCells(r.m)}
                          <td className={`num ${cell} whitespace-nowrap`}>{bankText(r.e)}</td>
                          <td className={`num ${cell} text-right`}>{money(r.m.guarYtd)}</td>
                          <td className={`${cell} text-[9.5px]`}>{r.note}</td>
                        </tr>
                      );
                    }),
                    totalRow(style.label, sub, style.bg, `sum-${d}`),
                  ];
                })
              )}
              {rows.length > 0 && totalRow("รวมยอดภายใน", grand, "#c6e0b4", "inner")}
              {rows.length > 0 && totalRow("รวม", grand, "#f8cbad", "all")}
            </tbody>
          </table>
        </article>
    </FitWidth>
  );
}
