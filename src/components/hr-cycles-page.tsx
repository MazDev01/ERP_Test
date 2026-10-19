"use client";

/*
 * ประวัติรอบจ่าย (โครงหน้าชุด 24 ก.ย. 2569) — ขั้นสุดท้ายของสายรอบเงินเดือน
 *
 * แสดงเฉพาะรอบที่ปิดการคำนวณแล้ว รอบที่ยังไม่จบยังไม่ใช่ประวัติ
 * ตัวเลขทุกตัวคือยอดที่บันทึกไว้ตอนกดปิดรอบ (CycleSum) ไม่ได้คำนวณใหม่
 * เพราะเงินเดือนของพนักงานเปลี่ยนได้ภายหลัง ถ้าคำนวณใหม่ ยอดย้อนหลังจะไม่ตรงกับที่จ่ายจริง
 */

import { nameOf } from "@/lib/emp-name";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { baht, thaiDate, thaiMonth } from "@/lib/format";
import {
  GROUP_LABEL,
  cutOf,
  hrCycle,
  hrPos,
  rangeLabel,
  probRoundLabel,
  type Cycle,
  type CycleSum,
  type PayGroup,
} from "@/lib/hr-data";
import { useHr } from "@/lib/hr-store";
import { HrStepTabs, HrSteps, PayCard, PayHead, PayList, PayTiles, YearStepper, payHref, usePayGroup } from "./hr-steps";
import { Sheet } from "./lead-dialogs";
import { CheckCircleIcon, EyeIcon } from "./icons";

/*
 * หนึ่งแถวของประวัติ — รอบเดือน (key = "yyyy-mm") หรือรอบจ่ายรายวันของทดลองงาน (key = "จาก~ถึง") (ผู้ใช้สั่ง 6 ต.ค. 2569)
 * label = ชื่อรอบที่แสดง · range = ช่วงวันจริงของรอบ · year = ปีที่ใช้กรอง
 */
type Row = { key: string; label: string; range: Cycle; year: number; sum: CycleSum | null; at: string };

