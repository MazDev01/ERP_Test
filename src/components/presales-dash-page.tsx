"use client";

/*
 * แดชบอร์ดของทีมก่อนการขาย (SA/BD) — ตามต้นแบบ dose-erp-maz/presales-dash.html
 *
 * สามส่วนตามต้นแบบ
 *   1. การ์ดสรุปสี่ใบ — รอรับงาน · กำลังทำ · รอข้อมูลเพิ่ม · เลยกำหนด
 *   2. ต้องส่งเร็ว ๆ นี้ — งานที่ยังไม่ส่ง เรียงตามวันส่งงาน 5 รายการแรก
 *   3. ผลของข้อเสนอที่ส่งแล้ว — ไล่จากคำขอ → ใบเสนอราคาที่อ้างคำขอ → ดีล
 *      มีดีลปิดการขาย = ได้ดีล · ใบเสนอราคาถูกปฏิเสธ = ลูกค้าปฏิเสธ · นอกนั้น = รอผล
 *
 * ทุกตัวเลขคิดสดจากสโตร์งานขายชุดเดียวกับหน้างานก่อนการขาย ไม่มีตัวเลขเก็บซ้ำ
 * ทุกลิงก์พาไปหน้างานก่อนการขายของตัวเองเท่านั้น (ไม่ข้ามไปหน้าฝ่ายขาย)
 */

import Link from "next/link";
import { useMemo } from "react";
import type { PresalesRequest } from "@/lib/crm-data";
import { useCrm } from "@/lib/crm-store";
import { daysBetween, todayIso } from "@/lib/format";
import { PS_ME as ME, psMine as mine, psOwner, psWorkLink } from "@/lib/presales-work";

/** รายการในการ์ด "ต้องส่งเร็ว ๆ นี้" */
const SOON_CAP = 5;

type Result = "won" | "lost" | "wait";
const RESULT_LABEL: Record<Result, string> = { won: "ได้ดีล", lost: "ลูกค้าปฏิเสธ", wait: "รอผล" };

