"use client";

/*
 * สลิปเงินเดือนของฉัน (ตามต้นแบบ dose-erp-maz/my-payslip.html) — ปลายทางของสายงานฝ่ายบุคคล
 *
 *   ปิดรอบเวลาทำงาน → คำนวณเงินเดือน → สร้างสลิป → HR กดเผยแพร่ → หน้านี้
 *
 * หน้าเป็นรายการรอบที่เผยแพร่แล้ว กดที่แถวเพื่อเปิดสลิปของรอบนั้น
 *
 * กติกาที่ห้ามพลาด — เห็นได้เฉพาะรอบที่ "เผยแพร่แล้ว" ของกลุ่มตัวเอง และเฉพาะบรรทัดของตัวเอง
 * ตัวเลขอ่านจากยอดที่บันทึกไว้ตอนปิดรอบก่อนเสมอ (CycleSum.lines)
 * เพราะนั่นคือตัวเลขที่จ่ายจริง ถ้าคำนวณใหม่ทุกครั้ง เงินเดือนที่ปรับภายหลังจะทำให้สลิปเก่าเปลี่ยนตาม
 * รอบที่ปิดไว้ก่อนระบบจะเก็บยอด (ไม่มี snapshot) จึงค่อยคิดด้วย payOf ตัวเดียวกับที่ฝ่ายบุคคลใช้
 */

import { useState } from "react";
import { baht, thaiDate, thaiMonth } from "@/lib/format";
import {
  cutOf,
  dailyRateIn,
  extraOf,
  hrCycle,
  hrPos,
  inPeriod,
  isDaily,
  payOf,
  workedDaysIn,
  type ComSource,
  type CycleLine,
  type Employee,
} from "@/lib/hr-data";
import { countDownload, countView, useHr } from "@/lib/hr-store";
import { ROLE_EMPLOYEE, useComSource, useHrTime } from "@/lib/hr-link";
import { downloadCsv, toCsv } from "@/lib/report-export";
import { useRole } from "@/lib/role";
import { Sheet } from "./lead-dialogs";
import { DownloadIcon, EyeIcon } from "./icons";
import { DateField } from "./thai-date-picker";
import "@/styles/mobile/payslip.css";

/** หนึ่งแถวในรายการ = รอบที่เผยแพร่แล้วหนึ่งรอบ พร้อมบรรทัดของเราในรอบนั้น */
type Row = { month: string; line: CycleLine; day: boolean; at: string };

