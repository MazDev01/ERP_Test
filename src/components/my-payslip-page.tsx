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
  dailyRoundRange,
  hrCycle,
  isDaily,
  isDailyRoundKey,
  payKeyLabel,
  type CycleLine,
  type Employee,
} from "@/lib/hr-data";
import { countDailyDownload, countDailyView, countDownload, countView, useHr } from "@/lib/hr-store";
import { ROLE_EMPLOYEE, useComSource, useHrTime } from "@/lib/hr-link";
import { inputOfLine, PayslipPaper, printSlip, publishedSlips, slipModel, slipYtd, useAutoPrint } from "./payslip-paper";
import { useRole } from "@/lib/role";
import { Sheet } from "./lead-dialogs";
import { DownloadIcon, EyeIcon, PrintIcon } from "./icons";
import { DateField } from "./thai-date-picker";
import "@/styles/mobile/payslip.css";

/** หนึ่งแถวในรายการ = รอบที่เผยแพร่แล้วหนึ่งรอบ พร้อมบรรทัดของเราในรอบนั้น */
/** month = คีย์รอบ — รอบเดือน "yyyy-mm" หรือรอบรายช่วงของทดลองงาน "จาก~ถึง" */
type Row = { month: string; line: CycleLine; day: boolean; at: string };

/** ช่วงวันที่ของรอบ — รอบเดือนตัดตามวันตัดรอบ · รอบรายช่วงคือช่วงที่ฝ่ายบุคคลปิดไว้ */
function rangeOf(key: string) {
  return isDailyRoundKey(key) ? dailyRoundRange(key) : hrCycle(key);
}

/** ชื่อรอบ — "กันยายน 2569" · "6 – 8 ต.ค. 2569" */
function labelOf(key: string) {
  return payKeyLabel(key, thaiMonth);
}

