"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { WHT_KIND, whtAmount, whtType, type WhtKind, type WhtRow } from "@/lib/acc-data";
import { useAcc } from "@/lib/acc-store";
import { TH_MONTHS_FULL, baht, bkkNow, pad2, parseIsoDate, thaiDate } from "@/lib/format";
import { useRole } from "@/lib/role";
import { MonthNav } from "./acc-ui";
import { FileIcon, PlusIcon } from "./icons";
import { Sheet } from "./lead-dialogs";
import { PhoneCard, PhoneList } from "./acchr-phone";

type TabKey = "all" | WhtKind;

/*
 * ภาษีที่บริษัทเราหักผู้ให้บริการภายนอกแล้วนำส่งกรมสรรพากร (ไม่ใช่ภาษีที่ลูกค้าหักเรา)
 * เพิ่มรายการ = เลือกแบบฟอร์มของกรมสรรพากรแล้วกรอกลงแบบ (ผู้ใช้สั่ง 9 ต.ค. 2569)
 *   50 ทวิ → /acc/wht/cert · ใบแนบ ภ.ง.ด.3/53 → /acc/wht/pnd
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
  const ym = `${view.getFullYear()}-${pad2(view.getMonth() + 1)}`;
  const open = (r: WhtRow) => router.push(`/acc/wht/cert?id=${encodeURIComponent(r.id)}`);

  /* r.date เป็น yyyy-mm-dd — ต้องอ่านผ่าน parseIsoDate ไม่ใช่ new Date(iso)
     ที่ตีความเป็นเที่ยงคืน UTC แล้วเลื่อนไปเดือนก่อนบนเครื่องที่อยู่หลังเวลาไทย */
  const inMonth = acc.wht.filter((r) => {
    const d = parseIsoDate(r.date);
    return d.getFullYear() === view.getFullYear() && d.getMonth() === view.getMonth();
  });
  const rows = (tab === "all" ? inMonth : inMonth.filter((r) => r.kind === tab)).sort((a, b) =>
    b.date.localeCompare(a.date),
  );

  const k53 = inMonth.filter((r) => r.kind === "53");
  const k3 = inMonth.filter((r) => r.kind === "3");
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
          {readOnly ? (
            <Link href={`/acc/wht/pnd?kind=53&month=${ym}`} className="btn glass-thin shrink-0">
              <FileIcon className="size-[15px]" strokeWidth={1.9} />
              ใบแนบ ภ.ง.ด.
            </Link>
          ) : (
            <button
              type="button"
              className="btn solid btn-solid btn-block-mobile shrink-0"
              onClick={() => setChoosing(true)}
            >
              <PlusIcon className="size-[15px]" strokeWidth={2.2} />
              เพิ่มรายการ
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
            title="ภ.ง.ด.53 · นิติบุคคล"
            value={baht(sum(k53))}
            meta={`${k53.length} ราย · ยอดจ่าย ${baht(base(k53))}`}
            href={`/acc/wht/pnd?kind=53&month=${ym}`}
          />
          <Sum
            title="ภ.ง.ด.3 · บุคคลธรรมดา"
            value={baht(sum(k3))}
            meta={`${k3.length} ราย · ยอดจ่าย ${baht(base(k3))}`}
            href={`/acc/wht/pnd?kind=3&month=${ym}`}
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
            <button type="button" className={tab === "53" ? "on" : ""} onClick={() => setTab("53")}>
              ภ.ง.ด.53 <b>{k53.length}</b>
            </button>
            <button type="button" className={tab === "3" ? "on" : ""} onClick={() => setTab("3")}>
              ภ.ง.ด.3 <b>{k3.length}</b>
            </button>
          </div>
        </div>

        <div className="scroll-stable min-h-0 flex-1 overflow-auto max-sm:hidden">
          <table className="data-table cards-sm min-w-[980px]">
            <thead>
              <tr>
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
                  <td colSpan={6} className="py-10 text-center text-muted-foreground">
                    ไม่มีรายการในเดือนนี้
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => open(r)}>
                    <td data-label="วันที่จ่าย" className="num muted">{thaiDate(r.date)}</td>
                    <td data-label="ผู้ให้บริการ">
                      <b className="font-semibold">{r.name}</b>
                      <span className="why num">{r.tax}</span>
                    </td>
                    <td data-label="ประเภทเงินได้" className="muted">
                      <span className="clip">
                        {whtType(r.type).label} · {r.rate}%
                      </span>
                      <span className="why">{WHT_KIND[r.kind]}</span>
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
              sub={<span className="num">{r.tax}</span>}
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
                { label: "แบบยื่น", value: WHT_KIND[r.kind] },
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
          title="เลือกแบบฟอร์ม"
          narrow
          onClose={() => setChoosing(false)}
          footer={
            <button type="button" className="btn glass-thin" onClick={() => setChoosing(false)}>
              ยกเลิก
            </button>
          }
        >
          <div className="grid gap-2.5">
            <FormChoice
              href="/acc/wht/cert"
              title="หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)"
              meta="ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร"
            />
            <FormChoice
              href={`/acc/wht/pnd?kind=53&month=${ym}`}
              title="ใบแนบ ภ.ง.ด.53 · นิติบุคคล"
              meta={`${monthText} · ${k53.length} ราย`}
            />
            <FormChoice
              href={`/acc/wht/pnd?kind=3&month=${ym}`}
              title="ใบแนบ ภ.ง.ด.3 · บุคคลธรรมดา"
              meta={`${monthText} · ${k3.length} ราย`}
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

function Sum({
  title,
  value,
  meta,
  tone,
  href,
}: {
  title: string;
  value: string;
  meta: string;
  tone?: "ok" | "bad";
  /** การ์ดของแบบ ภ.ง.ด. เปิดใบแนบของเดือนนั้น (ผู้ใช้สั่ง 9 ต.ค. 2569) */
  href?: string;
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
  return href ? (
    <Link href={href} className={`${box} block hover:border-primary`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}