export function MyPayslipPage() {
  const hr = useHr();
  const time = useHrTime();
  const src = useComSource();
  const role = useRole();
  const [open, setOpen] = useState<string | null>(null);
  /* ตัวกรองช่วงวันที่ของมือถือ (ต้นแบบ myslip-filter) — ว่าง = ไม่กรอง */
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  /* บทบาทที่ยังไม่ได้ผูกกับทะเบียนพนักงานจะไม่มีสลิป (ดู ROLE_EMPLOYEE) */
  const myId = ROLE_EMPLOYEE[role];
  const me = myId ? hr.emp.find((e) => e.id === myId) : undefined;

  const rows: Row[] = [];
  if (me && me.type !== "intern") {
    const day = isDaily(me);
    for (const sp of hr.slips) {
      const published = day ? sp.dayPublished : sp.published;
      if (!published || !inPeriod(me, sp.month)) continue;
      const line = lineOf(hr, me, sp.month, day, time, src);
      if (!line) continue;
      rows.push({
        month: sp.month,
        line,
        day,
        at: day ? sp.dayPublishedAt : sp.publishedAt,
      });
    }
    rows.sort((a, b) => b.month.localeCompare(a.month));
  }

  const picked = rows.find((r) => r.month === open);

  /* ฝึกงานไม่ได้รับค่าจ้าง จึงไม่มีสลิป — บอกเหตุผลตรง ๆ ดีกว่าโชว์ตารางว่าง */
  const why = !me
    ? "บัญชีนี้ยังไม่ได้ผูกกับทะเบียนพนักงาน จึงยังไม่มีสลิปเงินเดือน"
    : me.type === "intern"
      ? "ตำแหน่งฝึกงานไม่มีค่าจ้าง จึงไม่มีสลิปเงินเดือน"
      : "";

  /* รอบที่ทับช่วงวันที่ที่เลือก (รอบ = hrCycle วันตัดรอบเดือนก่อน → วันตัดรอบเดือนนี้) */
  const mobileRows = rows.filter((r) => {
    const c = hrCycle(r.month);
    return (!fFrom || c.to >= fFrom) && (!fTo || c.from <= fTo);
  });

  return (
    <div className="space-y-4">
      <div className="max-md:hidden">
      <div className="bar">
        <div>
          <h1>สลิปเงินเดือนของฉัน</h1>
        </div>
      </div>
      </div>

      {/* ── มือถือ (ต้นแบบ my-payslip.html myslip-*) — หน้าตาอยู่ใน styles/mobile/payslip.css ── */}
      <div className="m-ps md:hidden">
        {why || rows.length === 0 ? (
          <p className="m-ps-none">
            {why || "ยังไม่มีสลิปที่เผยแพร่ · ฝ่ายบุคคลจะแจ้งเมื่อรอบเงินเดือนพร้อมให้ดู"}
          </p>
        ) : (
          <>
            <div className="m-ps-filter">
              <label>
                ตั้งแต่วันที่
                <DateField value={fFrom} onChange={setFFrom} label="ตั้งแต่วันที่" max={fTo || undefined} placeholder="เลือกวันที่" />
              </label>
              <label>
                ถึงวันที่
                <DateField value={fTo} onChange={setFTo} label="ถึงวันที่" min={fFrom || undefined} placeholder="เลือกวันที่" />
              </label>
              {(fFrom || fTo) && (
                <button
                  type="button"
                  className="clr"
                  onClick={() => {
                    setFFrom("");
                    setFTo("");
                  }}
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>

            {mobileRows.length === 0 ? (
              <p className="m-ps-none">ไม่มีสลิปในช่วงวันที่ที่เลือก</p>
            ) : (
              <div className="m-ps-list">
                {mobileRows.map((r) => {
                  const c = hrCycle(r.month);
                  const mon = thaiMonth(r.month);
                  return (
                    /* แตะตัวการ์ดไม่เปิดอะไร — ใช้ไอคอนดู/ดาวน์โหลดมุมขวาล่าง (ต้นแบบ myslip-icons) */
                    <article key={r.month} className="m-ps-card">
                      <b className="mon">{mon}</b>
                      <dl>
                        <div>
                          <dt>ช่วงวันที่</dt>
                          <dd className="num">
                            {thaiDate(c.from)} – {thaiDate(c.to)}
                          </dd>
                        </div>
                        {/* รายการหักสามช่องยังแสดงบนการ์ด — ผู้ใช้กำหนดให้เห็นตั้งแต่หน้ารายการ (24 ก.ย. 2569) */}
                        <CutRow label="ประกันสังคม" v={r.line.ss} />
                        <CutRow label="หักมาสาย" v={r.line.late} />
                        <CutRow label="ปรับปรุงอื่น" v={-r.line.adj} />
                        <div className="net">
                          <dt>ยอดสุทธิ</dt>
                          <dd className="num">{baht(r.line.net)}</dd>
                        </div>
                        <div>
                          <dt>เผยแพร่เมื่อ</dt>
                          <dd className="num">{thaiDate(r.at)}</dd>
                        </div>
                      </dl>
                      <div className="acts">
                        <button
                          type="button"
                          aria-label={`ดูรายละเอียดสลิป ${mon}`}
                          title="ดูรายละเอียด"
                          onClick={() => openSlip(r.month)}
                        >
                          <EyeIcon strokeWidth={2.1} />
                        </button>
                        <button
                          type="button"
                          aria-label={`ดาวน์โหลดสลิป ${mon}`}
                          title="ดาวน์โหลด"
                          onClick={() => me && downloadSlip(me, r)}
                        >
                          <DownloadIcon strokeWidth={2.1} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <div className="max-md:hidden">
      <section className="panel glass flex flex-col">
        <div className="scroll-stable min-h-0 flex-1 overflow-auto">
          <table className="data-table cards-sm min-w-[940px]">
            <thead>
              <tr>
                <th style={{ width: 130 }}>รอบ</th>
                <th style={{ width: 190 }}>ช่วงวันที่</th>
                {/* รายการหักแยกสามช่องตั้งแต่หน้ารายการ ไม่ต้องเปิดสลิปก่อนถึงจะรู้ว่าถูกหักอะไร
                    (ผู้ใช้กำหนด 24 ก.ย. 2569) บนมือถือตารางคลี่เป็นการ์ด ทุกช่องจึงได้บรรทัดของตัวเอง */}
                <th className="r" style={{ width: 120 }}>
                  ประกันสังคม
                  <span className="u"> (บาท)</span>
                </th>
                <th className="r" style={{ width: 110 }}>
                  หักมาสาย
                  <span className="u"> (บาท)</span>
                </th>
                <th className="r" style={{ width: 120 }}>
                  ปรับปรุงอื่น
                  <span className="u"> (บาท)</span>
                </th>
                <th className="r" style={{ width: 130 }}>
                  ยอดสุทธิ
                  <span className="u"> (บาท)</span>
                </th>
                <th style={{ width: 140 }}>เผยแพร่เมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {why || rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    {why || "ยังไม่มีสลิปที่เผยแพร่ · ฝ่ายบุคคลจะแจ้งเมื่อรอบเงินเดือนพร้อมให้ดู"}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const c = hrCycle(r.month);
                  return (
                    <tr
                      key={r.month}
                      tabIndex={0}
                      style={{ cursor: "pointer" }}
                      onClick={() => openSlip(r.month)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openSlip(r.month);
                        }
                      }}
                    >
                      <td data-label="รอบ">
                        <b className="text-[13.5px] font-bold">{thaiMonth(r.month)}</b>
                      </td>
                      <td data-label="ช่วงวันที่" className="num">
                        {thaiDate(c.from)} – {thaiDate(c.to)}
                      </td>
                      <Cut label="ประกันสังคม (บาท)" v={r.line.ss} />
                      <Cut label="หักมาสาย (บาท)" v={r.line.late} />
                      {/* ปรับปรุงติดลบคือหักเพิ่ม บวกคือคืนกลับ — ส่งยอดที่ถูกหักไปเข้าช่อง */}
                      <Cut label="ปรับปรุงอื่น (บาท)" v={-r.line.adj} />
                      <td data-label="ยอดสุทธิ (บาท)" className="r num font-semibold">
                        {baht(r.line.net)}
                      </td>
                      <td data-label="เผยแพร่เมื่อ" className="num muted">
                        {thaiDate(r.at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
      </div>

      {me && picked && (
        <SlipDialog emp={me} row={picked} onClose={() => setOpen(null)} />
      )}
    </div>
  );

  function openSlip(month: string) {
    setOpen(month);
    /* เปิดดูรอบไหนก็นับครั้งของรอบนั้น — ฝ่ายบุคคลใช้ยืนยันว่าพนักงานได้รับสลิปแล้ว (BR-05) */
    if (myId) countView(month, myId);
  }
}

/**
 * ช่องรายการหักหนึ่งช่อง — ส่งยอดที่ "ถูกหักไป" เข้ามา (ปรับปรุงจึงเป็น -adj)
 * ติดลบคือคืนกลับเข้ายอด ขึ้นเครื่องหมายบวกแทน ไม่ใช่สีแดง
 */
function Cut({ label, v }: { label: string; v: number }) {
  return (
    <td
      data-label={label}
      className={`r ${v ? `num ${v > 0 ? "text-destructive" : ""}` : "text-muted-foreground"}`}
    >
      {v ? (v > 0 ? `-${baht(v)}` : `+${baht(-v)}`) : "—"}
    </td>
  );
}

/** แถวรายการหักบนการ์ดมือถือ — กติกาเครื่องหมายเดียวกับ Cut ของตาราง */
function CutRow({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={v ? `num ${v > 0 ? "text-destructive" : ""}` : "text-muted-foreground"}>
        {v ? (v > 0 ? `-${baht(v)}` : `+${baht(-v)}`) : "—"}
      </dd>
    </div>
  );
}

/**
 * บรรทัดของเราในรอบหนึ่ง — ใช้ยอดที่บันทึกไว้ตอนปิดรอบก่อน
 * ไม่มี snapshot (รอบที่ปิดไว้ก่อนระบบเก็บยอด) จึงคิดสดด้วยสูตรเดียวกับฝ่ายบุคคล
 */
function lineOf(
  hr: ReturnType<typeof useHr>,
  me: Employee,
  month: string,
  day: boolean,
  time: ReturnType<typeof useHrTime>,
  src: ComSource,
): CycleLine | null {
  const run = hr.payruns.find((p) => p.month === month);
  const sum = day ? run?.daySum : run?.sum;
  const saved = sum?.lines.find((x) => x.id === me.id);
  /* snapshot รุ่นเก่าไม่ได้เก็บค่าคอม/ค่าตอบแทนพิเศษ/เบี้ยเลี้ยง ทำให้รวมรายได้ไม่ครบแต่ยอดสุทธิรวมไว้แล้ว
     เติมเฉพาะช่องที่ขาดจากสูตรเดียวกับฝ่ายบุคคล ตัวเลขที่บันทึกไว้แล้วไม่แตะ */
  if (saved && saved.gross !== undefined) return saved;
  if (saved) {
    const c = payOf(me, month, time, hr.extras, src);
    return {
      ...saved,
      com: saved.com ?? c.com,
      inc: saved.inc ?? c.inc,
      allow: saved.allow ?? c.allow,
      adjust: saved.adjust ?? extraOf(hr.extras, me.id, month).adjust,
    };
  }

  if (!run || !(day ? run.dayClosed : run.closed)) return null;
  const c = payOf(me, month, time, hr.extras, src);
  return {
    id: me.id,
    name: me.name,
    pos: me.pos,
    base: c.base,
    ot: c.ot,
    com: c.com,
    inc: c.inc,
    allow: c.allow,
    gross: c.gross,
    adjust: extraOf(hr.extras, me.id, month).adjust,
    adj: c.adj,
    ss: c.ss,
    late: c.late,
    reimb: c.reimb,
    net: c.net,
    /* จ่ายรายวันต้องมีวันและอัตรา สลิปจึงขึ้น "ค่าจ้าง N วัน (อัตรา บาทต่อวัน)" ได้ (ต้นแบบ hr-payslip) */
    days: day ? workedDaysIn(me, hrCycle(month), time) : 0,
    rate: day ? dailyRateIn(me, hrCycle(month)) : 0,
  };
}

/**
 * ตัวเลขบนสลิปหนึ่งรอบ — ใช้ร่วมกันระหว่างกล่องสลิปกับปุ่มดาวน์โหลดบนการ์ดมือถือ
 * จะได้ไม่มีสองที่คิดรายได้/รายการหักคนละแบบ
 */
function slipParts(row: Row) {
  const c = hrCycle(row.month);
  const x = row.line;
  const earn: [string, number][] = [
    [
      row.day && x.days
        ? `ค่าจ้าง ${x.days} วัน (${baht(x.rate)} บาทต่อวัน)`
        : "เงินเดือน",
      x.base,
    ],
    ["ค่าล่วงเวลา", x.ot],
    /* ชื่อบรรทัดเดียวกับสลิปฝั่งฝ่ายบุคคล (hr-payslip) */
    ["ค่าคอมมิชชั่น", x.com ?? 0],
    ["Incentive", x.inc ?? 0],
    ["ค่าตำแหน่ง", x.allow ?? 0],
  ];
  /* รวมรายได้ = ผลรวมของบรรทัดที่แสดงจริง ตัวเลขบนสลิปจะบวกกันได้เสมอ
     รายการปรับปรุงไม่อยู่ในนี้แล้ว ย้ายไปอยู่รายการหักเหมือนสลิปฝั่งฝ่ายบุคคล */
  const gross = earn.reduce((a, [, v]) => a + v, 0);
  /*
   * รายการหักสามกลุ่ม ขึ้นครบทุกบรรทัดแม้เป็นศูนย์ (ผู้ใช้กำหนด 24 ก.ย. 2569)
   * สลิปคือเอกสารที่พนักงานใช้ตรวจว่าถูกหักอะไรไปบ้าง ยอดรวมช่องเดียวต้องไปถามฝ่ายบุคคลทุกครั้ง
   * รายการปรับปรุงลงเป็นยอดที่ถูกหักไป (-amt) ติดลบคือรายการที่คืนกลับเข้ายอด
   */
  const cuts: [string, number][] = [
    ["ประกันสังคม", x.ss],
    ["หักมาสาย", x.late],
    ...(x.adjust && x.adjust.length
      ? x.adjust.map((a): [string, number] => [`รายการปรับปรุงอื่น · ${a.why}`, -a.amt || 0])
      /* -0 ไม่ใช่ตัวเลขที่คนอ่านออก บังคับให้เป็น 0 ก่อนพิมพ์ */
      : [["รายการปรับปรุงอื่น", -x.adj || 0] as [string, number]]),
  ];
  const cut = cutOf(x);
  return { c, x, earn, gross, cuts, cut };
}

/** ดาวน์โหลดสลิปหนึ่งรอบเป็น CSV และนับครั้งที่ดาวน์โหลด (BR-05) */
function downloadSlip(emp: Employee, row: Row) {
  const { c, x, earn, gross, cuts, cut } = slipParts(row);
  countDownload(row.month, emp.id);
  downloadCsv(
    `สลิปเงินเดือน-${row.month}-${emp.id}.csv`,
    toCsv([
      ["สลิปเงินเดือน", thaiMonth(row.month)],
      ["ชื่อ", emp.name],
      ["รหัสพนักงาน", emp.id],
      ["ตำแหน่ง", hrPos(emp.pos).label],
      ["ช่วงรอบ", `${thaiDate(c.from)} – ${thaiDate(c.to)}`],
      [],
      ["รายได้", "บาท"],
      ...earn.filter(([, v]) => v !== 0),
      ["รวมรายได้", gross],
      [],
      ["รายการหัก", "บาท"],
      ...cuts,
      ["รวมรายการหัก", cut],
      [],
      ...((x.reimb ?? 0) > 0 ? [["ค่าใช้จ่ายคืน", x.reimb ?? 0], []] : []),
      ["รับสุทธิ", x.net],
    ]),
  );
}

/**
 * สลิปของรอบหนึ่ง — สี่ส่วนตามต้นแบบ ข้อมูลพนักงาน รายได้ รายการหัก ยอดสุทธิ
 * มือถือเป็นแผ่นจากล่างจอ: ยอดสุทธิขึ้นก่อน ตามด้วยตารางรายได้/รายการหัก ซ่อนข้อมูลพนักงานและหมายเหตุท้าย
 * (ต้นแบบ myslip-mobile · ตัวยึด .m-ps-dlg (กล่อง) และ .m-ps-slip (เนื้อหา) ใช้แต่งกล่องนี้ใน styles/mobile/payslip.css)
 */
function SlipDialog({
  emp,
  row,
  onClose,
}: {
  emp: Employee;
  row: Row;
  onClose: () => void;
}) {
  const { c, x, earn, gross, cuts, cut } = slipParts(row);

  return (
    <Sheet
      title={`สลิปเงินเดือน ${thaiMonth(row.month)}`}
      onClose={onClose}
      className="m-ps-dlg"
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ปิด
          </button>
          <button type="button" className="btn solid btn-solid" onClick={() => downloadSlip(emp, row)}>
            ดาวน์โหลด
          </button>
        </>
      }
    >
      <div className="m-ps-slip">
      <div className="m-ps-net md:hidden">
        <span>รับสุทธิ</span>
        <b className="num">{baht(x.net)} บาท</b>
      </div>

      {/* ส่วนแรกบนจอคอม — กล่องยอดสุทธิมือถือข้างบนซ่อนอยู่ first:mt-0 จึงจับไม่ได้ ต้องสั่ง md:mt-0 เอง */}
      <Sect title="ข้อมูลพนักงาน" className="max-md:hidden md:mt-0">
        <Row2 k="ชื่อ" v={emp.name} />
        <Row2 k="ตำแหน่ง" v={hrPos(emp.pos).label} />
        <Row2 k="รอบ" v={thaiMonth(row.month)} />
        <Row2 k="ช่วงวันที่" v={`${thaiDate(c.from)} – ${thaiDate(c.to)}`} />
      </Sect>

      <Sect title="รายได้">
        {earn
          .filter(([, v]) => v !== 0)
          .map(([label, v], i) => (
            <Row2 key={`${i}-${label}`} k={label} v={baht(v)} />
          ))}
        <Row2 k="รวมรายได้" v={baht(gross)} strong />
      </Sect>

      <Sect title="รายการหัก">
        {cuts.map(([label, v], i) => (
          <Row2 key={`${i}-${label}`} k={label} v={baht(v)} />
        ))}
        <Row2 k="รวมรายการหัก" v={baht(cut)} strong />
      </Sect>

      {(x.reimb ?? 0) > 0 && (
        /* ใบเบิกที่อนุมัติแล้ว จ่ายคืนพร้อมเงินเดือน — ไม่ใช่รายได้ ไม่คิดประกันสังคม */
        <Sect title="ค่าใช้จ่ายคืน">
          <Row2 k="ใบเบิกค่าใช้จ่ายที่อนุมัติแล้ว" v={baht(x.reimb ?? 0)} />
        </Sect>
      )}

      <Sect title="ยอดสุทธิ" className="max-md:hidden">
        <Row2 k="รับสุทธิ" v={`${baht(x.net)} บาท`} strong />
      </Sect>

      <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground max-md:hidden">
        ตัวเลขชุดเดียวกับที่ฝ่ายบุคคลปิดรอบไว้ ถ้าเห็นว่าไม่ตรงให้แจ้งฝ่ายบุคคลก่อนสิ้นรอบถัดไป
      </p>
      </div>
    </Sheet>
  );
}

function Sect({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`mt-5 first:mt-0 ${className}`}>
      <h3 className="mb-2 border-b border-border pb-2 text-[14px] font-bold">{title}</h3>
      <dl className="flex flex-col gap-1.5">{children}</dl>
    </section>
  );
}

function Row2({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 ${
        strong ? "border-t border-border pt-2" : ""
      }`}
    >
      <dt className={strong ? "text-[13.5px] font-bold" : "text-[13px] text-muted-foreground"}>
        {k}
      </dt>
      <dd className={`num text-right ${strong ? "text-[14px] font-bold" : "text-[13px] font-medium"}`}>
        {v}
      </dd>
    </div>
  );
}
