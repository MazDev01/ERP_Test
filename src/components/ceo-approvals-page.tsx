"use client";

/*
 * คำขออนุมัติของผู้บริหาร (ตามต้นแบบ dose-erp-maz/ceo-approvals.html)
 *
 * สองส่วน
 * 1. ยอดเงินเดือนรออนุมัติ — ฝ่ายบุคคลส่งยอดของแต่ละรอบ/กลุ่มมา CEO อนุมัติแล้วฝ่ายบุคคลจึงปิดรอบได้
 *    ตีกลับต้องมีเหตุผล ฝ่ายบุคคลเห็นบนป้ายสถานะแล้วแก้ไขส่งใหม่
 * 2. คำขอของพนักงาน (ลา โอที ใบเบิก) — หน้าตาและการทำงานเดียวกับหน้าคำขออนุมัติของ GM (ผู้ใช้สั่ง 5 ต.ค. 2569)
 *    ใช้ ApprovalsBoard ตัวเดียวกับ /approvals ไม่ได้ทำตารางแยก (เดิมเป็นห้องแชทแยกตามพนักงาน)
 *    ใครส่งอะไรมาถึงผู้บริหาร กำหนดที่สายอนุมัติใน role.ts (approvesFor) หน้านี้ไม่ตัดสินเอง
 *    คนที่ล็อกอินได้อ่านจากใบลา/โอที/ใบเบิกของบทบาทนั้น · ทีมงานที่ยังไม่มีบัญชีอ่านจาก emp-requests.ts
 *    CEO แก้ชั่วโมงโอทีไม่ได้ — อนุมัติเท่าที่ขอเสมอ (ApprovalsBoard fixedOt)
 *
 * ?req=<id> จากแดชบอร์ดหรือ LINE เปิดรายละเอียดของใบนั้น
 *
 * แยกเป็นสองเมนูย่อยในแถบข้าง (ผู้ใช้สั่ง 5 ต.ค. 2569) — nav.ts CEO_APPROVALS_SUB
 *   ?k=time (ค่าเริ่มต้น) "ลาและโอที" = ตารางคำขอของพนักงาน · ?k=pay "ยอดเงินเดือน" = ยอดที่ฝ่ายบุคคลส่งมา
 */

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { claimTotal } from "@/lib/expense-data";
import { useAllClaims } from "@/lib/expense-store";
import { baht, bkkStamp, thaiDate, thaiMonth, thaiStamp } from "@/lib/format";
import { GROUP_LABEL, ROLE_EMPLOYEE, empOf, hrPos, type PayGroup } from "@/lib/hr-data";
import { useEmpRequests } from "@/lib/emp-requests";
import { decidePayroll, useHr } from "@/lib/hr-store";
import { usePayrollSumFn, usePayrollVoidWatch } from "@/lib/hr-link";
import { quotaAfterLeave, quotaAfterUsed, useAllLeave } from "@/lib/leave-store";
import { useAllOt } from "@/lib/ot-store";
import { approvesFor, useApprovalRoute, type Role } from "@/lib/role";
import { formatMinutesOfDay, minutesOfDay } from "@/lib/work-schedule";
import { ApprovalsBoard, TABS, type ApprovalRequest } from "./approvals-page";
import { ConfirmDialog } from "./confirm-dialog";
import { type OtReq } from "./ot-actual-fields";

type Kind = "leave" | "ot" | "expense";
type Status = "pending" | "approved" | "rejected";

/** คำขอหนึ่งใบที่ส่งถึงผู้บริหาร — รวมสามประเภทให้อยู่ในรูปเดียวกัน (แดชบอร์ด CEO ใช้ด้วย) */
export type CeoRequest = Item;