export function MyPayslipPage() {
  const hr = useHr();
  const time = useHrTime();
  const src = useComSource();
  const role = useRole();
  const [open, setOpen] = useState<string | null>(null);
  /* เปิดจากปุ่มดาวน์โหลดบนการ์ดมือถือ = สั่งพิมพ์เป็น PDF ทันที */
  const [autoPrint, setAutoPrint] = useState(false);
  /* ตัวกรองช่วงวันที่ของมือถือ (ต้นแบบ myslip-filter) — ว่าง = ไม่กรอง */
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  /* บทบาทที่ยังไม่ได้ผูกกับทะเบียนพนักงานจะไม่มีสลิป (ดู ROLE_EMPLOYEE) */
  const myId = ROLE_EMPLOYEE[role];
  const me = myId ? hr.emp.find((e) => e.id === myId) : undefined;
  /* ทดลองงานไม่หักประกันสังคม (ผู้ใช้สั่ง 6 ต.ค. 2569) — ไม่ต้องมีช่องนี้ */
  const noSs = Boolean(me && isDaily(me));

  /* สลิปที่เผยแพร่แล้วของเรา — ตัวเลือกรอบย้ายไปอยู่ payslip-paper.tsx ใช้ร่วมกับยอดสะสมต่อปี (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  const rows: Row[] = me
    ? publishedSlips(hr, me, time, src).map((x) => ({ month: x.key, line: x.line, day: x.day, at: x.at }))
    : [];

  const picked = rows.find((r) => r.month === open);

  /* ฝึกงานไม่ได้รับค่าจ้าง จึงไม่มีสลิป — บอกเหตุผลตรง ๆ ดีกว่าโชว์ตารางว่าง */
  const why = !me
    ? "บัญชีนี้ยังไม่ได้ผูกกับทะเบียนพนักงาน จึงยังไม่มีสลิปเงินเดือน"
    : me.type === "intern"
      ? "ตำแหน่งฝึกงานไม่มีค่าจ้าง จึงไม่มีสลิปเงินเดือน"
      : "";

  /* รอบที่ทับช่วงวันที่ที่เลือก (รอบ = hrCycle วันตัดรอบเดือนก่อน → วันตัดรอบเดือนนี้) */
  const mobileRows = rows.filter((r) => {
    const c = rangeOf(r.month);
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
            {why || "ยังไม่มีสลิปที่เผยแพร่"}
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
                  const c = rangeOf(r.month);
                  const mon = labelOf(r.month);
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
                        {!noSs && <CutRow label="ประกันสังคม" v={r.line.ss} />}
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
                          onClick={() => openSlip(r.month, true)}
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
                {!noSs && (
                  <th className="r" style={{ width: 120 }}>
                    ประกันสังคม
                    <span className="u"> (บาท)</span>
                  </th>
                )}
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
                  <td colSpan={noSs ? 6 : 7} className="py-12 text-center text-muted-foreground">
                    {why || "ยังไม่มีสลิปที่เผยแพร่"}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const c = rangeOf(r.month);
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
                        <b className="text-[13.5px] font-bold">{labelOf(r.month)}</b>
                      </td>
                      <td data-label="ช่วงวันที่" className="num">
                        {thaiDate(c.from)} – {thaiDate(c.to)}
                      </td>
                      {!noSs && <Cut label="ประกันสังคม (บาท)" v={r.line.ss} />}
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
        <SlipDialog
          key={`${picked.month}-${autoPrint}`}
          emp={me}
          row={picked}
          autoPrint={autoPrint}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );

  function openSlip(month: string, print = false) {
    setOpen(month);
    setAutoPrint(print);
    /* เปิดดูรอบไหนก็นับครั้งของรอบนั้น — ฝ่ายบุคคลใช้ยืนยันว่าพนักงานได้รับสลิปแล้ว (BR-05) */
    if (myId) (isDailyRoundKey(month) ? countDailyView : countView)(month, myId);
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
 * สลิปของรอบหนึ่ง — กระดาษ A4 แบบเดียวกับฝั่งฝ่ายบุคคล (PayslipPaper · ผู้ใช้สั่ง 16 ต.ค. 2569)
 * มือถือยังมีกล่องยอดรับสุทธิด้านบน กระดาษเลื่อนข้างได้
 * ดาวน์โหลด = บันทึกเป็น PDF (สั่งพิมพ์เฉพาะกระดาษ) และนับครั้งที่ดาวน์โหลด (BR-05)
 * autoPrint = เปิดจากปุ่มดาวน์โหลดบนการ์ดมือถือ สั่งพิมพ์ทันทีที่กล่องเปิด
 */
function SlipDialog({
  emp,
  row,
  autoPrint,
  onClose,
}: {
  emp: Employee;
  row: Row;
  autoPrint: boolean;
  onClose: () => void;
}) {
  const hr = useHr();
  const time = useHrTime();
  const src = useComSource();
  const s = { key: row.month, line: row.line, day: row.day, at: row.at };
  const model = slipModel(inputOfLine(emp, s, time));
  const ytd = slipYtd(hr, emp, time, src, row.month, model);
  useAutoPrint(autoPrint);

  function download() {
    (row.day ? countDailyDownload : countDownload)(row.month, emp.id);
    printSlip();
  }

  return (
    <Sheet
      title={`${row.day ? "สลิปค่าจ้างรายสัปดาห์" : "สลิปเงินเดือน"} ${labelOf(row.month)}`}
      wide
      onClose={onClose}
      className="m-ps-dlg"
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ปิด
          </button>
          <button type="button" className="btn glass-thin max-md:hidden" onClick={printSlip}>
            <PrintIcon className="size-[15px]" strokeWidth={1.9} />
            พิมพ์
          </button>
          <button type="button" className="btn solid btn-solid" onClick={download}>
            <DownloadIcon className="size-3.5" strokeWidth={2} />
            ดาวน์โหลด PDF
          </button>
        </>
      }
    >
      <div className="m-ps-slip">
        <div className="m-ps-net md:hidden">
          <span>รับสุทธิ</span>
          <b className="num">{baht(model.net)} บาท</b>
        </div>
        <div className="overflow-x-auto">
          <PayslipPaper emp={emp} input={{ key: row.month, day: row.day, at: row.at }} model={model} ytd={ytd} />
        </div>
      </div>
    </Sheet>
  );
}