export function HrCyclesPage() {
  const hr = useHr();
  const [open, setOpen] = useState<{ key: string; group: PayGroup } | null>(null);
  /* มือถือ: เลือกกลุ่มจากสี่เหลี่ยมก่อน (ต้นแบบ m-pay-tiles) — หน้านี้ไม่มีปฏิทิน */
  const g = usePayGroup();
  /* กลุ่มมาจากเมนูย่อย (?g=) ไม่มีแท็บในหน้าแล้ว (ผู้ใช้สั่ง 5 ต.ค. 2569)
     สลับกลุ่มแล้วหน้าเดิมไม่ถูกสร้างใหม่ จึงปิดกล่องรอบที่ค้างไว้เอง */
  const tab: PayGroup = g.group === "daily" ? "day" : "month";
  const [seenTab, setSeenTab] = useState(tab);
  if (seenTab !== tab) {
    setSeenTab(tab);
    setOpen(null);
  }

  const day = tab === "day";
  /* รอบล่าสุดขึ้นก่อน คนมักย้อนดูรอบที่เพิ่งผ่านมา
     ทดลองงานแสดงรอบจ่ายรายวันที่ปิดเงินเดือนแล้ว พร้อมวันที่จริงของแต่ละรอบ (ผู้ใช้สั่ง 6 ต.ค. 2569) */
  const allRows: Row[] = day
    ? [...hr.dailyRounds]
        .filter((r) => r.payClosedAt)
        .sort((a, b) => b.to.localeCompare(a.to))
        .map((r) => ({
          key: r.id,
          label: probRoundLabel(r),
          range: { from: r.from, to: r.to },
          year: Number(r.to.slice(0, 4)),
          sum: r.sum,
          at: r.payClosedAt,
        }))
    : [...hr.payruns]
        .sort((a, b) => b.month.localeCompare(a.month))
        .filter((p) => p.closed)
        .map((p) => ({
          key: p.month,
          label: thaiMonth(p.month),
          range: hrCycle(p.month),
          year: Number(p.month.slice(0, 4)),
          sum: p.sum,
          at: p.closedAt,
        }));

  /*
   * กรองเป็นรายปีแทนรายเดือน (ผู้ใช้สั่ง 6 ต.ค. 2569) — ปีที่เลือกได้คือปีที่มีรอบในระบบ
   * ค่าตั้งต้นคือปีของรอบล่าสุดที่ปิดแล้ว ขึ้นปีใหม่ที่ยังไม่มีรอบปิดจะได้ไม่เปิดมาเจอหน้าว่าง
   */
  const years = [
    ...new Set([
      ...[...hr.periods, ...hr.payruns].map((p) => Number(p.month.slice(0, 4))),
      ...allRows.map((r) => r.year),
    ]),
  ].sort((a, b) => a - b);
  const [pickedYear, setYear] = useState<number | null>(null);
  const year = pickedYear ?? (allRows[0] ? allRows[0].year : years[years.length - 1]);
  const rows = allRows.filter((r) => r.year === year);
  const emptyText = `ยังไม่มีรอบที่ปิดแล้วในปี ${year + 543}`;
  const yearPick = (
    <YearStepper
      years={years}
      value={year}
      onChange={(y) => {
        setYear(y);
        setOpen(null);
      }}
    />
  );

  const picked = open ? allRows.find((r) => r.key === open.key) : undefined;

  /* แถบขั้นตอนพารอบไปด้วย — ย้อนจากประวัติกลับไปขั้นก่อนหน้าแล้วได้รอบล่าสุดที่ปิดของกลุ่มนี้เลย */
  const stepRow = rows[0] ?? allRows[0];
  const stepMonth = day ? undefined : stepRow?.key;
  const stepRange = day && stepRow ? stepRow.range : null;
  /* ลิงก์ "ดูรอบนี้" — รอบรายวันส่งช่วงวัน รอบเดือนส่งเดือน */
  const viewHref = (r: Row) => payHref("/hr/payroll", g.group, day ? undefined : r.key, day ? r.range : null);

  return (
    <div className={`hp-page space-y-4 ${g.picked ? "" : "hp-pick"}`}>
      <PayHead title="ประวัติรอบจ่าย" onBack={g.picked ? g.home : undefined} />
      <PayTiles onOpen={g.open} />

      {/* ขั้นตอนย้ายไปเป็นแท็บที่หัวแผงตาราง ตัวกรองปีอยู่ขวาบนของหน้า (ผู้ใช้สั่ง 6 ต.ค. 2569)
          มือถือซ่อน .bar ทั้งแถบ จึงมีแถบขั้นตอนอีกชุดด้านล่าง และตัวกรองปีอยู่หัวรายการ */}
      <div className="bar">
        {/* ชื่อหน้ามุมซ้ายบน — แถบบนจอคอมเป็นเส้นทางแล้ว (ผู้ใช้สั่ง 12 ต.ค. 2569) */}
        <h1 className="page-h1">ประวัติรอบจ่าย</h1>
        <div className="tools ml-auto">{yearPick}</div>
      </div>

      <HrSteps month={stepMonth} range={stepRange} group={g.group} className="md:hidden" />

      <section className="panel glass flex flex-col">
        <div className="strip max-md:hidden">
          <HrStepTabs month={stepMonth} range={stepRange} group={g.group} />
        </div>
        {/* จอคอม: ปีในตารางเป็นข้อความกลางตาราง ไม่มีกรอบและปุ่ม ‹ › — ตัวกรองอยู่ขวาบนแล้ว (ผู้ใช้สั่ง 6 ต.ค. 2569)
            มือถือ: แถบขวาบนถูกซ่อน ตัวกรองปีจึงยังอยู่ตรงนี้ */}
        <p className="num py-3 text-center text-[15px] font-bold max-md:hidden">ปี {year + 543}</p>
        <div className="p-3 md:hidden">
          <div className="tools">{yearPick}</div>
        </div>

        {/* ไม่จองร่องแถบเลื่อน ตารางเต็มกล่อง ไม่มีแถบขาวด้านขวา (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
        <div className="min-h-0 flex-1 overflow-auto max-md:hidden">
          <table className="data-table cards-sm min-w-[900px]">
            <thead>
              <tr>
                <th style={{ width: day ? 230 : 170 }}>รอบ</th>
                {/* รอบรายวันชื่อรอบคือช่วงวันที่อยู่แล้ว ไม่ต้องมีคอลัมน์ซ้ำ (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
                {!day && <th style={{ width: 230 }}>ช่วงวันที่</th>}
                <th style={{ width: 140 }}>ปิดรอบเมื่อ</th>
                <th className="c" style={{ width: 100 }}>จำนวนคน</th>
                {day && (
                  <th className="c" style={{ width: 120 }}>
                    วันที่มาทำงาน
                    <span className="mt-0.5 block text-[10.5px] font-medium text-muted-foreground">(วัน)</span>
                  </th>
                )}
                <th className="r" style={{ width: 150 }}>
                  ยอดจ่ายสุทธิ
                  <span className="mt-0.5 block text-[10.5px] font-medium text-muted-foreground">(บาท)</span>
                </th>
                {/* ไม่มีหัวคอลัมน์ที่มองเห็น — มีแค่ปุ่มรูปตา (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
                <th className="c" style={{ width: 64 }} aria-label="ดูรอบ" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    {emptyText}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const { key, label, range: c, sum, at } = row;
                  return (
                    <tr
                      key={key}
                      tabIndex={0}
                      style={{ cursor: "pointer" }}
                      onClick={() => setOpen({ key, group: tab })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpen({ key, group: tab });
                        }
                      }}
                    >
                      <td data-label="รอบ">
                        <b className="num text-[13.5px] font-bold">{label}</b>
                      </td>
                      {!day && (
                        <td data-label="ช่วงวันที่" className="num">
                          {thaiDate(c.from)} – {thaiDate(c.to)}
                        </td>
                      )}
                      <td data-label="ปิดรอบเมื่อ" className="num">
                        {thaiDate(at)}
                      </td>
                      <td data-label="จำนวนคน" className="c num">
                        {/* ไม่มียอดที่เก็บไว้ขึ้นศูนย์ตาม mockup (sum||{n:0, net:0}) */}
                        {sum ? sum.n : 0} คน
                      </td>
                      {day && (
                        <td data-label="วันที่มาทำงาน" className="c num">
                          {sum ? sum.days : 0}
                        </td>
                      )}
                      <td data-label="ยอดจ่ายสุทธิ" className="r num font-semibold">
                        {baht(sum ? sum.net : 0)}
                      </td>
                      <td data-label="ดูรอบ" className="c">
                        {/* ปุ่มนี้ทำงานของตัวเอง ไม่ให้ไปเปิดกล่องสรุปยอด (ต้นแบบ onCycClick)
                            ปุ่มรูปตา "ดูรอบนี้" (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
                        <Link
                          href={viewHref(row)}
                          className="btn glass-thin inline-grid place-items-center"
                          style={{ width: 30, height: 30, padding: 0 }}
                          onClick={(e) => e.stopPropagation()}
                          title="ดูรอบนี้"
                          aria-label={`ดูรอบนี้ · ${label}`}
                        >
                          <EyeIcon className="size-4" strokeWidth={1.9} />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* มือถือ: ชื่อเดือนของรอบเป็นหัวการ์ด ตัวเลขเป็นแถว แตะการ์ดเพื่อดูยอดที่ปิดรอบ (ต้นแบบ cy-mobile) */}
        <PayList empty={rows.length === 0 ? emptyText : undefined}>
          {rows.map((row) => {
            const { key, label, range: c, sum, at } = row;
            return (
              <PayCard
                key={key}
                title={label}
                onOpen={() => setOpen({ key, group: tab })}
                openLabel={`ดูยอดที่ปิดรอบ ${label}`}
                rows={[
                  ...(day ? [] : [{ label: "ช่วงวันที่", value: `${thaiDate(c.from)} – ${thaiDate(c.to)}` }]),
                  { label: "ปิดรอบเมื่อ", value: thaiDate(at) },
                  { label: "จำนวนคน", value: `${sum ? sum.n : 0} คน` },
                  ...(day ? [{ label: "วันที่มาทำงาน (วัน)", value: sum ? sum.days : 0 }] : []),
                ]}
                net={{ label: "ยอดจ่ายสุทธิ (บาท)", value: baht(sum ? sum.net : 0) }}
              >
                {/* ลิงก์นี้ทำงานของตัวเอง ไม่ให้ไปเปิดกล่องสรุปยอด (ต้นแบบ onCycClick) */}
                <Link
                  href={viewHref(row)}
                  className="btn glass-thin hp-cardbtn"
                  onClick={(e) => e.stopPropagation()}
                >
                  ดูรอบนี้
                </Link>
              </PayCard>
            );
          })}
        </PayList>
      </section>

      {open && picked && (
        <SumDialog
          label={picked.label}
          range={picked.range}
          group={open.group}
          sum={picked.sum}
          closed
          closedAt={picked.at}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}


/** กล่องสรุปยอดที่ปิดรอบของกลุ่มหนึ่ง พร้อมรายคนที่บันทึกไว้ตอนนั้น */
function SumDialog({
  label,
  range: c,
  group,
  sum,
  closed,
  closedAt,
  onClose,
}: {
  /** ชื่อรอบ — เดือน หรือช่วงวันของรอบจ่ายรายวัน (ผู้ใช้สั่ง 6 ต.ค. 2569) */
  label: string;
  range: Cycle;
  group: PayGroup;
  sum: CycleSum | null;
  closed: boolean;
  closedAt: string;
  onClose: () => void;
}) {
  const day = group === "day";

  return (
    <Sheet
      title={`สรุปยอดเงินเดือน ${label} — ${GROUP_LABEL[group]}`}
      onClose={onClose}
      footer={
        <button type="button" className="btn glass-thin" onClick={onClose}>
          ปิด
        </button>
      }
    >
      <div className="hp-dlg">
      {/* แถบสถานะ — ปิดรอบแล้วหรือยัง และปิดเมื่อไร อ่านได้ตั้งแต่บรรทัดแรก */}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-semibold">
        <span
          aria-hidden
          className="size-[7px] flex-none rounded-full"
          style={{ background: closed ? "var(--success)" : "var(--neutral)" }}
        />
        <span style={{ color: closed ? "var(--success)" : "var(--neutral)" }}>
          {closed ? "ปิดรอบแล้ว" : "ยังไม่ปิดรอบ"}
        </span>
        {closed && closedAt && (
          <>
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
            <span className="num font-medium text-muted-foreground">
              ปิดเมื่อ {thaiDate(closedAt)}
            </span>
          </>
        )}
      </p>
      <p className="num mt-1 text-[12.5px] text-muted-foreground">
        {thaiDate(c.from)} – {thaiDate(c.to)}
      </p>

      {!sum ? (
        /* ไม่มียอดที่เก็บไว้ ไม่คำนวณใหม่ให้ดูเหมือนมี — ข้อความตาม mockup (sumBlock) */
        <p className="mt-4 rounded-[11px] bg-muted/60 px-3.5 py-3 text-[12.5px] leading-relaxed">
          ยังไม่ได้ปิดรอบของกลุ่มนี้
        </p>
      ) : (
        <>
          <dl className="hp-kv mt-3.5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-[13.5px]">
            <Line k="จำนวนพนักงาน" v={`${sum.n} คน`} />
            {day && <Line k="วันที่มาทำงานรวม" v={`${sum.days} วัน`} />}
          </dl>

          {/* รายได้ — บรรทัดที่เป็นศูนย์ไม่ต้องขึ้น กล่องจะได้ไม่ยาวด้วยเลขศูนย์ */}
          <Part head="รายได้" bar="var(--primary)">
            <Line k={day ? "ค่าจ้าง" : "เงินเดือน"} v={baht(sum.base)} />
            {sum.ot > 0 && <Line k="ค่าล่วงเวลา" v={baht(sum.ot)} />}
            {sum.com > 0 && <Line k="Commission" v={baht(sum.com)} />}
            {sum.inc > 0 && <Line k="Incentive" v={baht(sum.inc)} />}
            {sum.allow > 0 && <Line k="ค่าตำแหน่ง" v={baht(sum.allow)} />}
            {(sum.more ?? 0) > 0 && <Line k="รายได้อื่นที่กรอกเอง" v={baht(sum.more ?? 0)} />}
            {/* ใบเบิกที่อนุมัติแล้ว จ่ายคืนพร้อมเงินเดือน ไม่ใช่รายได้ แต่บวกเข้ายอดสุทธิ
                ต้องมีบรรทัดนี้ ไม่งั้นบวกลบในกล่องแล้วไม่ได้ยอดสุทธิ */}
            {(sum.reimb ?? 0) > 0 && <Line k="ค่าใช้จ่ายคืน (ใบเบิก)" v={baht(sum.reimb ?? 0)} />}
          </Part>

          {/* รายการหักสามบรรทัด ขึ้นครบเสมอแม้เป็นศูนย์ (ผู้ใช้กำหนด 24 ก.ย. 2569)
              ยอดรวมบรรทัดเดียวทำให้ต้องไปไล่หาที่หน้าอื่นว่าหักอะไรไปบ้าง
              รายการปรับปรุงย้ายมาจากฝั่งรายได้ ติดลบคือหักเพิ่ม บวกคือคืนกลับ
              บวกลบในกล่องแล้วต้องได้ยอดจ่ายสุทธิพอดี */}
          <Part head="รายการหัก" bar="var(--info)">
            {/* ทดลองงานไม่หักประกันสังคม (ผู้ใช้สั่ง 6 ต.ค. 2569) — รอบที่ไม่มียอดไม่ต้องมีบรรทัด */}
            {sum.ss > 0 && <Line k="ประกันสังคมหัก" v={`-${baht(sum.ss)}`} />}
            <Line k="หักมาสาย" v={sum.late ? `-${baht(sum.late)}` : "—"} />
            <Line
              k="รายการหักที่กรอกเอง"
              v={sum.adj ? (sum.adj < 0 ? `-${baht(-sum.adj)}` : `+${baht(sum.adj)}`) : "—"}
            />
            {(sum.wht ?? 0) > 0 && <Line k="ภาษีหัก ณ ที่จ่าย 3%" v={`-${baht(sum.wht ?? 0)}`} />}
            <Line k="รวมรายการหัก" v={`-${baht(cutOf(sum))}`} />
            {sum.ss > 0 && <Line k="นำส่งประกันสังคม (รวมส่วนบริษัท)" v={baht(sum.ss * 2)} />}
          </Part>

          {/* ยอดสุทธิ — ตัวเลขที่คนเปิดกล่องนี้มาหา อยู่ท้ายสุดและใหญ่ที่สุด */}
          <div className="mt-4 flex items-center justify-between gap-3 rounded-[12px] bg-[var(--success-soft)] px-4 py-3">
            <span className="flex items-center gap-2 text-[13.5px] font-bold text-[var(--success)]">
              <CheckCircleIcon className="size-[17px]" strokeWidth={2} />
              ยอดจ่ายสุทธิ
            </span>
            <b className="num text-[21px] leading-none font-extrabold text-[var(--success)]">
              {baht(sum.net)}
            </b>
          </div>

          {sum.lines.length > 0 && (
            <section className="mt-5">
              <h3 className="border-b border-border pb-2 text-[15px] font-bold">
                รายคน {sum.lines.length} คน
              </h3>
              {/* มือถือ: รายคนเป็นรายการ ชื่อ + สุทธิ / เงินเดือน + โอที (ต้นแบบ cy-mobile table.lines) */}
              <div className="hp-lines hp-only-m mt-2">
                {sum.lines.map((x) => (
                  <div key={x.id}>
                    <b>{nameOf(x.name)}</b>
                    <b className="net num">{baht(x.net)}</b>
                    <span className="num">
                      {day ? `${x.days} วัน · ค่าจ้าง ${baht(x.base)}` : `เงินเดือน ${baht(x.base)}`}
                    </span>
                    <span className="o num">{day ? "" : `โอที ${x.ot ? baht(x.ot) : "—"}`}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 max-h-[280px] overflow-auto rounded-[10px] border border-border max-md:hidden">
                <table className="data-table min-w-[420px] text-[12.5px]">
                  <thead>
                    <tr>
                      <th>พนักงาน</th>
                      {day ? (
                        <>
                          <th className="c" style={{ width: 64 }}>วัน</th>
                          <th className="r" style={{ width: 96 }}>ค่าจ้าง</th>
                        </>
                      ) : (
                        <>
                          <th className="r" style={{ width: 104 }}>เงินเดือน</th>
                          <th className="r" style={{ width: 88 }}>โอที</th>
                        </>
                      )}
                      <th className="r" style={{ width: 104 }}>สุทธิ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sum.lines.map((x) => (
                      <tr key={x.id}>
                        <td>
                          {nameOf(x.name)}
                          <span className="why">{hrPos(x.pos).label}</span>
                        </td>
                        {day ? (
                          <>
                            <td className="c num">{x.days}</td>
                            <td className="r num">{baht(x.base)}</td>
                          </>
                        ) : (
                          <>
                            <td className="r num">{baht(x.base)}</td>
                            <td className="r num">{x.ot ? baht(x.ot) : "—"}</td>
                          </>
                        )}
                        <td className="r num font-semibold">{baht(x.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
      </div>
    </Sheet>
  );
}

/** หัวข้อย่อยในกล่องสรุป มีแถบสีเล็กนำหน้าให้แยกส่วนออกจากกันด้วยตาเปล่า */
function Part({ head, bar, children }: { head: string; bar: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="flex items-center gap-2 text-[13px] font-bold">
        <i aria-hidden className="block h-[13px] w-[3px] flex-none rounded-full" style={{ background: bar }} />
        {head}
      </h3>
      <dl className="hp-kv mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-[13.5px]">
        {children}
      </dl>
    </section>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="num text-right font-semibold">{v}</dd>
    </>
  );
}