type Item = {
  kind: Kind;
  /** รหัสพนักงานผู้ขอ */
  emp: string;
  /** role = ใบของผู้ใช้ที่ล็อกอินได้ (ตัดสินผ่านสโตร์ของบทบาท) · emp = คำขอของทีมงานที่ยังไม่มีบัญชี */
  src: "role" | "emp";
  role?: Role;
  /** รหัสที่ใช้กับ ?req= — ใบลา/โอทีใช้เลขใบ ใบเบิกใช้ บทบาท-เดือน */
  id: string;
  /** คีย์ที่สโตร์ใช้ตัดสิน — ใบเบิกคือเดือน */
  key: string;
  /** เลขที่เอกสาร (LV-/OT-/EX-) — เอกสารที่ใช้เบิกเงินต้องอ้างอิงได้ */
  no: string;
  status: Status;
  /** "yyyy-mm-dd hh:mm" — ใบลาไม่มีเวลายื่น ใช้วันที่ลา */
  at: string;
  hasTime: boolean;
  /** ชื่อคำขอสั้น ๆ เช่น "ลาพักร้อน 2 วัน" */
  title: string;
  label: string;
  big: string;
  lines: string[];
  /** บรรทัดสิทธิ์คงเหลือของใบลา — ติดลบคือเกินสิทธิ์ */
  quota?: number;
  note: string;
  reason: string;
  hours?: number;
  /** ชั่วโมงโอทีที่อนุมัติจริง — ไม่มี = เท่าที่ขอ */
  approvedHours?: number | null;
  /** ช่วงเวลาที่ขอ ใช้เทียบเวลาตอกบัตรจริงตอนตัดสิน — เฉพาะโอที */
  ot?: OtReq;
  /** "yyyy-mm-dd hh:mm" เวลาที่ตัดสิน */
  decidedAt?: string;
};

function statusOf(s: string): Status {
  return s === "อนุมัติแล้ว" ? "approved" : s === "ไม่อนุมัติ" ? "rejected" : "pending";
}

const num2 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * คำขอทั้งหมดที่ส่งถึงผู้บริหาร (ใบลา โอที ใบเบิก) เรียงตามเวลายื่น
 * ใช้ทั้งหน้าคำขออนุมัติและตาราง "คำขอรออนุมัติ" ในแดชบอร์ด CEO
 */
