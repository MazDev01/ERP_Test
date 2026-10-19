"use client";

/*
 * Pipeline ผู้สนใจของพนักงานขาย — จัดกลุ่มตามขั้นการขาย (ผู้ใช้สั่ง 13 ต.ค. 2569)
 * ขั้นอนุมานจากข้อมูลที่มีอยู่ ไม่มีช่องสถานะใหม่ — ลากการ์ดไปคอลัมน์ไหน = เปิดงานจริงของขั้นนั้น (ผู้ใช้สั่ง 13 ต.ค. 2569)
 *   การ์ดย้ายก็ต่อเมื่อทำงานนั้นเสร็จจริง (ข้อมูลเปลี่ยน) · ยกเลิก = การ์ดอยู่ที่เดิม · ย้อนขั้นไม่ได้
 * ไม่มีคอลัมน์ปิดการขาย เพราะรายที่ปิดงานแล้วไม่แสดงในหน้าผู้สนใจ (ผู้ใช้สั่ง 9 ต.ค. 2569)
 * เอาคอลัมน์ย่อยของพนักงานออกแล้ว — กลับเป็น 5 ขั้นหลัก การวางแผนอิสระย้ายไปมุมมองแผนติดตาม (ผู้ใช้สั่ง 14 ต.ค. 2569)
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  quotationTotals,
  quotationValidUntil,
  rejectArchived,
  rejectInfo,
  type Customer,
} from "@/lib/crm-data";
import { closeLead, logActivity, type CrmState } from "@/lib/crm-store";
import { optionsOf } from "@/lib/options";
import { useRole } from "@/lib/role";
import { ActivityDialog, CloseLeadDialog } from "./lead-dialogs";
import { daysBetween, money, thaiDate } from "@/lib/format";

export type StageKey = "new" | "contacted" | "presales" | "quoted" | "lost";

export const STAGES: { key: StageKey; label: string; hint: string; cls: string }[] = [
  { key: "new", label: "ผู้สนใจใหม่", hint: "ยังไม่มีบันทึกการติดต่อ", cls: "t-miss" },
  { key: "contacted", label: "ติดต่อแล้ว", hint: "มีบันทึกการติดต่อ", cls: "t-info" },
  { key: "presales", label: "ขอทำข้อเสนอ", hint: "ส่งคำขอก่อนการขายแล้ว", cls: "t-job" },
  { key: "quoted", label: "สร้างใบเสนอราคา", hint: "ใบเสนอราคารอลูกค้าตัดสิน", cls: "t-early" },
  { key: "lost", label: "ปฏิเสธ", hint: "ลูกค้าไม่ไปต่อ", cls: "t-late" },
];

type Card = {
  c: Customer;
  stage: StageKey;
  last: string;
  nextFollow: string;
  /** ยอดใบเสนอราคาล่าสุด (ยอดที่ลูกค้าโอนจริง) — 0 = ยังไม่มีใบ */
  value: number;
  /** งบประมาณจากคำขอก่อนการขาย — แสดงแทนเมื่อยังไม่มีใบเสนอราคา */
  budget: number;
  expired: boolean;
};

/** อนุมานขั้นการขายของผู้สนใจแต่ละราย (ผู้ใช้สั่ง 13 ต.ค. 2569) */
function buildCards(crm: CrmState, rows: Customer[], today: string): Card[] {
  return rows.map((c) => {
    const acts = crm.activities.filter((a) => a.customerCode === c.code);
    const last = acts.map((a) => a.date).sort().at(-1) ?? "";
    /* นัดถัดไป = วันนัดไกลสุดจากทุกบันทึก เหมือนหน้ารายละเอียด */
    const nextFollow = acts.map((a) => a.followUp).filter(Boolean).sort().at(-1) ?? "";
    const quotes = crm.quotations
      .filter((q) => q.customerCode === c.code && q.status !== "ร่าง" && q.no && !q.replacedBy)
      .sort((a, b) => (a.issued + a.createdAt < b.issued + b.createdAt ? 1 : -1));
    const latest = quotes[0];
    const hasDeal = (no: string) => crm.deals.some((d) => d.quotationNo === no);
    const pending = quotes.find((q) => !q.rejectedAt && !hasDeal(q.no));
    const ps = crm.presales.filter((p) => p.customerCode === c.code);
    const openPs = ps.filter((p) => p.status !== "ปิดคำขอ");

    let stage: StageKey;
    if (c.status === "ปฏิเสธ") stage = "lost";
    else if (pending) stage = "quoted";
    else if (openPs.length) stage = "presales";
    else if (acts.length) stage = "contacted";
    else stage = "new";

    /* ยอด = ใบที่รอตัดสิน · รายที่ปฏิเสธแล้วใช้ใบล่าสุด · ใบที่ลูกค้าปฏิเสธไปแล้วไม่นับเป็นมูลค่าในขั้นอื่น */
    const valueQ = pending ?? (stage === "lost" ? latest : undefined);
    return {
      c,
      stage,
      last,
      nextFollow,
      value: valueQ ? quotationTotals(valueQ).grand : 0,
      budget: (openPs[0] ?? ps[0])?.budget ?? 0,
      expired: Boolean(pending && quotationValidUntil(pending) < today),
    };
  });
}

