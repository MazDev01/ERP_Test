"use client";

/*
 * ประวัติรอบจ่าย (โครงหน้าชุด 24 ก.ย. 2569) — ขั้นสุดท้ายของสายรอบเงินเดือน
 *
 * แสดงเฉพาะรอบที่ปิดการคำนวณแล้ว รอบที่ยังไม่จบยังไม่ใช่ประวัติ
 * ตัวเลขทุกตัวคือยอดที่บันทึกไว้ตอนกดปิดรอบ (CycleSum) ไม่ได้คำนวณใหม่
 * เพราะเงินเดือนของพนักงานเปลี่ยนได้ภายหลัง ถ้าคำนวณใหม่ ยอดย้อนหลังจะไม่ตรงกับที่จ่ายจริง
 */

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { baht, thaiDate, thaiMonth } from "@/lib/format";
import {
  GROUP_LABEL,
  cutOf,
  hrCycle,
  hrPos,
  type CycleSum,
  type PayGroup,
  type Period,
} from "@/lib/hr-data";
import { useHr } from "@/lib/hr-store";
import { HrSteps, PayCard, PayHead, PayList, PayTiles, payHref, usePayGroup } from "./hr-steps";
import { Sheet } from "./lead-dialogs";
import { CheckCircleIcon } from "./icons";

type Row = { period: Period; sum: CycleSum | null; at: string; by: string };