export function useCeoRequests(): Item[] {
  const leaves = useAllLeave();
  const ots = useAllOt();
  const claims = useAllClaims();
  const route = useApprovalRoute();
  const extra = useEmpRequests();

  return useMemo(() => {
    const out: Item[] = [];
    for (const { kind, from } of approvesFor("ceo", route)) {
      const emp = ROLE_EMPLOYEE[from] ?? from;
      if (kind === "leave") {
        for (const v of leaves[from]) {
          /* ใบลาที่ยกเลิกแล้วไม่ขึ้นคิวอนุมัติ แต่ยังอยู่ในระบบเป็นประวัติ */
          if (v.status === "ยกเลิก") continue;
          const range = v.date === v.toDate ? thaiDate(v.date) : `${thaiDate(v.date)} – ${thaiDate(v.toDate)}`;
          out.push({
            kind,
            emp,
            src: "role",
            role: from,
            id: v.id,
            key: v.id,
            no: v.id,
            status: statusOf(v.status),
            at: v.submittedAt ?? `${v.date} 00:00`,
            hasTime: Boolean(v.submittedAt),
            title: `${v.type} ${num2(v.days)} วัน`,
            label: v.type,
            big: `${num2(v.days)} วัน`,
            lines: [range],
            /* สิทธิ์หลังลา — สูตรเดียวกับหน้าอนุมัติของ GM และการ์ดในหน้าการลาของผู้ยื่น */
            quota: quotaAfterLeave(leaves[from], v),
            note: statusOf(v.status) === "rejected" ? "" : v.comment,
            reason: statusOf(v.status) === "rejected" ? v.comment : "",
            decidedAt: v.decidedAt,
          });
        }
      }
      if (kind === "ot") {
        for (const v of ots[from]) {
          if (v.status === "ยกเลิก") continue;
          out.push({
            kind,
            emp,
            src: "role",
            role: from,
            id: v.id,
            key: v.id,
            no: v.id,
            status: statusOf(v.status),
            at: v.submittedAt || `${v.date} 00:00`,
            hasTime: Boolean(v.submittedAt),
            title: `OT ${num2(v.hours)} ชั่วโมง`,
            label: "ขอ OT",
            big: `${num2(v.hours)} ชั่วโมง`,
            lines: [thaiDate(v.date), `${formatMinutesOfDay(v.startMin)} – ${formatMinutesOfDay(v.endMin)} น.`],
            note: v.reason,
            reason: v.comment,
            hours: v.hours,
            decidedAt: v.decidedAt,
            approvedHours: v.approvedHours,
            ot: {
              date: v.date,
              startMin: v.startMin,
              endMin: v.endMin,
              hours: v.hours,
              role: from,
            },
          });
        }
      }
      if (kind === "expense") {
        for (const v of claims[from]) {
          if (v.status === "ร่าง") continue;
          const total = claimTotal(v);
          out.push({
            kind,
            emp,
            src: "role",
            role: from,
            id: `${from}-${v.month}`,
            key: v.month,
            no: v.no ?? "",
            status: statusOf(v.status),
            at: v.submittedAt || `${v.month}-01 00:00`,
            hasTime: Boolean(v.submittedAt),
            title: `เบิกค่าใช้จ่าย ${baht(total)} บาท`,
            label: "เบิกค่าใช้จ่าย",
            big: `${baht(total)} บาท`,
            lines: [
              `รอบ ${thaiMonth(v.month)}`,
              `${v.fuel.length} เที่ยว${v.plate ? ` · ทะเบียน ${v.plate}` : ""}`,
            ],
            note: "",
            reason: v.comment,
            decidedAt: v.decidedAt,
          });
        }
      }
    }
    /* ทีมงานที่ยังไม่มีบัญชี — OT ของ SA / Dev / Website ขึ้นถึง CEO (CEO-BR-02) */
    for (const r of extra) {
      if (r.to !== "exec") continue;
      const base = {
        emp: r.emp,
        src: "emp" as const,
        id: r.id,
        key: r.id,
        no: r.id,
        status: r.status,
        at: r.at,
        hasTime: true,
        note: r.status === "rejected" ? r.note : r.note,
        reason: r.reason ?? "",
        decidedAt: r.decidedAt,
      };
      if (r.kind === "ot")
        out.push({
          ...base,
          kind: "ot",
          hours: r.hours,
          approvedHours: r.approvedHours ?? null,
          ot:
            r.date && r.start && r.end
              ? {
                  date: r.date,
                  startMin: minutesOfDay(r.start),
                  endMin: minutesOfDay(r.end),
                  hours: r.hours ?? 0,
                  emp: r.emp,
                }
              : undefined,
          title: `OT ${num2(r.hours ?? 0)} ชั่วโมง`,
          label: "ขอ OT",
          big: `${num2(r.hours ?? 0)} ชั่วโมง`,
          lines: [thaiDate(r.date ?? ""), `${r.start} – ${r.end} น.`],
        });
      else {
        const type = r.leaveType ?? "";
        const range =
          r.from === r.toDate ? thaiDate(r.from ?? "") : `${thaiDate(r.from ?? "")} – ${thaiDate(r.toDate ?? "")}`;
        out.push({
          ...base,
          kind: "leave",
          title: `${type} ${num2(r.days ?? 0)} วัน`,
          label: type,
          big: `${num2(r.days ?? 0)} วัน`,
          lines: [range],
          quota: quotaAfterUsed(type, r.used ?? 0, r.days ?? 0),
        });
      }
    }
    return out.sort((a, b) => a.at.localeCompare(b.at));
  }, [route, leaves, ots, claims, extra]);
}

/**
 * แปลงคำขอของผู้บริหารเป็นรูปเดียวกับหน้าคำขออนุมัติของ GM — ตาราง/กล่องรายละเอียดชุดเดียวกัน (ผู้ใช้สั่ง 5 ต.ค. 2569)
 * key = คีย์ที่สโตร์ใช้ตัดสิน (applyDecision ของ approvals-page) · ref = รหัสที่ ?req= ใช้
 */
function toRequest(it: Item, name: string, sub: string): ApprovalRequest {
  const topic = it.kind === "ot" ? "ทำงานล่วงเวลา" : it.kind === "expense" ? "เบิกค่าใช้จ่าย" : it.label;
  return {
    kind: it.kind,
    src: it.src,
    role: it.role,
    as: "ceo",
    name,
    sub,
    key: it.key,
    ref: it.id,
    no: it.no,
    status: it.status,
    at: it.at,
    topic,
    line: `${it.title} ${it.lines.join(" ")} ${it.note}`,
    lines: [it.title, ...it.lines],
    why: it.reason,
    hours: it.hours,
    approvedHours: it.approvedHours,
    ot: it.ot,
    quota: it.quota,
    note: it.note,
  };
}