export function PresalesDashPage() {
  const crm = useCrm();
  const today = todayIso();
  const nameOf = useMemo(() => new Map(crm.customers.map((c) => [c.code, c.name])), [crm.customers]);
  const cus = (r: PresalesRequest) => nameOf.get(r.customerCode) ?? r.customerCode;

  const my = crm.presales.filter(mine);
  const todo = my.filter((r) => r.status === "รอรับงาน");
  const doing = my.filter((r) => r.status === "กำลังทำ");
  const waiting = my.filter((r) => r.status === "รอข้อมูลเพิ่ม");
  const open = [...doing, ...todo, ...waiting];
  const late = open.filter((r) => r.due < today);
  const soon = [...open].sort((a, b) => a.due.localeCompare(b.due)).slice(0, SOON_CAP);

  /* ข้อเสนอที่ส่งแล้วเป็นอย่างไรต่อ — นับเฉพาะคำขอที่มีรอบข้อเสนออย่างน้อยหนึ่งรอบ */
  const results = my
    .map((r) => ({ r, rounds: crm.presalesRounds.filter((x) => x.requestNo === r.no).length }))
    .filter((x) => x.rounds > 0)
    .map((x) => {
      const qs = crm.quotations.filter((q) => q.ps === x.r.no);
      const deal = crm.deals.find((d) => d.status === "ปิดการขาย" && qs.some((q) => q.no && q.no === d.quotationNo));
      const rejected = qs.some((q) => q.status === "ปฏิเสธ" || Boolean(q.rejectedAt));
      const st: Result = deal ? "won" : rejected ? "lost" : "wait";
      return { ...x, st, deal };
    });
  const count = (st: Result) => results.filter((x) => x.st === st).length;

  return (
    <div className="space-y-4">
      <div className="bar">
        <div>
          <h1>แดชบอร์ด</h1>
          {/* กล่องเดียวรวมทั้ง SA และ BD — คำขอต้องมีคนเห็นเสมอ (ดู psMine) */}
          <p>
            {ME.full} ({ME.kind}) · ดูแลคำขอทั้ง SA และ BD
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi label="รอรับงาน" value={todo.length} sub="คำขอใหม่" />
        <Kpi label="กำลังทำ" value={doing.length} sub="งานที่อยู่ในมือ" />
        <Kpi label="รอข้อมูลเพิ่ม" value={waiting.length} sub="รอฝ่ายขายตอบ" />
        <Kpi label="เลยกำหนด" value={late.length} sub="ยังไม่ได้ส่งข้อเสนอ" bad={late.length > 0} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card
          title="ต้องส่งเร็ว ๆ นี้"
          right={
            <Link href="/presales-work" className="text-[12.5px] font-semibold text-primary hover:underline">
              ดูงานทั้งหมด
            </Link>
          }
        >
          <ul>
            {soon.length === 0 ? (
              <li className="py-3.5 text-[13px] text-muted-foreground">ไม่มีงานค้าง</li>
            ) : (
              soon.map((r) => {
                const d = daysBetween(today, r.due);
                const text = d < 0 ? `เลยกำหนด ${-d} วัน` : d === 0 ? "วันนี้" : `อีก ${d} วัน`;
                const tone = d < 0 ? "text-destructive" : d <= 2 ? "text-[var(--warning)]" : "text-muted-foreground";
                return (
                  <Row key={r.id} href={psWorkLink(r.no)} title={cus(r)} sub={`${r.no} · ${r.kind} · ${psOwner(r)}`}>
                    <em className={`num text-[12.5px] font-semibold not-italic ${tone}`}>{text}</em>
                  </Row>
                );
              })
            )}
          </ul>
        </Card>

        <Card title="ผลของข้อเสนอที่ส่งแล้ว">
          <div className="mb-1.5 grid grid-cols-3 gap-2.5">
            {(["won", "lost", "wait"] as const).map((st) => (
              <div key={st} className="flex flex-col rounded-[12px] bg-muted/60 px-3 py-2.5">
                <b className="num text-[22px] leading-tight font-bold">{count(st)}</b>
                <span className="text-[12px] text-muted-foreground">{RESULT_LABEL[st]}</span>
              </div>
            ))}
          </div>
          <ul>
            {results.length === 0 ? (
              <li className="py-3.5 text-[13px] text-muted-foreground">ยังไม่มีข้อเสนอที่ส่งแล้ว</li>
            ) : (
              results.map((x) => (
                <Row key={x.r.id} href={psWorkLink(x.r.no)} title={cus(x.r)} sub={`${x.r.no} · ${x.rounds} รอบ`}>
                  <em
                    className={`text-[12.5px] font-semibold not-italic ${
                      x.st === "won"
                        ? "text-[var(--success)]"
                        : x.st === "lost"
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }`}
                  >
                    {RESULT_LABEL[x.st]}
                    {x.deal ? ` ${x.deal.no}` : ""}
                  </em>
                </Row>
              ))
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}

// ─── โครงร่างที่ใช้ซ้ำ ────────────────────────────────────────────

function Kpi({ label, value, sub, bad }: { label: string; value: number; sub: string; bad?: boolean }) {
  return (
    <div className="glass flex flex-col gap-1 rounded-[16px] px-[18px] py-4">
      <span className="text-[12.5px] font-semibold text-muted-foreground">{label}</span>
      <b className={`num text-[28px] leading-[1.15] font-bold ${bad ? "text-destructive" : ""}`}>{value}</b>
      <em className="text-[12px] text-muted-foreground not-italic">{sub}</em>
    </div>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="glass min-w-0 rounded-[16px] px-[18px] py-4">
      <div className="mb-2 flex items-center justify-between gap-2.5">
        <h2 className="text-[15px] font-bold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** แถวรายการที่กดไปหน้าต่างงานของคำขอนั้น — ชื่อ + บรรทัดรอง ซ้าย · ป้ายสถานะ ขวา */
function Row({ href, title, sub, children }: { href: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-t border-border py-2.5"
      >
        <b className="truncate text-[13.5px] font-semibold group-hover:text-primary">{title}</b>
        <span className="row-span-2 self-center">{children}</span>
        <span className="truncate text-[12px] text-muted-foreground">{sub}</span>
      </Link>
    </li>
  );
}