export function HrCyclesPage() {
  const hr = useHr();
  const [open, setOpen] = useState<{ month: string; group: PayGroup } | null>(null);
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
  /* รอบล่าสุดขึ้นก่อน คนมักย้อนดูรอบที่เพิ่งผ่านมา */
  const rows: Row[] = [...hr.payruns]
    .sort((a, b) => b.month.localeCompare(a.month))
    .filter((p) => (day ? p.dayClosed : p.closed))
    .map((p) => ({
      period: p,
      sum: day ? p.daySum : p.sum,
      at: day ? p.dayClosedAt : p.closedAt,
      by: day ? p.dayClosedBy : p.closedBy,
    }));

  const picked = open
    ? hr.payruns.find((p) => p.month === open.month)
    : undefined;

  /* แถบขั้นตอนพาเดือนไปด้วย — ย้อนจากประวัติกลับไปขั้นก่อนหน้าแล้วได้รอบล่าสุดที่ปิดของกลุ่มนี้เลย */
  const stepMonth = rows[0]?.period.month;

  return (
    <div className={`hp-page space-y-4 ${g.picked ? "" : "hp-pick"}`}>
      <PayHead title="ประวัติรอบ" onBack={g.picked ? g.home : undefined} />
      <PayTiles onOpen={g.open} />

      <HrSteps month={stepMonth} group={g.group} />

      <section className="panel glass flex flex-col">
        {/* แถบแท็บสลับกลุ่มเอาออกทั้งแถบ (หน้านี้ไม่มีปุ่มอื่นในแถบ) — เลือกกลุ่มจากเมนูย่อยแทน (ผู้ใช้สั่ง 5 ต.ค. 2569) */}

        <div className="scroll-stable min-h-0 flex-1 overflow-auto max-md:hidden">
          <table className="data-table cards-sm min-w-[900px]">
            <thead>
              <tr>
                <th style={{ width: 170 }}>รอบ</th>
                <th style={{ width: 230 }}>ช่วงวันที่</th>
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
                <th className="c" style={{ width: 130 }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={day ? 7 : 6} className="py-12 text-center text-muted-foreground">
                    ยังไม่มีรอบที่ปิดแล้ว
                  </td>
                </tr>
              ) : (
                rows.map(({ period, sum, at }) => {
                  const c = hrCycle(period.month);
                  return (
                    <tr
                      key={period.month}
                      tabIndex={0}
                      style={{ cursor: "pointer" }}
                      onClick={() => setOpen({ month: period.month, group: tab })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpen({ month: period.month, group: tab });
                        }
                      }}
                    >
                      <td data-label="รอบ">
                        <b className="text-[13.5px] font-bold">{thaiMonth(period.month)}</b>
                      </td>
                      <td data-label="ช่วงวันที่" className="num">
                        {thaiDate(c.from)} – {thaiDate(c.to)}
                      </td>
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
                      <td data-label="จัดการ" className="c">
                        {/* ปุ่มนี้ทำงานของตัวเอง ไม่ให้ไปเปิดกล่องสรุปยอด (ต้นแบบ onCycClick) */}
                        <Link
                          href={payHref("/hr/payroll", g.group, period.month)}
                          className="btn glass-thin h-8"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`เปิดรอบ ${thaiMonth(period.month)} ที่หน้าคำนวณเงินเดือน`}
                        >
                          เปิดรอบนี้
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
        <PayList empty={rows.length === 0 ? "ยังไม่มีรอบที่ปิดแล้ว" : undefined}>
          {rows.map(({ period, sum, at }) => {
            const c = hrCycle(period.month);
            return (
              <PayCard
                key={period.month}
                title={thaiMonth(period.month)}
                onOpen={() => setOpen({ month: period.month, group: tab })}
                openLabel={`ดูยอดที่ปิดรอบ ${thaiMonth(period.month)}`}
                rows={[
                  { label: "ช่วงวันที่", value: `${thaiDate(c.from)} – ${thaiDate(c.to)}` },
                  { label: "ปิดรอบเมื่อ", value: thaiDate(at) },
                  { label: "จำนวนคน", value: `${sum ? sum.n : 0} คน` },
                  ...(day ? [{ label: "วันที่มาทำงาน (วัน)", value: sum ? sum.days : 0 }] : []),
                ]}
                net={{ label: "ยอดจ่ายสุทธิ (บาท)", value: baht(sum ? sum.net : 0) }}
              >
                {/* ลิงก์นี้ทำงานของตัวเอง ไม่ให้ไปเปิดกล่องสรุปยอด (ต้นแบบ onCycClick) */}
                <Link
                  href={payHref("/hr/payroll", g.group, period.month)}
                  className="btn glass-thin hp-cardbtn"
                  onClick={(e) => e.stopPropagation()}
                >
                  เปิดรอบนี้
                </Link>
              </PayCard>
            );
          })}
        </PayList>
      </section>

      {open && picked && (
        <SumDialog
          month={open.month}
          group={open.group}
          sum={open.group === "day" ? picked.daySum : picked.sum}
          closed={open.group === "day" ? picked.dayClosed : picked.closed}
          closedAt={open.group === "day" ? picked.dayClosedAt : picked.closedAt}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}


/** กล่องสรุปยอดที่ปิดรอบของกลุ่มหนึ่ง พร้อมรายคนที่บันทึกไว้ตอนนั้น */
function SumDialog({
  month,
  group,
  sum,
  closed,
  closedAt,
  onClose,
}: {
  month: string;
  group: PayGroup;
  sum: CycleSum | null;
  closed: boolean;
  closedAt: string;
  onClose: () => void;
}) {
  const day = group === "day";
  const c = hrCycle(month);

  return (
    <Sheet
      title={`สรุปยอดเงินเดือน ${thaiMonth(month)} — ${GROUP_LABEL[group]}`}
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
            {/* ใบเบิกที่อนุมัติแล้ว จ่ายคืนพร้อมเงินเดือน ไม่ใช่รายได้ แต่บวกเข้ายอดสุทธิ
                ต้องมีบรรทัดนี้ ไม่งั้นบวกลบในกล่องแล้วไม่ได้ยอดสุทธิ */}
            {(sum.reimb ?? 0) > 0 && <Line k="ค่าใช้จ่ายคืน (ใบเบิก)" v={baht(sum.reimb ?? 0)} />}
          </Part>

          {/* รายการหักสามบรรทัด ขึ้นครบเสมอแม้เป็นศูนย์ (ผู้ใช้กำหนด 24 ก.ย. 2569)
              ยอดรวมบรรทัดเดียวทำให้ต้องไปไล่หาที่หน้าอื่นว่าหักอะไรไปบ้าง
              รายการปรับปรุงย้ายมาจากฝั่งรายได้ ติดลบคือหักเพิ่ม บวกคือคืนกลับ
              บวกลบในกล่องแล้วต้องได้ยอดจ่ายสุทธิพอดี */}
          <Part head="รายการหัก" bar="var(--info)">
            <Line k="ประกันสังคมหัก" v={`-${baht(sum.ss)}`} />
            <Line k="หักมาสาย" v={sum.late ? `-${baht(sum.late)}` : "—"} />
            <Line
              k="รายการปรับปรุงอื่น"
              v={sum.adj ? (sum.adj < 0 ? `-${baht(-sum.adj)}` : `+${baht(sum.adj)}`) : "—"}
            />
            <Line k="รวมรายการหัก" v={`-${baht(cutOf(sum))}`} />
            <Line k="นำส่งประกันสังคม (รวมส่วนบริษัท)" v={baht(sum.ss * 2)} />
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
                    <b>{x.name}</b>
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
                          {x.name}
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
