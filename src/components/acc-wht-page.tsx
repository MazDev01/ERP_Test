"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { WHT_PAYEE, whtAmount, whtType, type WhtPayee, type WhtRow } from "@/lib/acc-data";
import { useAcc } from "@/lib/acc-store";
import { TH_MONTHS_FULL, baht, bkkNow, parseIsoDate, thaiDate } from "@/lib/format";
import { useRole } from "@/lib/role";
import { MonthNav } from "./acc-ui";
import { FileIcon, PlusIcon } from "./icons";
import { Sheet } from "./lead-dialogs";
import { PhoneCard, PhoneList } from "./acchr-phone";
import { stackNo } from "@/lib/stack-no";

type TabKey = "all" | WhtPayee;

/*
 * ภาษีที่บริษัทเราหักผู้ให้บริการภายนอกแล้วนำส่งกรมสรรพากร (ไม่ใช่ภาษีที่ลูกค้าหักเรา)
 * เพิ่มรายการ = เลือกแบบฟอร์มของกรมสรรพากรแล้วกรอกลงแบบ (ผู้ใช้สั่ง 9 ต.ค. 2569)
 *   50 ทวิ → /acc/wht/cert
 * บริษัทไม่ใช้ใบแนบ ภ.ง.ด.3/53 — เอกสารมีแค่หนังสือรับรอง 50 ทวิ แยกตามประเภทผู้ถูกหักภาษี
 * "+ ยื่นภาษี" เลือก นิติบุคคล / บุคคลธรรมดา → /acc/wht/cert?type=juristic|individual (ผู้ใช้สั่ง 16 ต.ค. 2569)
 */
