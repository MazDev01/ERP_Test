"use client";

/*
 * คำขออนุมัติของผู้บริหาร (ตามต้นแบบ dose-erp-maz/ceo-approvals.html)
 *
 * ยอดเงินเดือนรออนุมัติ — CEO อนุมัติยอดก่อนฝ่ายบุคคลปิดรอบ กลับมาใช้ (ผู้ใช้สั่ง 19 ต.ค. 2569)
 *   ขึ้นเป็นกล่องบนสุดของหน้านี้เฉพาะตอนมีรอบรออยู่ (ไม่มีเมนูย่อย ?k=pay — เมนูอยู่ที่แถบข้างอย่างเดียว)
 *
 * คำขอของพนักงาน (ลา โอที ใบเบิก) — หน้าตาและการทำงานเดียวกับหน้าคำขออนุมัติของ GM (ผู้ใช้สั่ง 5 ต.ค. 2569)
 *    ใช้ ApprovalsBoard ตัวเดียวกับ /approvals ไม่ได้ทำตารางแยก (เดิมเป็นห้องแชทแยกตามพนักงาน)
 *    ใครส่งอะไรมาถึงผู้บริหาร กำหนดที่สายอนุมัติใน role.ts (approvesFor) หน้านี้ไม่ตัดสินเอง
 *    คนที่ล็อกอินได้อ่านจากใบลา/โอที/ใบเบิกของบทบาทนั้น · ทีมงานที่ยังไม่มีบัญชีอ่านจาก emp-requests.ts
 *    CEO แก้ชั่วโมงโอทีไม่ได้ — อนุมัติเท่าที่ขอเสมอ (ApprovalsBoard fixedOt)
 *
 * ?req=<id> จากแดชบอร์ดหรือ LINE เปิดรายละเอียดของใบนั้น
 *
 * ลิงก์เก่า ?k=pay / ?k=time เปิดตารางลาและโอทีเหมือนกัน (ผู้ใช้สั่ง 13 ต.ค. 2569)
 */

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CLAIM_TYPE_LABEL, claimApproveBlock, claimTotal, isFuelType, keyOf } from "@/lib/expense-data";
import { useAllClaims } from "@/lib/expense-store";
import { baht, bkkStamp, thaiDate, thaiMonth, thaiStamp } from "@/lib/format";
import { ROLE_EMPLOYEE, empOf, hrPos } from "@/lib/hr-data";
import { empReqLeaveHours, useEmpRequests } from "@/lib/emp-requests";
import { lockedUntil, useHr } from "@/lib/hr-store";
import { decideHolidays, holidayDiff, useSystemSettings } from "@/lib/system-settings";
import { logChange } from "@/lib/admin-log";
import { currentProfile } from "@/lib/profile-data";
import { ConfirmDialog } from "./confirm-dialog";
import { HolidayDiffList, describeHolidays } from "./admin-holidays-page";
import { quotaAfterLeave, quotaAfterUsed, useAllLeave } from "@/lib/leave-store";
import { useAllOt } from "@/lib/ot-store";
import { approvesFor, useApprovalRoute, type Role } from "@/lib/role";
import { formatMinutesOfDay, minutesOfDay } from "@/lib/work-schedule";
import { ApprovalsBoard, TABS, leaveWhen, type ApprovalRequest } from "./approvals-page";
import { fmtLeaveHours, leaveHoursOf } from "@/lib/leave-data";
import { type OtReq } from "./ot-actual-fields";
import { displayName } from "@/lib/emp-name";
import { PayrollWaitingList } from "./ceo-pay-approve";

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
  /** วันที่ลา + ช่วงเวลาของลาไม่เต็มวัน — แถว "วันที่" ในกล่องรายละเอียด (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  when?: string;
  note: string;
  reason: string;
  hours?: number;
  /** ชั่วโมงโอทีที่อนุมัติจริง — ไม่มี = เท่าที่ขอ */
  approvedHours?: number | null;
  /** ช่วงเวลาที่ขอ ใช้เทียบเวลาตอกบัตรจริงตอนตัดสิน — เฉพาะโอที */
  ot?: OtReq;
  /** เหตุผลที่อนุมัติไม่ได้ — ใบเบิกที่มีค่าคอมมิชชั่น/อินเซนทีฟ (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  block?: string;
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
            /* จำนวนการลาเป็นชั่วโมง (ผู้ใช้สั่ง 19 ต.ค. 2569) */
            title: `${v.type} ${fmtLeaveHours(leaveHoursOf(v))}`,
            label: v.type,
            big: fmtLeaveHours(leaveHoursOf(v)),
            lines: [range],
            when: leaveWhen(v.date, v.toDate, v.half || v.hours != null ? v.startMin : undefined, v.half || v.hours != null ? v.endMin : undefined),
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
          /* ใบที่ผู้ยื่นยกเลิกเองไม่เข้าคิวอนุมัติ (ผู้ใช้สั่ง 9 ต.ค. 2569) */
          if (v.status === "ร่าง" || v.status === "ยกเลิก") continue;
          const total = claimTotal(v);
          out.push({
            kind,
            emp,
            src: "role",
            role: from,
            id: `${from}-${keyOf(v)}`,
            key: keyOf(v),
            no: v.no ?? "",
            status: statusOf(v.status),
            at: v.submittedAt || `${v.month}-01 00:00`,
            hasTime: Boolean(v.submittedAt),
            block: v.status === "รออนุมัติ" ? claimApproveBlock(v) : "",
            title: `เบิกค่าใช้จ่าย ${baht(total)} บาท`,
            label: "เบิกค่าใช้จ่าย",
            big: `${baht(total)} บาท`,
            lines: [
              `รอบ ${thaiMonth(v.month)}`,
              /* หนึ่งใบหนึ่งประเภท — บอกประเภทของใบ ค่าน้ำมันบอกจำนวนเที่ยวและทะเบียน (ผู้ใช้สั่ง 29 ต.ค. 2569) */
              isFuelType(v.type)
                ? `${CLAIM_TYPE_LABEL[v.type]} ${v.fuel.length} เที่ยว${v.plate ? ` · ทะเบียน ${v.plate}` : ""}`
                : `${CLAIM_TYPE_LABEL[v.type]} ${(v.other ?? []).length} รายการ`,
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
          title: `${type} ${fmtLeaveHours(empReqLeaveHours(r))}`,
          label: type,
          big: fmtLeaveHours(empReqLeaveHours(r)),
          lines: [range],
          when: leaveWhen(
            r.from ?? "",
            r.toDate ?? r.from ?? "",
            r.span === "half" && r.start ? minutesOfDay(r.start) : undefined,
            r.span === "half" && r.end ? minutesOfDay(r.end) : undefined,
          ),
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
function toRequest(it: Item, name: string, full: string, sub: string): ApprovalRequest {
  const topic = it.kind === "ot" ? "ทำงานล่วงเวลา" : it.kind === "expense" ? "เบิกค่าใช้จ่าย" : it.label;
  return {
    kind: it.kind,
    src: it.src,
    role: it.role,
    as: "ceo",
    name,
    full,
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
    when: it.when,
    note: it.note,
    block: it.block,
  };
}

export function CeoApprovalsPage() {
  const params = useSearchParams();
  const reqId = params.get("req") ?? "";

  return (
    <div className="space-y-4">
      <div className="bar">
        <div>
          {/* ต้นแบบมีวันที่ครั้งเดียวที่หัวหน้า (ceo-approvals.html · tk-head) — แถบบนของแอปแสดงให้แล้ว ไม่ซ้ำอีกที่นี่ */}
          <h1>คำขอลาและโอที</h1>
        </div>
      </div>

      {/* วันหยุดบริษัทที่ฝ่ายบุคคลส่งมา — ขึ้นเฉพาะตอนมีคำขอรออยู่ (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
      <HolidayStrip />

      {/* ยอดเงินเดือนรออนุมัติ — ขึ้นเฉพาะตอนฝ่ายบุคคลส่งมา (ผู้ใช้สั่ง 19 ต.ค. 2569) */}
      <PayrollWaitingList />

      <TimeRequests openId={reqId} />
    </div>
  );
}

/*
 * วันหยุดรออนุมัติ (ผู้ใช้สั่ง 13 ต.ค. 2569 — หน้าตาแบบยอดเงินเดือนรออนุมัติเดิม)
 * แสดงรายการที่เปลี่ยนเทียบกับชุดที่ใช้อยู่ตอนนี้ · อนุมัติ (มีกล่องยืนยัน) / ตีกลับ (ต้องมีเหตุผล อยู่คนละแถว)
 * อนุมัติแล้วชุดที่ส่งมาเป็นวันหยุดที่ทุกหน้าใช้ — วันในรอบเงินเดือนที่ปิดแล้วคงค่าเดิม (decideHolidays)
 */
function HolidayStrip() {
  const sys = useSystemSettings();
  const hr = useHr();
  const req = sys.holidayReq;
  const [rejecting, setRejecting] = useState(false);
  const [why, setWhy] = useState("");
  const [warn, setWarn] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (!req || req.status !== "pending") return null;
  const diff = holidayDiff(sys.holidays, req.draft);
  const n = (k: "add" | "edit" | "del") => diff.filter((x) => x.kind === k).length;
  const summary = [
    n("add") && `เพิ่ม ${n("add")} วัน`,
    n("edit") && `แก้ชื่อ ${n("edit")} วัน`,
    n("del") && `ลบ ${n("del")} วัน`,
  ]
    .filter(Boolean)
    .join(" · ");

  function approve() {
    if (!req) return;
    const lines = describeHolidays(sys.holidays, req.draft);
    decideHolidays(true, "", currentProfile().name, bkkStamp(), lockedUntil(hr));
    logChange("วันหยุดบริษัท", `Chief Executive Officer อนุมัติ · ${lines.join(" · ") || "ไม่มีวันที่เปลี่ยน"}`);
    setConfirming(false);
  }

  return (
    <section className="glass rounded-[14px]">
      <h2 className="px-5 pt-[15px] pb-2 text-[15px] font-bold">
        วันหยุดรออนุมัติ <b className="ml-1 text-primary">{diff.length}</b>
      </h2>
      <div className="border-t border-border px-5 py-3.5">
        <b className="block text-[14px] font-semibold">วันหยุดบริษัท · {summary || "ไม่มีวันที่เปลี่ยน"}</b>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          ส่งเมื่อ {thaiStamp(req.sentAt)} · ฝ่ายบุคคลส่งมาโดย {req.sentBy} · ยังไม่มีผลจนกว่าจะอนุมัติ
        </p>
        <HolidayDiffList diff={diff} />
        {!rejecting && (
          <div className="mt-3 flex gap-2 max-sm:w-full">
            <button
              type="button"
              className="btn solid btn-solid max-sm:!h-12 max-sm:flex-1 max-sm:justify-center"
              onClick={() => setConfirming(true)}
            >
              อนุมัติวันหยุดชุดนี้
            </button>
          </div>
        )}
        {!rejecting && (
          /* ตีกลับอยู่คนละแถวและห่างจากปุ่มอนุมัติ แบบยอดเงินเดือนเดิม */
          <div className="mt-8 border-t border-border pt-3">
            <button
              type="button"
              className="btn glass-thin max-sm:!h-12 max-sm:w-full max-sm:justify-center"
              onClick={() => {
                setRejecting(true);
                setWhy("");
                setWarn(false);
              }}
            >
              ตีกลับ
            </button>
          </div>
        )}
        {rejecting && (
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
              onClick={() => setRejecting(false)}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn solid btn-solid max-sm:!h-12 max-sm:justify-center"
              onClick={() => {
                if (!why.trim()) return setWarn(true);
                decideHolidays(false, why.trim(), currentProfile().name, bkkStamp());
                logChange("วันหยุดบริษัท", `Chief Executive Officer ตีกลับ · เหตุผล: ${why.trim()}`);
                setRejecting(false);
              }}
            >
              ส่งตีกลับ
            </button>
            {warn && <p className="w-full text-[12.5px] text-destructive max-sm:col-span-2">ใส่เหตุผลก่อนส่ง</p>}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        title="อนุมัติวันหยุดบริษัท"
        description={summary || "ไม่มีวันที่เปลี่ยน"}
        detail={
          <span className="block text-[12.5px] text-muted-foreground">
            อนุมัติแล้วมีผลทันทีกับการนับวันลา อัตราโอทีวันหยุด ตารางงาน และการลงเวลา
            · วันในรอบเงินเดือนที่ปิดแล้วไม่เปลี่ยน
          </span>
        }
        confirmLabel="อนุมัติ"
        onCancel={() => setConfirming(false)}
        onConfirm={approve}
      />
    </section>
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
        return toRequest(it, e ? displayName(e) : it.emp, e?.name ?? it.emp, e ? hrPos(e.pos).label : "");
      }),
    [items, hr.emp],
  );
  /* CEO เห็นแท็บครบทุกประเภท · แก้ชั่วโมงโอทีไม่ได้ (fixedOt) */
  return <ApprovalsBoard all={all} tabs={TABS} findId={openId} openId={openId} fixedOt />;
}