export function CeoApprovalsPage() {
  const params = useSearchParams();
  const reqId = params.get("req") ?? "";
  /* เมนูย่อยที่เปิดอยู่ — ไม่มี ?k= ถือเป็นลาและโอที (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  const tab = params.get("k") === "pay" ? "pay" : "time";

  return (
    <div className="space-y-4">
      <div className="bar">
        <div>
          {/* ต้นแบบมีวันที่ครั้งเดียวที่หัวหน้า (ceo-approvals.html · tk-head) — แถบบนของแอปแสดงให้แล้ว ไม่ซ้ำอีกที่นี่ */}
          <h1>{tab === "pay" ? "ยอดเงินเดือนรออนุมัติ" : "คำขอลาและโอที"}</h1>
        </div>
      </div>

      {tab === "pay" ? <PayrollStrip /> : <TimeRequests openId={reqId} />}
    </div>
  );
}

/** ลาและโอที (รวมใบเบิกที่ส่งถึงผู้บริหาร) — ตารางเดียวกับหน้าคำขออนุมัติของ GM (ผู้ใช้สั่ง 5 ต.ค. 2569) */
function TimeRequests({ openId }: { openId: string }) {
  const hr = useHr();
  const items = useCeoRequests();
  const all = useMemo(
    () =>
      items.map((it) => {
        const e = empOf(hr.emp, it.emp);
        return toRequest(it, e?.name ?? it.emp, e ? hrPos(e.pos).label : "");
      }),
    [items, hr.emp],
  );
  /* CEO เห็นแท็บครบทุกประเภท · แก้ชั่วโมงโอทีไม่ได้ (fixedOt) */
  return <ApprovalsBoard all={all} tabs={TABS} findId={openId} openId={openId} fixedOt />;
}

// ─── ยอดเงินเดือนรออนุมัติ ────────────────────────────────────────

/*
 * ยอดเงินเดือนรออนุมัติ
 *
 * ⚠️ ห้ามคิดยอดเอง และห้ามเก็บยอดของตัวเอง (ผู้ใช้กำหนด 23 ก.ย. 2569)
 * ยอดที่แสดงคือผลการคำนวณของรอบตัวเดียวกับหน้า /hr/payroll อ่านผ่าน usePayrollSumFn
 * ถ้าอ่านจากยอดที่ฝ่ายบุคคลส่งมา CEO จะอนุมัติเลขหนึ่งแล้วจ่ายอีกเลขหนึ่ง = การอนุมัติไม่มีความหมาย
 * ยอดที่บันทึกไว้ตอนส่งใช้ตรวจอย่างเดียวว่าตัวเลขขยับหลังส่งหรือยัง ขยับเมื่อไรการอนุมัติเป็นโมฆะ
 * (usePayrollVoidWatch ล้างให้เอง แถวนั้นจะหายไปจากคิวจนกว่าฝ่ายบุคคลจะส่งใหม่)
 *
 * ยอดก้อนนี้ใหญ่ที่สุดที่ CEO เซ็นในเดือนหนึ่ง จึงไม่ใช่การกดปุ่มเดียวเหมือนใบลา/โอที
 *   ดูรายชื่อ — กางบรรทัดรายคนของรอบ (sum.lines ชุดเดียวกับ /hr/payroll) ก่อนเซ็น
 *   ยืนยัน   — กล่องยืนยันบอกรอบ กลุ่ม จำนวนคน และยอด แล้วจึงบันทึก
 *   ตีกลับ   — อยู่คนละแถวและห่างจากปุ่มอนุมัติ นิ้วที่พลาดจะได้ไม่ไปโดน
 */