export function AccWhtPage() {
  const acc = useAcc();
  const router = useRouter();
  const readOnly = useRole() !== "acc";
  const [tab, setTab] = useState<TabKey>("all");
  /* กลับจากหน้าเอกสารพร้อม ?month= — เปิดเดือนเดิมที่ทำงานอยู่ */
  const wanted = useSearchParams().get("month") ?? "";
  const [view, setView] = useState(() =>
    /^\d{4}-\d{2}$/.test(wanted) ? parseIsoDate(`${wanted}-01`) : bkkNow(),
  );
  const [choosing, setChoosing] = useState(false);
  const open = (r: WhtRow) => router.push(`/acc/wht/cert?id=${encodeURIComponent(r.id)}`);

  /* r.date เป็น yyyy-mm-dd — ต้องอ่านผ่าน parseIsoDate ไม่ใช่ new Date(iso)
     ที่ตีความเป็นเที่ยงคืน UTC แล้วเลื่อนไปเดือนก่อนบนเครื่องที่อยู่หลังเวลาไทย */
  const inMonth = acc.wht.filter((r) => {
    const d = parseIsoDate(r.date);
    return d.getFullYear() === view.getFullYear() && d.getMonth() === view.getMonth();
  });
  /* ลำดับแบบกองซ้อน — นับจากรายการทั้งหมดทุกเดือนตามวันที่จ่าย ใหม่สุดเลขมากสุดอยู่บน (ผู้ใช้สั่ง 12 ต.ค. 2569) */
  const noOf = stackNo(acc.wht, (r) => r.date, (r) => r.id);
  const rows = (tab === "all" ? inMonth : inMonth.filter((r) => r.payeeType === tab)).sort(
    (a, b) => (noOf.get(b.id) ?? 0) - (noOf.get(a.id) ?? 0),
  );

  const jur = inMonth.filter((r) => r.payeeType === "juristic");
  const ind = inMonth.filter((r) => r.payeeType === "individual");
  const noCert = inMonth.filter((r) => !r.no);
  const sum = (list: WhtRow[]) => list.reduce((a, r) => a + whtAmount(r), 0);
  const base = (list: WhtRow[]) => list.reduce((a, r) => a + r.base, 0);
  const monthText = `${TH_MONTHS_FULL[view.getMonth()]} ${view.getFullYear() + 543}`;

  /* นำส่งภายในวันที่ 7 ของเดือนถัดไป */
  const due = new Date(view.getFullYear(), view.getMonth() + 1, 7);

  return (
    <div className="space-y-4">
      <div className="bar">
        <div>
          <h1>ยื่นภาษี</h1>
        </div>
        <div className="tools w-full flex-wrap sm:w-auto">
          <MonthNav view={view} onChange={setView} />
          {!readOnly && (
            <button
              type="button"
              className="btn solid btn-solid btn-block-mobile shrink-0"
              onClick={() => setChoosing(true)}
            >
              <PlusIcon className="size-[15px]" strokeWidth={2.2} />
              ยื่นภาษี
            </button>
          )}
        </div>
      </div>

      <section className="glass rounded-[15px] px-5 py-[18px] max-sm:px-4 max-sm:py-4">
        <h2 className="text-[15px] font-bold">สรุปยื่นแบบประจำเดือน</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          รอบเดือน {monthText} · กำหนดนำส่งภายในวันที่{" "}
          <b className="font-bold text-primary">
            {due.getDate()} {TH_MONTHS_FULL[due.getMonth()]} {due.getFullYear() + 543}
          </b>
        </p>
        {/* มือถือ: สรุปสี่ช่องวางสองคอลัมน์ ไม่ต้องปัดผ่านกล่องใหญ่สี่กล่อง */}
        <div className="mt-3.5 grid grid-cols-2 gap-3 max-sm:gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <Sum
            title={WHT_PAYEE.juristic}
            value={baht(sum(jur))}
            meta={`${jur.length} ราย · ยอดจ่าย ${baht(base(jur))}`}
          />
          <Sum
            title={WHT_PAYEE.individual}
            value={baht(sum(ind))}
            meta={`${ind.length} ราย · ยอดจ่าย ${baht(base(ind))}`}
          />
          <Sum
            title="รวมต้องนำส่ง"
            value={baht(sum(inMonth))}
            meta={`${inMonth.length} ราย`}
            tone="ok"
          />
          <Sum
            title="ยังไม่ได้ออกหนังสือรับรอง"
            value={`${noCert.length} ราย`}
            meta={noCert.length ? "" : "ออกครบแล้ว"}
            tone={noCert.length ? "bad" : undefined}
          />
        </div>
      </section>

      <section className="panel glass flex flex-col">
        <div className="strip">
          <div className="tabs">
            <button type="button" className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>
              ทั้งหมด <b>{inMonth.length}</b>
            </button>
            <button type="button" className={tab === "juristic" ? "on" : ""} onClick={() => setTab("juristic")}>
              {WHT_PAYEE.juristic} <b>{jur.length}</b>
            </button>
            <button type="button" className={tab === "individual" ? "on" : ""} onClick={() => setTab("individual")}>
              {WHT_PAYEE.individual} <b>{ind.length}</b>
            </button>
          </div>
        </div>

        <div className="scroll-stable min-h-0 flex-1 overflow-auto max-sm:hidden">
          <table className="data-table cards-sm min-w-[1040px]">
            <thead>
              <tr>
                <th className="c" style={{ width: 60 }}>ลำดับ</th>
                <th style={{ width: 120 }}>วันที่จ่าย</th>
                <th style={{ width: 230 }}>ผู้ให้บริการ (ผู้ถูกหักภาษี)</th>
                <th style={{ width: 200 }}>ประเภทเงินได้</th>
                <th className="r" style={{ width: 130 }}>ยอดก่อนภาษี</th>
                <th className="r" style={{ width: 120 }}>ภาษีที่หัก</th>
                <th style={{ width: 170 }}>หนังสือรับรอง</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-muted-foreground">
                    ไม่มีรายการในเดือนนี้
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => open(r)}>
                    <td data-label="ลำดับ" className="c num muted">{noOf.get(r.id)}</td>
                    <td data-label="วันที่จ่าย" className="num muted">{thaiDate(r.date)}</td>
                    <td data-label="ผู้ให้บริการ">
                      <b className="font-semibold">{r.name}</b>
                      <span className="why num">{r.tax}</span>
                      <PayeeTag p={r.payeeType} />
                    </td>
                    <td data-label="ประเภทเงินได้" className="muted">
                      <span className="clip">
                        {whtType(r.type).label} · {r.rate}%
                      </span>
                    </td>
                    <td data-label="ยอดก่อนภาษี" className="r num">{baht(r.base)}</td>
                    <td data-label="ภาษีที่หัก" className="r num font-semibold">{baht(whtAmount(r))}</td>
                    <td data-label="หนังสือรับรอง" className="muted">
                      {r.no ? (
                        <Link
                          href={`/acc/wht/cert?id=${encodeURIComponent(r.id)}`}
                          className="num text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {r.no}
                        </Link>
                      ) : readOnly ? (
                        <span className="font-semibold text-destructive">ยังไม่ได้ออก</span>
                      ) : (
                        /* ออกหนังสือรับรองจากแถวนี้ — เปิดแบบ 50 ทวิ ที่กรอกข้อมูลของแถวไว้แล้ว (ผู้ใช้สั่ง 9 ต.ค. 2569) */
                        <Link
                          href={`/acc/wht/cert?id=${encodeURIComponent(r.id)}`}
                          className="btn glass-thin text-destructive"
                          style={{ height: 30, paddingInline: 10, fontSize: 12.5 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          ออกหนังสือรับรอง
                        </Link>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* มือถือ: ผู้ให้บริการ + ภาษีที่หักขึ้นก่อน แตะการ์ดเพื่อเปิดหนังสือรับรอง */}
        <PhoneList empty={rows.length === 0 ? "ไม่มีรายการในเดือนนี้" : undefined}>
          {rows.map((r) => (
            <PhoneCard
              key={r.id}
              title={r.name}
              sub={<span className="num">#{noOf.get(r.id)} · {r.tax}</span>}
              amount={baht(whtAmount(r))}
              amountNote="ภาษีที่หัก (บาท)"
              onOpen={() => open(r)}
              openLabel={`เปิดหนังสือรับรองของ ${r.name}`}
              badge={
                r.no ? (
                  <span className="tag t-ok">
                    <i />
                    <span className="num">{r.no}</span>
                  </span>
                ) : (
                  <span className="tag t-late">
                    <i />
                    หนังสือรับรองยังไม่ได้ออก
                  </span>
                )
              }
              stats={[
                { label: "วันที่จ่าย", value: thaiDate(r.date) },
                { label: "ยอดก่อนภาษี", value: baht(r.base) },
                { label: "ประเภทเงินได้", value: `${whtType(r.type).label} · ${r.rate}%` },
                { label: "ประเภทผู้ถูกหักภาษี", value: WHT_PAYEE[r.payeeType] },
              ]}
            />
          ))}
        </PhoneList>

        <div className="foot flex-col items-stretch gap-3 text-center sm:flex-row sm:items-center sm:text-left">
          <span>แสดง {rows.length} รายการ</span>
          <span className="sum sm:ml-auto">
            ภาษีที่ต้องนำส่งรวม<b>{baht(sum(rows))}</b> บาท
          </span>
        </div>
      </section>

      {/* เลือกแบบฟอร์มของกรมสรรพากรก่อนกรอก — แบบเดียวกับการสร้างใบเสนอราคา (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
      {choosing && (
        <Sheet
          title="ยื่นภาษี · เลือกประเภทผู้ถูกหักภาษี"
          narrow
          onClose={() => setChoosing(false)}
          footer={
            <button type="button" className="btn glass-thin" onClick={() => setChoosing(false)}>
              ยกเลิก
            </button>
          }
        >
          <div className="grid gap-2.5">
            {/* สองตัวเลือกตามประเภทผู้ถูกหักภาษี เปิดหนังสือรับรอง 50 ทวิ ที่ตั้งค่าตามประเภทไว้แล้ว (ผู้ใช้สั่ง 16 ต.ค. 2569) */}
            <FormChoice
              href="/acc/wht/cert?type=juristic"
              title={WHT_PAYEE.juristic}
              meta="บริษัท ห้างหุ้นส่วน · หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)"
            />
            <FormChoice
              href="/acc/wht/cert?type=individual"
              title={WHT_PAYEE.individual}
              meta="ผู้รับจ้างรายบุคคล · หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)"
            />
          </div>
        </Sheet>
      )}
    </div>
  );
}

function FormChoice({ href, title, meta }: { href: string; title: string; meta: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[12px] border border-border px-4 py-3 hover:border-primary hover:bg-accent"
    >
      <FileIcon className="size-[18px] flex-none text-primary" strokeWidth={1.9} />
      <span className="min-w-0">
        <b className="block text-[13.5px] font-semibold">{title}</b>
        <span className="block text-[12px] text-muted-foreground">{meta}</span>
      </span>
    </Link>
  );
}

function PayeeTag({ p }: { p: WhtPayee }) {
  return (
    <span className={`tag mt-1 ${p === "juristic" ? "t-info" : "t-early"}`}>
      <i />
      {WHT_PAYEE[p]}
    </span>
  );
}

/* การ์ดสรุปไม่ลิงก์ไปใบแนบแล้ว — บริษัทไม่ใช้ใบแนบ ภ.ง.ด. (ผู้ใช้สั่ง 16 ต.ค. 2569) */
function Sum({
  title,
  value,
  meta,
  tone,
}: {
  title: string;
  value: string;
  meta: string;
  tone?: "ok" | "bad";
}) {
  const skin =
    tone === "ok"
      ? "bg-[var(--success-soft)] border-transparent"
      : tone === "bad"
        ? "bg-[var(--destructive-soft)] border-transparent"
        : "bg-muted/60 border-border";
  const num =
    tone === "ok" ? "text-[var(--success)]" : tone === "bad" ? "text-destructive" : "text-foreground";
  const box = `min-w-0 rounded-[13px] border px-4 py-3.5 max-sm:px-3 max-sm:py-3 ${skin}`;
  const body = (
    <>
      <span className="block text-[12.5px] font-semibold text-muted-foreground max-sm:text-[11.5px] max-sm:leading-snug">{title}</span>
      <b className={`num mt-1 block text-[19px] font-bold max-sm:text-[16px] ${num}`}>{value}</b>
      <span className="mt-1 block text-[11.5px] leading-[1.5] text-muted-foreground">{meta}</span>
    </>
  );
  return <div className={box}>{body}</div>;
}