const ORDER: StageKey[] = STAGES.map((s) => s.key);
const BACKWARD_MSG = "ย้ายย้อนขั้นไม่ได้ ขั้นจะเปลี่ยนตามงานที่ทำจริง";

/**
 * ย้ายการ์ดไปขั้นนี้ได้ไหม (ผู้ใช้สั่ง 13 ต.ค. 2569)
 * "same" = อยู่ขั้นนั้นแล้ว ไม่ต้องทำอะไร · "back" = ย้อนขั้น/ผู้สนใจใหม่ ห้าม · "ok" = เปิดงานของขั้นนั้น
 */
function moveCheck(from: StageKey, to: StageKey): "same" | "back" | "ok" {
  if (from === to) return "same";
  if (to === "new" || ORDER.indexOf(to) < ORDER.indexOf(from)) return "back";
  return "ok";
}

export function LeadsPipeline({
  crm,
  rows,
  today,
  isStale,
}: {
  crm: CrmState;
  /** เรียงมาแล้วตามตัวเลือกการเรียง — คอลัมน์คงลำดับนี้ไว้ (ผู้ใช้สั่ง 14 ต.ค. 2569) */
  rows: Customer[];
  today: string;
  isStale: (c: Customer) => boolean;
}) {
  /* ปฏิเสธครบ 1 เดือนแล้วออกจากบอร์ด ไปอยู่รายงานลูกค้าปฏิเสธ (ผู้ใช้สั่ง 14 ต.ค. 2569) */
  const cards = useMemo(
    () => buildCards(crm, rows.filter((c) => !rejectArchived(c, today)), today),
    [crm, rows, today],
  );
  const [mobileStage, setMobileStage] = useState<StageKey>("new");
  const router = useRouter();
  /* ลาก/ย้ายขั้นได้เฉพาะพนักงานขาย — บทบาทอื่นที่เปิดหน้านี้ดูอย่างเดียว (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  const canMove = useRole() === "sales";
  const [drag, setDrag] = useState<Card | null>(null);
  const [over, setOver] = useState<StageKey | null>(null);
  /* กล่องที่เปิดจากการวาง — การ์ดยังอยู่ที่เดิมจนกว่าจะบันทึกจริง */
  const [dialog, setDialog] = useState<{ kind: "activity" | "reject"; c: Customer } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const cols = STAGES.map((s) => {
    const list = cards.filter((k) => k.stage === s.key);
    return { ...s, list, total: list.reduce((n, k) => n + k.value, 0) };
  });

  /** วางการ์ดลงขั้นไหน = เปิดงานจริงของขั้นนั้น (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  const moveTo = (k: Card, to: StageKey) => {
    setMenuFor(null);
    const check = moveCheck(k.stage, to);
    if (check === "same") return;
    if (check === "back") {
      setToast(BACKWARD_MSG);
      return;
    }
    const code = encodeURIComponent(k.c.code);
    if (to === "contacted") setDialog({ kind: "activity", c: k.c });
    else if (to === "presales") router.push(`/presales/new?customer=${code}`);
    else if (to === "quoted") router.push(`/quotations/new?customer=${code}`);
    else if (to === "lost") setDialog({ kind: "reject", c: k.c });
  };

  const renderCard = (k: Card, mobile = false) => (
    <li key={k.c.code} className={`relative ${drag?.c.code === k.c.code ? "opacity-50" : ""}`}>
      <Link
        href={`/leads/${k.c.code}`}
        draggable={canMove && !mobile}
        onDragStart={(e) => {
          if (!canMove || mobile) return;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", k.c.code);
          setDrag(k);
        }}
        onDragEnd={() => {
          setDrag(null);
          setOver(null);
        }}
        className={`block rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:border-primary/50 ${
          canMove && !mobile ? "cursor-grab active:cursor-grabbing" : ""
        }`}
      >
        <div className={`flex items-start justify-between gap-2 ${canMove && mobile ? "pr-20" : ""}`}>
          <b className="line-clamp-2 text-[13.5px] leading-snug font-semibold">{k.c.name}</b>
          {k.value > 0 && <span className="num shrink-0 text-[13px] font-semibold">฿{money(k.value)}</span>}
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {k.c.contact || "ยังไม่ได้กรอกผู้ติดต่อ"}
          {k.c.phone && <span className="num"> · {k.c.phone}</span>}
        </p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <dt>ติดต่อล่าสุด</dt>
          <dd className="num">
            {k.last ? thaiDate(k.last) : "—"}
            {isStale(k.c) && k.last && (
              <span className="font-semibold text-destructive"> · ค้าง {daysBetween(k.last, today)} วัน</span>
            )}
          </dd>
          <dt>นัดถัดไป</dt>
          <dd className={`num ${k.nextFollow && k.nextFollow < today && k.stage !== "lost" ? "font-semibold text-destructive" : ""}`}>
            {k.nextFollow ? thaiDate(k.nextFollow) : "—"}
          </dd>
          {/* เหตุผลที่ปฏิเสธดูได้ในหน้ารายละเอียดเท่านั้น (ผู้ใช้สั่ง 16 ต.ค. 2569) */}
          {k.value === 0 && k.budget > 0 && (
            <>
              <dt>งบประมาณ</dt>
              <dd className="num">฿{money(k.budget)}</dd>
            </>
          )}
        </dl>
        {k.expired && (
          <span className="tag t-early mt-2">
            <i />
            ใบเสนอราคาหมดอายุ
          </span>
        )}
      </Link>
      {/* มือถือลากไม่ได้ — ปุ่ม "ย้ายขั้น" เปิดเมนูขั้นถัดไปแทน ทำงานเหมือนการวาง (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
      {canMove && mobile && (
        <>
          <div className="absolute top-2.5 right-2.5 z-[2]">
            <button
              type="button"
              className="btn glass-thin px-2.5 py-1 text-xs"
              aria-haspopup="menu"
              aria-expanded={menuFor === k.c.code}
              onClick={() => setMenuFor((v) => (v === k.c.code ? null : k.c.code))}
            >
              ย้ายขั้น
            </button>
          </div>
          {/* เมนูกางใต้การ์ดในแนวเดียวกัน — .panel ตัดส่วนที่ล้นออก ป๊อปอัปลอยจะโดนตัดที่การ์ดท้าย */}
          {menuFor === k.c.code && (
            <ul role="menu" className="mt-1.5 overflow-hidden rounded-xl border border-border bg-card py-1">
              {STAGES.map((s) => {
                const check = moveCheck(k.stage, s.key);
                return (
                  <li key={s.key} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={check === "same"}
                      onClick={() => moveTo(k, s.key)}
                      className={`block w-full px-3.5 py-2.5 text-left text-[13px] ${
                        check === "ok" ? "font-medium hover:bg-accent" : "text-muted-foreground"
                      }`}
                    >
                      {s.label}
                      {check === "same" && " · อยู่ที่นี่"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </li>
  );

  const mobileCol = cols.find((c) => c.key === mobileStage) ?? cols[0];

  return (
    <>
      {/* เดสก์ท็อป: คอลัมน์เรียงข้างกัน เลื่อนแนวนอนได้เมื่อจอแคบ (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
      <div className="hidden gap-3 overflow-x-auto pb-2 md:flex">
        {cols.map((col) => {
          /* ไฮไลต์คอลัมน์ปลายทางตอนลากผ่าน — เขียว = วางได้ · แดง = ย้อนขั้น (ผู้ใช้สั่ง 13 ต.ค. 2569) */
          const check = drag ? moveCheck(drag.stage, col.key) : "same";
          const hot = over === col.key && check !== "same";
          return (
            <section
              key={col.key}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = check === "ok" ? "move" : "none";
                if (over !== col.key) setOver(col.key);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((v) => (v === col.key ? null : v));
              }}
              onDrop={(e) => {
                e.preventDefault();
                const k = drag;
                setDrag(null);
                setOver(null);
                if (k) moveTo(k, col.key);
              }}
              className={`panel glass flex w-[264px] min-w-[264px] flex-1 flex-col transition-shadow ${
                hot ? (check === "ok" ? "ring-2 ring-primary" : "ring-2 ring-destructive/60") : ""
              }`}
            >
              <header className="border-b border-border px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={`tag min-w-0 ${col.cls}`}>
                    <i />
                    <span className="truncate">{col.label}</span>
                  </span>
                  <span className="num shrink-0 text-[13px] font-semibold">{col.list.length}</span>
                </div>
                <p className="mt-1.5 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{col.hint}</span>
                  <span className="num shrink-0 font-semibold text-foreground">
                    {col.total > 0 ? `฿${money(col.total)}` : "—"}
                  </span>
                </p>
              </header>
              <ul className="flex max-h-[calc(100vh-280px)] min-h-[120px] flex-col gap-2 overflow-y-auto p-2.5">
                {col.list.length ? (
                  col.list.map((k) => renderCard(k))
                ) : (
                  <li className="py-8 text-center text-xs text-muted-foreground">ไม่มีรายการ</li>
                )}
              </ul>
            </section>
          );
        })}
      </div>

      {/* มือถือ: ชิปเลือกขั้น + รายการคอลัมน์เดียว (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
      <div className="space-y-3 md:hidden">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="ขั้นการขาย">
          {cols.map((col) => (
            <button
              key={col.key}
              type="button"
              aria-pressed={mobileCol.key === col.key}
              onClick={() => {
                setMobileStage(col.key);
                setMenuFor(null);
              }}
              className={`btn shrink-0 whitespace-nowrap ${
                mobileCol.key === col.key ? "bg-accent font-semibold text-primary" : "glass-thin"
              }`}
            >
              {col.label}
              <span className="num">{col.list.length}</span>
            </button>
          ))}
        </div>
        <section className="panel glass">
          <header className="flex items-baseline justify-between gap-2 border-b border-border px-4 py-3 text-xs text-muted-foreground">
            <span>{mobileCol.hint}</span>
            <span className="num font-semibold text-foreground">
              {mobileCol.total > 0 ? `฿${money(mobileCol.total)}` : "—"}
            </span>
          </header>
          <ul className="flex flex-col gap-2 p-3">
            {mobileCol.list.length ? (
              mobileCol.list.map((k) => renderCard(k, true))
            ) : (
              <li className="py-10 text-center text-sm text-muted-foreground">ไม่มีรายการในขั้นนี้</li>
            )}
          </ul>
        </section>
      </div>

      {/* กล่องงานจริงของขั้นปลายทาง — ใช้กล่องเดียวกับหน้ารายละเอียด (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
      {dialog?.kind === "activity" && (
        <ActivityDialog
          customerName={dialog.c.name}
          channels={optionsOf("leadChannel")}
          onClose={() => setDialog(null)}
          onSubmit={(v) => {
            logActivity({ customerCode: dialog.c.code, ...v });
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "reject" && (
        <CloseLeadDialog
          customerName={dialog.c.name}
          code={dialog.c.code}
          onClose={() => setDialog(null)}
          onSubmit={(reason) => {
            closeLead(dialog.c.code, reason);
            setDialog(null);
          }}
        />
      )}

      {toast && (
        <p
          role="status"
          className="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] left-1/2 z-70 -translate-x-1/2 rounded-full bg-foreground px-5 py-3 text-[13.5px] font-semibold whitespace-nowrap text-background shadow-lg sm:bottom-8"
        >
          {toast}
        </p>
      )}
    </>
  );
}