function PayrollStrip() {
  const hr = useHr();
  const sumOf = usePayrollSumFn();
  usePayrollVoidWatch();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [warn, setWarn] = useState(false);
  /* แถวที่กางรายชื่อไว้ — เซ็นยอดก้อนใหญ่ที่สุดของเดือนต้องเห็นก่อนว่าใครได้เท่าไร */
  const [listing, setListing] = useState<string | null>(null);
  /* แถวที่กำลังยืนยันก่อนอนุมัติ — กดปุ่มเดียวแล้วเซ็นเลยไม่ได้ */
  const [confirming, setConfirming] = useState<string | null>(null);

  const waiting = Object.entries(hr.payApprove)
    .filter(([, a]) => a.status === "waiting")
    .map(([key, a]) => {
      const [month, group] = key.split("|") as [string, PayGroup];
      /* ตัวเลขที่ CEO เห็นและกดอนุมัติ = ผลคำนวณของรอบ ณ ตอนนี้ */
      const sum = sumOf(month, group);
      return { key, month, group, a, sum };
    })
    /* รอบเก่าก่อน · ในรอบเดียวกันรายเดือนก่อนรายวัน (ต้นแบบ) */
    .sort((x, y) => x.month.localeCompare(y.month) || (x.group === "month" ? -1 : 1));

  /* เมนูย่อย "ยอดเงินเดือน" มีแค่ส่วนนี้ — ว่างต้องบอกว่าว่าง ไม่ใช่หน้าโล่ง (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  if (waiting.length === 0)
    return (
      <section className="glass rounded-[14px] px-5 py-10 text-center text-[13px] text-muted-foreground">
        ไม่มียอดเงินเดือนรออนุมัติ
      </section>
    );

  return (
    <section className="glass rounded-[14px]">
      <h2 className="px-5 pt-[15px] pb-2 text-[15px] font-bold">
        ยอดเงินเดือนรออนุมัติ <b className="ml-1 text-primary">{waiting.length}</b>
      </h2>
      {waiting.map(({ key, month, group, a, sum }) => (
        <div key={key} className="border-t border-border px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-3.5">
            <div className="min-w-0 flex-1 sm:min-w-[240px]">
              <b className="block text-[14px] font-semibold">
                รอบ {thaiMonth(month)} · {GROUP_LABEL[group]}
              </b>
              <p className="mt-0.5 text-[13px]">
                {sum.n} คน · ยอดจ่ายสุทธิ {baht(sum.net)} บาท · นำส่งประกันสังคม {baht(sum.ss * 2)} บาท
              </p>
              {/* ตัวเลขนี้คิดเมื่อไร ต้องอ่านออกจากหน้าจอ ไม่ใช่เดาว่าเป็นของวันนี้ */}
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                คำนวณเมื่อ {thaiStamp(a.sentAt ?? "")} · ฝ่ายบุคคลส่งมา
                {a.sentBy && ` โดย ${empOf(hr.emp, a.sentBy)?.name ?? a.sentBy}`}
              </p>
            </div>
            {rejecting !== key && (
              <div className="flex flex-none gap-2 max-sm:w-full">
                <button
                  type="button"
                  className="btn glass-thin max-sm:!h-12 max-sm:flex-1 max-sm:justify-center"
                  aria-expanded={listing === key}
                  onClick={() => setListing(listing === key ? null : key)}
                >
                  {listing === key ? "ซ่อนรายชื่อ" : `ดูรายชื่อ ${sum.n} คน`}
                </button>
                <button
                  type="button"
                  className="btn solid btn-solid max-sm:!h-12 max-sm:flex-1 max-sm:justify-center"
                  onClick={() => setConfirming(key)}
                >
                  อนุมัติยอดนี้
                </button>
              </div>
            )}
          </div>

          {/* รายชื่อรายคนของรอบนี้ — บรรทัดชุดเดียวกับหน้า /hr/payroll (sum.lines) ไม่ได้คิดใหม่
              ยอดรวมท้ายตารางจึงตรงกับยอดที่กดอนุมัติเสมอ ถ้าไม่ตรงคือคนละชุดข้อมูล */}
          {listing === key && rejecting !== key && (
            <div className="mt-3 overflow-hidden rounded-[12px] border border-border">
              <ul className="divide-y divide-border text-[12.5px]">
                {sum.lines.map((l) => (
                  <li key={l.id} className="flex items-baseline gap-3 px-3.5 py-2">
                    <span className="min-w-0 flex-1">
                      <b className="block truncate font-semibold">{l.name}</b>
                      <em className="text-[11.5px] text-muted-foreground not-italic">{hrPos(l.pos).label}</em>
                    </span>
                    <span className="num flex-none font-semibold">{baht(l.net)}</span>
                  </li>
                ))}
              </ul>
              <p className="flex items-baseline gap-3 border-t border-border bg-muted px-3.5 py-2 text-[12.5px]">
                <b className="min-w-0 flex-1 font-semibold">รวม {sum.n} คน</b>
                <b className="num flex-none font-bold">{baht(sum.net)} บาท</b>
              </p>
            </div>
          )}
          {rejecting !== key && (
            /* ตีกลับอยู่คนละแถวและห่างจากปุ่มอนุมัติ (mt-8 + เส้นคั่น = ราว 44px)
               นิ้วที่พลาดจากปุ่มอนุมัติบนมือถือจึงไปไม่ถึง — สองปุ่มนี้เคยห่างกัน 8px */
            <div className="mt-8 border-t border-border pt-3">
              <button
                type="button"
                className="btn glass-thin max-sm:!h-12 max-sm:w-full max-sm:justify-center"
                onClick={() => {
                  setRejecting(key);
                  setListing(null);
                  setWhy("");
                  setWarn(false);
                }}
              >
                ตีกลับ
              </button>
            </div>
          )}
          {rejecting === key && (
            /* ตีกลับต้องมีเหตุผล ฝ่ายบุคคลเห็นบนป้ายสถานะแล้วแก้ไขส่งใหม่ */
            <div className="mt-3 flex flex-wrap items-center gap-2 max-sm:grid max-sm:grid-cols-2">
              <input
                autoFocus
                value={why}
                onChange={(e) => {
                  setWhy(e.target.value);
                  if (e.target.value.trim()) setWarn(false);
                }}
                placeholder="เหตุผลที่ตีกลับ"
                aria-label="เหตุผลที่ตีกลับ"
                className="field-control h-9 min-w-[220px] flex-1 rounded-[10px] px-3 text-[13px] max-sm:col-span-2 max-sm:!h-11 max-sm:min-w-0 max-sm:!text-[16px]"
              />
              <button
                type="button"
                className="btn glass-thin max-sm:!h-12 max-sm:justify-center"
                onClick={() => setRejecting(null)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn solid btn-solid max-sm:!h-12 max-sm:justify-center"
                onClick={() => {
                  if (!why.trim()) return setWarn(true);
                  decidePayroll(month, group, false, why.trim(), bkkStamp());
                  setRejecting(null);
                }}
              >
                ส่งตีกลับ
              </button>
              {warn && <p className="w-full text-[12.5px] text-destructive max-sm:col-span-2">ใส่เหตุผลก่อนส่ง</p>}
            </div>
          )}
        </div>
      ))}

      {/* ขั้นยืนยันก่อนเซ็น — บอกให้ครบว่ากำลังอนุมัติรอบไหน กลุ่มไหน กี่คน ยอดเท่าไร
          ยอดในกล่องนี้คือตัวเดียวกับที่ส่งเข้า decidePayroll ไม่ได้คิดใหม่อีกชุด */}
      {(() => {
        const w = waiting.find((x) => x.key === confirming);
        if (!w) return null;
        return (
          <ConfirmDialog
            open
            title="อนุมัติยอดเงินเดือน"
            description={`รอบ ${thaiMonth(w.month)} · ${GROUP_LABEL[w.group]} · ${w.sum.n} คน`}
            detail={
              <>
                <b className="num block text-[17px] font-bold">{baht(w.sum.net)} บาท</b>
                <span className="block text-[12.5px] text-muted-foreground">
                  ยอดจ่ายสุทธิ · นำส่งประกันสังคม {baht(w.sum.ss * 2)} บาท
                </span>
                <span className="mt-1 block text-[12.5px] text-muted-foreground">
                  อนุมัติแล้วฝ่ายบุคคลปิดรอบและจ่ายตามยอดนี้
                </span>
              </>
            }
            confirmLabel="อนุมัติยอดนี้"
            onCancel={() => setConfirming(null)}
            /* บันทึกเลขที่เห็นบนจอไปกับการอนุมัติ ขยับเมื่อไรจะได้รู้ว่าขยับจากอะไร */
            onConfirm={() => {
              decidePayroll(w.month, w.group, true, "", bkkStamp(), "CEO", {
                people: w.sum.n,
                net: w.sum.net,
                ss: w.sum.ss,
              });
              setConfirming(null);
              setListing(null);
            }}
          />
        );
      })()}
    </section>
  );
}
