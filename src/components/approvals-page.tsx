"use client";

/*
 * คำขออนุมัติ (ตามต้นแบบ pm-approvals.html) — ใช้ร่วมกันทั้งหัวหน้าสายงานและฝ่ายบัญชี
 *
 * ใครอนุมัติอะไรของใคร กำหนดไว้ที่เดียวใน role.ts (approvesFor)
 * หน้านี้แค่หยิบคำขอที่ตรงกับหน้าที่ของตัวเองมาแสดง ไม่ตัดสินใจเรื่องสายอนุมัติเอง
 *
 * รายการกลาง คำขอทุกประเภทอยู่หน้าเดียว กรองด้วยประเภท (แท็บ) สถานะ และคำค้น
 * เรียงเก่าสุดขึ้นก่อนเพราะรอมานานกว่า
 *
 * ตาราง 4 คอลัมน์ ผู้ขอ · คำขอ · วันที่ส่ง · ส่งเมื่อ — กดที่ไหนในแถวก็เปิดรายละเอียด (ไม่มีคอลัมน์ปุ่ม)
 * การตัดสินอยู่ในกล่องเดียว: อนุมัติ = บันทึกทันที · ไม่อนุมัติ = กดครั้งแรกเปิดช่องเหตุผล กดอีกครั้งถึงบันทึก
 * คำขอที่ตัดสินแล้วเปิดดูย้อนหลังได้อย่างเดียว ไม่มีปุ่มตัดสิน
 *
 * PM / GM เห็นคำขอของทีมงานที่ยังไม่มีบัญชีเข้าระบบด้วย (emp-requests ที่ to ตรงกับบทบาท)
 * ชื่อและตำแหน่งของผู้ขออ่านจากทะเบียนฝ่ายบุคคล
 *
 * ⚠️ คิวเป็นของ "คน" ไม่ใช่ของบทบาทที่เลือกอยู่ (ผู้ใช้สั่ง 23 ก.ย. 2569)
 * บริษัทมี 18 คน คนหนึ่งควบหลายบทบาทได้ (เช่น อรอนงค์ E12 เป็นทั้งบัญชีและฝ่ายบุคคล)
 * ถ้าอ่านจากบทบาทที่เลือกอยู่บทบาทเดียว ใบที่รอเขาในอีกบทบาทจะหายไปทั้งที่มีคนรออยู่
 * จึงรวมหน้าที่อนุมัติของทุกบทบาทที่บัญชีนี้ถือ (useMyRoles) แล้วบอกทุกใบว่ามาถึงเราในฐานะอะไร
 *
 * แท็บตามต้นแบบของแต่ละบทบาท (22 ก.ย. 2569)
 *   GM (gm-approvals.html) — ทั้งหมด / ลา / โอที · ไม่มีแท็บค่าใช้จ่าย
 *   PM (pm-approvals.html) — ทั้งหมด / โอที / ค่าใช้จ่าย · ไม่มีแท็บลา (GM อนุมัติการลา PM เห็นแค่วันลาในหน้าวางแผน)
 *   แท็บที่ต้นแบบซ่อน ยังโผล่ถ้าสายอนุมัติส่งคำขอประเภทนั้นมาจริง (ผู้ดูแลระบบย้ายสายได้) — ไม่ให้คำขอตกหล่น
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHydrated } from "@/lib/pwa";
import { lockScroll } from "@/lib/scroll-lock";
import { decideEmpRequest, useEmpRequests, type EmpRequest } from "@/lib/emp-requests";
import {
  CLAIM_TYPE_LABEL,
  VEHICLE_LABEL,
  claimApproveBlock,
  claimTotal,
  fuelAmount,
  fuelRowsOf,
  isFuelType,
  keyOf,
  vehiclesIn,
  type ExpenseClaim,
  type Vehicle,
} from "@/lib/expense-data";
import { HR_LEAVE_LABEL, hrPos, type InternLeave } from "@/lib/hr-data";
import { decideInternLeave, useHr } from "@/lib/hr-store";
import { approveClaim, rejectClaim, useAllClaims } from "@/lib/expense-store";
import { baht, bkkStamp, daysBetween, thaiDate, thaiMonth, thaiStamp, todayIso } from "@/lib/format";
import { fmtLeave, fmtLeaveHours, leaveHoursOf, type LeaveRecord } from "@/lib/leave-data";
import { empReqLeaveHours } from "@/lib/emp-requests";
import {
  approveLeave,
  awaySpans,
  othersAway,
  quotaAfterLeave,
  quotaAfterUsed,
  rejectLeave,
  useAllLeave,
  type AwaySpan,
} from "@/lib/leave-store";
import { USERS } from "@/lib/mock-data";
import { type OtRecord } from "@/lib/ot-data";
import { approveOt, rejectOt, useAllOt } from "@/lib/ot-store";
import { approvesFor, roleLabel, useApprovalRoute, type Role } from "@/lib/role";
import { useMyRoles } from "@/lib/hr-link";
import { useSearchParams } from "next/navigation";
import { formatMinutesOfDay, minutesOfDay } from "@/lib/work-schedule";
import { OT_MIN_HOURS, OtActualFields, useOtDecision, type OtReq } from "./ot-actual-fields";
import { SearchBox } from "./sales-ui";
import { CalendarIcon, CheckIcon, ClockIcon, CloseIcon, ReceiptIcon } from "./icons";
import { stackNo } from "@/lib/stack-no";
import { nameOf } from "@/lib/emp-name";

type Kind = "leave" | "ot" | "expense";
type Status = "pending" | "approved" | "rejected";

/** คำขอหนึ่งใบ — ใช้ร่วมกับหน้าคำขออนุมัติของ CEO (ผู้ใช้สั่ง 5 ต.ค. 2569) */
export type ApprovalRequest = Request;

/** คำขอหนึ่งใบ — รวมสามประเภทให้อยู่ในรูปเดียวกัน */
type Request = {
  kind: Kind;
  /** role = ใบของบทบาทที่ล็อกอินได้ (leave/ot/expense-store) · emp = คำขอของทีมงานตามรหัสพนักงาน
   *  intern = ใบลานักศึกษาฝึกงานในสโตร์ฝ่ายบุคคล (hr.internLeave) — ชุดเดียวกับการ์ดบนแดชบอร์ดฝ่ายบุคคล */
  src: "role" | "emp" | "intern";
  /** บทบาทผู้ยื่น — เฉพาะ src = role */
  role?: Role;
  /** ใบนี้มาถึงเราในฐานะบทบาทไหน — คนหนึ่งควบหลายบทบาทได้ ต้องรู้ว่ากำลังตัดสินในฐานะอะไร */
  as: Role;
  /** ชื่อผู้ยื่น (ชื่อเล่น) และตำแหน่ง */
  name: string;
  /** ชื่อเต็มที่เก็บไว้ — ใช้ค้นหาให้เจอทั้งชื่อเล่นและชื่อจริง (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  full?: string;
  sub: string;
  /** id ของใบลา/โอที หรือเดือนของใบเบิก */
  key: string;
  /** รหัสที่ลิงก์ ?req= ของหน้า CEO ใช้ (ใบเบิก = บทบาท-เดือน) — ไม่มีใช้ key (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  ref?: string;
  /** เลขที่เอกสาร (LV-/OT-/EX-) — เอกสารที่ใช้เบิกเงินต้องอ้างอิงได้ */
  no: string;
  status: Status;
  /** เวลาที่ยื่น "yyyy-mm-dd hh:mm" — ใช้เรียงคิว นับวันที่รอ */
  at: string;
  /** หัวข้อคำขอในตาราง — ทำงานล่วงเวลา / ประเภทการลา / ค่าน้ำมัน */
  topic: string;
  /** สรุปหนึ่งบรรทัด — ใช้ค้นหา */
  line: string;
  /** รายการในกล่องรายละเอียด แยกบรรทัด: หัวข้อกับช่วงเวลา / จำนวนรวม / เป็นเงิน */
  lines: string[];
  /** เหตุผลของผู้อนุมัติ — แสดงเมื่อตัดสินแล้ว */
  why: string;
  /** ชั่วโมงที่ขอ — เฉพาะโอที */
  hours?: number;
  /** ชั่วโมงที่อนุมัติจริง — เฉพาะโอทีที่อนุมัติแล้ว (ไม่มี = เท่าที่ขอ) */
  approvedHours?: number | null;
  /** ช่วงเวลาที่ขอ ใช้เทียบกับเวลาตอกบัตรจริงตอนตัดสิน — เฉพาะโอที */
  ot?: OtReq;
  /** สิทธิ์คงเหลือหลังหักใบนี้ — เฉพาะใบลา · ติดลบคือเกินสิทธิ์ (ชุดเดียวกับหน้าของ CEO) */
  quota?: number;
  /** เหตุผลที่ผู้ยื่นเขียนมาเอง — คนละช่องกับเหตุผลของผู้อนุมัติ (why) */
  note?: string;
  /** คนอื่นที่ไม่อยู่ช่วงวันเดียวกัน — เฉพาะใบลา (กล่องรายละเอียดไม่แสดงแล้ว ผู้ใช้สั่ง 19 ต.ค. 2569) */
  away?: { name: string; text: string }[];
  /** วันที่ลา (และช่วงเวลาของลาไม่เต็มวัน) — แถว "วันที่" ในกล่องรายละเอียดของใบลา (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  when?: string;
  /** เหตุผลที่อนุมัติไม่ได้ (เช่น ใบเบิกมีค่าคอมมิชชั่น/อินเซนทีฟ) — ว่าง = อนุมัติได้ · ไม่อนุมัติยังกดได้ (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  block?: string;
};

/** โอทีที่อนุมัติไม่เท่าที่ขอ — คืนชั่วโมงที่อนุมัติ · เท่ากันหรือยังไม่อนุมัติคืน null */
function cutHours(r: Request) {
  if (r.kind !== "ot" || r.status !== "approved" || r.approvedHours == null) return null;
  return r.approvedHours !== r.hours ? r.approvedHours : null;
}

const KIND: Record<Kind, string> = {
  ot: "ขอโอที",
  leave: "การลา",
  expense: "เบิกค่าใช้จ่าย",
};

type Tab = { key: "all" | Kind; label: string };

const VIEWS: { key: "req" | "hist"; label: string }[] = [
  { key: "req", label: "คำขอ" },
  { key: "hist", label: "ประวัติ" },
];

export const TABS: Tab[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "leave", label: "ลา" },
  { key: "ot", label: "โอที" },
  { key: "expense", label: "ค่าใช้จ่าย" },
];

/** แท็บประเภทที่ต้นแบบแสดงของแต่ละบทบาท — ไม่ระบุคือแสดงครบทุกประเภท */
const ROLE_TABS: Partial<Record<Role, Kind[]>> = {
  gm: ["leave", "ot", "expense"], /* รับคิวโอทีและใบเบิกของ PM เดิมมาด้วย (22 ก.ย. 2569) */
  pm: ["ot", "expense"],
  /* ฝ่ายบุคคลรับแค่ใบลาของเด็กฝึกงาน — เด็กฝึกงานไม่มีเมนูโอทีและเบิกค่าใช้จ่าย (ผู้ใช้สั่ง 6 ต.ค. 2569) */
  hr: ["leave"],
};

/* แท็บคำขอ = รออนุมัติเท่านั้น · ตัวกรองสถานะใช้ในแท็บประวัติ (ผู้ใช้สั่ง 29 ต.ค. 2569) */
const STATUS_OPTS: { value: Status | ""; label: string }[] = [
  { value: "approved", label: "อนุมัติแล้ว" },
  { value: "rejected", label: "ไม่อนุมัติ" },
  { value: "", label: "ทุกสถานะ" },
];

/** ตัวเลขวัน — จำนวนเต็มไม่ต้องมีทศนิยม (แบบเดียวกับหน้าของ CEO) */
const num2 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** รอตั้งแต่กี่วันขึ้นไปถึงเป็นตัวแดง */
const WAIT_HOT = 3;

export function ApprovalsPage() {
  /* ทุกบทบาทที่บัญชีนี้ถือ บทบาทที่เลือกอยู่มาก่อนเสมอ — แท็บและคิวจึงเรียงตามบทบาทที่กำลังใช้งาน */
  const myRoles = useMyRoles();
  const leaves = useAllLeave();
  const ots = useAllOt();
  const claims = useAllClaims();
  const extra = useEmpRequests();
  const hr = useHr();
  /* ลิงก์จาก LINE พามาที่แท็บและรายการที่ต้องตัดสิน — /approvals?kind=leave&find=LV-2569-0123 */
  const params = useSearchParams();
  const findId = params.get("find") ?? "";

  /** คำขอประเภทไหนของใครบ้างที่เราต้องอนุมัติ — รวมทุกบทบาทที่ถืออยู่ · ว่างแปลว่าไม่ได้เป็นผู้อนุมัติของใคร */
  const route = useApprovalRoute();
  const duties = useMemo(() => {
    const out: { kind: "leave" | "ot" | "expense"; from: Role; as: Role }[] = [];
    const seen = new Set<string>();
    for (const r of myRoles)
      for (const d of approvesFor(r, route)) {
        /* สายอนุมัติเดียวกันอาจตกมาที่สองบทบาทของคนเดียวกัน — ใบเดียวกันต้องขึ้นใบเดียว */
        if (seen.has(`${d.kind}|${d.from}`)) continue;
        seen.add(`${d.kind}|${d.from}`);
        out.push({ ...d, as: r });
      }
    return out;
  }, [myRoles, route]);

  const all = useMemo(() => {
    const out: Request[] = [];
    /* ใครไม่อยู่วันไหนบ้างทั้งบริษัท — ใบลาของทุกบทบาท บวกคำขอลาของทีมงานที่ยังไม่มีบัญชี
       ถ้าเอาแค่ฝั่งเดียว ผู้อนุมัติจะเห็นครึ่งเดียวแล้วอนุมัติจนไม่เหลือคน */
    const spans: AwaySpan[] = [
      ...awaySpans(leaves),
      ...extra
        .filter((r) => r.kind === "leave" && r.status !== "rejected")
        .map((r) => ({
          id: r.id,
          who: hr.emp.find((x) => x.id === r.emp)?.name ?? r.emp,
          type: r.leaveType ?? "การลา",
          date: r.from ?? "",
          toDate: r.toDate ?? r.from ?? "",
          pending: r.status === "pending",
        })),
    ];
    for (const { kind, from, as } of duties) {
      /* ใบลาที่ยกเลิกแล้วไม่เข้าคิวอนุมัติ แต่ยังอยู่ในระบบเป็นประวัติ */
      if (kind === "leave")
        for (const v of leaves[from])
          if (v.status !== "ยกเลิก") out.push(fromLeave(from, v, as, leaves[from], spans));
      if (kind === "ot")
        for (const v of ots[from]) if (v.status !== "ยกเลิก") out.push(fromOt(from, v, as));
      if (kind === "expense")
        /* ใบที่ผู้ยื่นยกเลิกเองไม่เข้าคิวอนุมัติ (ผู้ใช้สั่ง 9 ต.ค. 2569) */
        for (const v of claims[from]) if (v.status !== "ร่าง" && v.status !== "ยกเลิก") out.push(fromClaim(from, v, as));
    }
    /* คิวของ PM / GM — คำขอของทีมงานตามรหัสพนักงาน (ต้นแบบ PM_APPROVALS · gm-approvals) */
    for (const as of myRoles) {
      if (as !== "pm" && as !== "gm") continue;
      for (const r of extra) {
        if (r.to !== as) continue;
        const e = hr.emp.find((x) => x.id === r.emp);
        out.push(fromEmp(r, e?.name ?? r.emp, e ? hrPos(e.pos).label : "", as, spans));
      }
    }
    /* ฝ่ายบุคคล — ใบลานักศึกษาฝึกงานที่อยู่ในสโตร์ฝ่ายบุคคล (ชุดเดียวกับการ์ดบนแดชบอร์ด · ผู้ใช้สั่ง 8 ต.ค. 2569)
       ตัดสินที่นี่หรือที่การ์ดก็ลงฟังก์ชันเดียวกัน (decideInternLeave) ผลจึงตรงกันทั้งสองที่ */
    if (myRoles.includes("hr"))
      for (const r of hr.internLeave) {
        const e = hr.emp.find((x) => x.id === r.emp);
        /* ใบที่มาถึงฝ่ายบุคคลมีแต่ของนักศึกษาฝึกงาน — ใต้ชื่อขึ้นว่าฝึกงานเหมือนกันทุกใบ ไม่ใช่ตำแหน่งงาน (ผู้ใช้สั่ง 8 ต.ค. 2569) */
        out.push(fromIntern(r, e?.name ?? r.emp, "นักศึกษาฝึกงาน"));
      }
    return out.sort((a, b) => a.at.localeCompare(b.at));
  }, [duties, leaves, ots, claims, extra, hr.emp, hr.internLeave, myRoles]);

  if (duties.length === 0 && all.length === 0) {
    return (
      <div className="space-y-4">
        <Head />
        <section className="panel glass px-5 py-12 text-center text-[13.5px] text-muted-foreground">
          บทบาท{myRoles.map(roleLabel).join(" และ ")}ไม่ได้เป็นผู้อนุมัติของใคร
        </section>
      </div>
    );
  }

  /* แท็บที่แสดง — ตามต้นแบบของบทบาท บวกประเภทที่มีคำขอเข้ามาจริง */
  /* ควบหลายบทบาทเท่านั้นที่ต้องเห็นว่าใบไหนมาถึงในฐานะอะไร — คนบทบาทเดียวไม่มีอะไรให้สับสน */
  const multi = myRoles.length > 1;
  /* คนที่ควบหลายบทบาทเห็นแท็บของทุกบทบาทรวมกัน ไม่งั้นใบของอีกบทบาทจะไม่มีแท็บให้เปิด */
  const tabs = TABS.filter((t) => {
    if (t.key === "all") return true;
    const k = t.key;
    /* บทบาทที่ไม่มีแท็บตามต้นแบบ เห็นเฉพาะประเภทที่สายอนุมัติส่งมาถึงจริง
       เช่น ฝ่ายบุคคลรับแค่ใบลาของเด็กฝึกงาน จึงไม่มีแท็บโอทีและค่าใช้จ่าย (ผู้ใช้สั่ง 6 ต.ค. 2569) */
    return (
      myRoles.some((r) =>
        ROLE_TABS[r] ? ROLE_TABS[r]!.includes(k) : duties.some((d) => d.as === r && d.kind === k),
      ) || all.some((r) => r.kind === k)
    );
  }).filter((t, _i, list) => t.key !== "all" || list.length > 2);
  /* มีประเภทเดียว (เช่น ฝ่ายบุคคลมีแค่ลา) ไม่ต้องมีแท็บ "ทั้งหมด" ซ้ำกับแท็บนั้น (ผู้ใช้สั่ง 8 ต.ค. 2569) */

  return (
    <div className="space-y-4">
      <Head />
      <ApprovalsBoard all={all} tabs={tabs} multi={multi} findId={findId} />
    </div>
  );
}

/**
 * แถบแท็บ ตัวกรอง ตาราง/รายการมือถือ และกล่องรายละเอียด — ใช้ทั้งหน้า /approvals และ /ceo/approvals?k=time
 * (ผู้ใช้สั่ง 5 ต.ค. 2569) หน้าที่เรียกเป็นคนรวบรวมคิวของตัวเองมาให้ (all) ส่วนนี้ไม่รู้ว่าใครเป็นผู้อนุมัติ
 *
 * fixedOt = ผู้ตัดสินแก้ชั่วโมงโอทีไม่ได้ (CEO) — อนุมัติเท่าที่ขอทันที ไม่มีช่องกรอกชั่วโมง
 * openId  = ลิงก์ ?req= — เปิดรายละเอียดของใบนั้นให้เลยเมื่อคิวโหลดเสร็จ
 */
export function ApprovalsBoard({
  all,
  tabs,
  multi = false,
  findId = "",
  openId = "",
  fixedOt = false,
}: {
  all: Request[];
  tabs: Tab[];
  multi?: boolean;
  findId?: string;
  openId?: string;
  fixedOt?: boolean;
}) {
  /* ลิงก์จาก LINE พามาที่แท็บที่ต้องตัดสิน — ?kind=leave */
  const params = useSearchParams();
  const wantKind = params.get("kind");
  const [tab, setTab] = useState<"all" | Kind>(
    wantKind === "leave" || wantKind === "ot" || wantKind === "expense" ? wantKind : "all",
  );
  /* แท็บคำขอ / ประวัติ — ประเภท (ลา โอที ค่าใช้จ่าย) เป็นตัวกรองแทนแท็บ (ผู้ใช้สั่ง 29 ต.ค. 2569) */
  const [view, setView] = useState<"req" | "hist">("req");
  const [status, setStatus] = useState<Status | "">("");
  const [q, setQ] = useState("");
  const [viewing, setViewing] = useState<Request | null>(null);
  /* กล่องรายละเอียดเปิดมาเพื่ออะไร — ดูอย่างเดียว · ใส่เหตุผลไม่อนุมัติ · ยืนยันชั่วโมงโอทีก่อนอนุมัติ (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  const [mode, setMode] = useState<"view" | "reject" | "approve">("view");
  const today = todayIso();

  /* ?req= เปิดรายละเอียดของใบนั้นครั้งเดียว — คิวอ่านจาก localStorage จึงรอจนเจอใบก่อน (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  const opened = useRef("");
  useEffect(() => {
    if (!openId || opened.current === openId) return;
    const hit = all.find((r) => sameId(r, openId));
    if (!hit) return;
    opened.current = openId;
    /* ใบที่ตัดสินแล้วต้องเห็นในรายการด้วย — ขยายตัวกรองเป็นทุกสถานะ */
    if (hit.status !== "pending") {
      setView("hist");
      setStatus("");
    }
    setMode("view");
    setViewing(hit);
  }, [openId, all]);

  /* ?kind= ชี้ไปแท็บที่บทบาทนี้ไม่มี — กลับไปแท็บทั้งหมด */
  const cur = tabs.some((t) => t.key === tab) ? tab : (tabs[0]?.key ?? "all");
  /*
   * ลำดับแบบกองซ้อน — นับจากคำขอทั้งหมดก่อนกรองสถานะ/แท็บ/ค้นหา ตามเวลาที่ส่ง ใบล่าสุดเลขมากสุด (ผู้ใช้สั่ง 12 ต.ค. 2569)
   * คิวยังเรียงเก่าสุดขึ้นก่อนตามเดิม เพราะรอมานานกว่า
   */
  const rowKey = (r: Request) => `${r.kind}-${r.src}-${r.role ?? ""}-${r.key}`;
  const noOf = stackNo(all, (r) => r.at, rowKey);
  const inView = (r: Request, v: "req" | "hist") => (v === "req" ? r.status === "pending" : r.status !== "pending");
  const byStatus = all.filter((r) => inView(r, view) && (view === "req" || !status || r.status === status));
  const count = (v: "req" | "hist") => all.filter((r) => inView(r, v) && (cur === "all" || r.kind === cur)).length;
  const term = q.trim().toLowerCase();
  const rows = byStatus.filter(
    (r) =>
      (cur === "all" || r.kind === cur) &&
      (!term || `${r.no} ${r.name} ${r.full ?? ""} ${r.topic} ${r.line}`.toLowerCase().includes(term)),
  );

  /* ปุ่มตัดสินในรายการ — ใช้กติกาเดียวกับกล่องรายละเอียด (ผู้ใช้สั่ง 5 ต.ค. 2569)
     ไม่อนุมัติต้องมีเหตุผล → เปิดกล่องที่ช่องเหตุผล · โอทีที่ต้องเทียบเวลาตอกบัตร → เปิดกล่องให้ยืนยันชั่วโมงก่อน */
  const open = (item: Request, m: "view" | "reject" | "approve" = "view") => {
    setMode(m);
    setViewing(item);
  };
  const quickApprove = (item: Request) => {
    /* CEO แก้ชั่วโมงโอทีไม่ได้ — อนุมัติเท่าที่ขอทันที ไม่ผ่านขั้นยืนยันชั่วโมง (ผู้ใช้สั่ง 5 ต.ค. 2569) */
    if (item.kind === "ot" && fixedOt) return applyDecision(item, true, "", item.hours ?? 0);
    if (item.kind === "ot" && item.ot) return open(item, "approve");
    applyDecision(item, true, "");
  };
  /* ชั่วโมงที่ขอต่ำกว่าขั้นต่ำ — อนุมัติเท่าที่ขอไม่ได้ ต้องไม่อนุมัติ (กติกาเดิมของหน้า CEO) */
  const cannotApprove = (item: Request) =>
    Boolean(item.block) || (fixedOt && item.kind === "ot" && (item.hours ?? 0) < OT_MIN_HOURS);
  const decide = (item: Request, big: boolean) => (
    <>
      <button
        type="button"
        className={`btn solid justify-center !bg-[#be123c] !text-white hover:!bg-[#9f1239] ${big ? "h-10 w-full rounded-[10px]" : "h-[30px] px-3"}`}
        onClick={(e) => {
          e.stopPropagation();
          open(item, "reject");
        }}
      >
        ไม่อนุมัติ
      </button>
      <button
        type="button"
        className={`btn solid justify-center !bg-[#14875A] !text-white hover:!bg-[#0F7049] disabled:opacity-40 ${big ? "h-10 w-full rounded-[10px]" : "h-[30px] px-3"}`}
        disabled={cannotApprove(item)}
        title={
          item.block
            ? item.block
            : cannotApprove(item)
            ? `ชั่วโมงที่ขอต่ำกว่าขั้นต่ำ ${OT_MIN_HOURS.toFixed(2)} ชม. — อนุมัติไม่ได้`
            : item.kind === "ot" && item.ot && !fixedOt
              ? "เปิดรายละเอียดเพื่อยืนยันชั่วโมงโอทีก่อนอนุมัติ"
              : undefined
        }
        onClick={(e) => {
          e.stopPropagation();
          quickApprove(item);
        }}
      >
        อนุมัติ
      </button>
    </>
  );

  return (
    <>
      {/* แถบแท็บและตัวกรองอยู่นอกการ์ดตาราง ตามต้นแบบ (.apbar) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="tabs">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              className={view === v.key ? "on" : ""}
              onClick={() => setView(v.key)}
            >
              {v.label} <b>{count(v.key)}</b>
            </button>
          ))}
        </div>
        {/* มือถือ: ช่องค้นหากับตัวกรองสถานะอยู่แถวเดียวกัน ค้นหากินที่ที่เหลือ */}
        <div className="flex w-full flex-wrap items-center gap-2.5 max-sm:flex-nowrap sm:ml-auto sm:w-auto sm:flex-nowrap">
          <div className="w-full max-sm:min-w-0 max-sm:flex-1 sm:w-[260px]">
            <SearchBox value={q} onChange={setQ} placeholder="ค้นหาผู้ขอหรือรายละเอียด" />
          </div>
          {tabs.length > 1 && (
            <select
              value={cur}
              onChange={(e) => setTab(e.target.value as "all" | Kind)}
              aria-label="กรองตามประเภท"
              className="field-control h-9 !w-[150px] flex-none cursor-pointer pr-8 text-[13px] max-sm:h-10 max-sm:!w-[124px]"
            >
              {tabs.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.key === "all" ? "ทุกประเภท" : t.label}
                </option>
              ))}
            </select>
          )}
          {view === "hist" && (
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status | "")}
            aria-label="กรองตามสถานะ"
            className="field-control h-9 !w-[150px] flex-none cursor-pointer pr-8 text-[13px] max-sm:h-10 max-sm:!w-[124px]"
          >
            {STATUS_OPTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          )}
        </div>
      </div>

      {/* มือถือ: แถวละคำขอ กดทั้งแถวเปิดรายละเอียด ชื่อผู้ขอกับเรื่องที่ขออยู่ซ้าย รอมากี่วันอยู่ขวา */}
      <section className="panel glass sm:hidden">
        {rows.length === 0 ? (
          <p className="py-[30px] text-center text-[13px] text-muted-foreground">ไม่มีคำขอตามเงื่อนไขที่เลือก</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((item) => {
              const wait = daysBetween(item.at.split(" ")[0], today);
              const hot = wait >= WAIT_HOT && item.status === "pending";
              const hit = sameId(item, findId);
              return (
                <li key={`${item.kind}-${item.src}-${item.role ?? ""}-${item.key}`}>
                  <button
                    type="button"
                    aria-label={`เปิดคำขอของ ${item.name}`}
                    onClick={() => open(item)}
                    className={`flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left active:bg-muted ${
                      hit ? "ring-2 ring-primary ring-inset" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[14px] font-semibold">{item.name}</b>
                      <span className="block truncate text-[11.5px] text-muted-foreground">{item.sub}</span>
                      <span className="mt-1 block text-[13px] leading-snug">
                        {item.topic}
                        {cutHours(item) != null && (
                          <span className="text-[11.5px] text-muted-foreground"> · อนุมัติ {cutHours(item)?.toFixed(2)} ชม.</span>
                        )}
                        {multi && (
                          <span className="block truncate text-[11.5px] text-muted-foreground">
                            มาถึงคุณในฐานะ {roleLabel(item.as)}
                          </span>
                        )}
                        {/* ใบเบิกที่มีค่าคอมมิชชั่น/อินเซนทีฟ — บอกเหตุผลที่อนุมัติไม่ได้ (ผู้ใช้สั่ง 15 ต.ค. 2569) */}
                        {item.status === "pending" && item.block && (
                          <span className="block text-[11.5px] font-medium text-destructive">{item.block}</span>
                        )}
                        {/* ไม่แสดงรหัสคำขอในรายการ — ดูได้ในรายละเอียด (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                        <span className="num block truncate text-[11.5px] text-muted-foreground">
                          #{noOf.get(rowKey(item))} · ส่ง {thaiDate(item.at.split(" ")[0])}
                        </span>
                      </span>
                    </span>
                    <span
                      className={`flex-none text-right text-[12px] whitespace-nowrap ${
                        hot ? "font-semibold text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {wait <= 0 ? "วันนี้" : wait === 1 ? "เมื่อวาน" : `${wait} วันก่อน`}
                    </span>
                    <span aria-hidden className="flex-none text-[18px] leading-none text-muted-foreground">
                      ›
                    </span>
                  </button>
                  {/* ปุ่มตัดสินใต้รายการที่รออนุมัติ (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                  {item.status === "pending" && (
                    <div className="grid grid-cols-2 gap-2.5 px-4 pb-3">{decide(item, true)}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel glass flex flex-col max-sm:hidden">
        <div className="scroll-stable min-h-0 flex-1 overflow-auto">
          <table className="data-table cards-sm min-w-[880px]">
            <thead>
              <tr>
                <th className="c" style={{ width: 60 }}>ลำดับ</th>
                {/* ตำแหน่งแยกคอลัมน์หน้าชื่อผู้ขอ (ผู้ใช้สั่ง 29 ต.ค. 2569) */}
                <th style={{ width: 150 }}>ตำแหน่ง</th>
                <th style={{ width: 170 }}>ผู้ขอ</th>
                <th style={{ width: 240 }}>คำขอ</th>
                {/* วันที่ส่งแยกคอลัมน์ · ไม่แสดงรหัสคำขอ (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                <th style={{ width: 140 }}>วันที่ส่ง</th>
                <th style={{ width: 130 }}>ส่งเมื่อ</th>
                {/* คอลัมน์ปุ่ม: ดูรายละเอียด · ไม่อนุมัติ · อนุมัติ (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                <th aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-[30px] text-center text-muted-foreground">
                    ไม่มีคำขอตามเงื่อนไขที่เลือก
                  </td>
                </tr>
              ) : (
                rows.map((item) => {
                  const wait = daysBetween(item.at.split(" ")[0], today);
                  const hot = wait >= WAIT_HOT && item.status === "pending";
                  const hit = sameId(item, findId);
                  return (
                    <tr
                      key={`${item.kind}-${item.src}-${item.role ?? ""}-${item.key}`}
                      tabIndex={0}
                      style={{ cursor: "pointer" }}
                      aria-label={`เปิดคำขอของ ${item.name}`}
                      className={`hover:[&>td]:bg-[rgba(208,2,27,.04)] ${hit ? "ring-2 ring-primary ring-inset" : ""}`}
                      onClick={() => open(item)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          open(item);
                        }
                      }}
                    >
                      <td data-label="ลำดับ" className="c num muted">{noOf.get(rowKey(item))}</td>
                      <td data-label="ตำแหน่ง" className="text-muted-foreground">{item.sub}</td>
                      <td data-label="ผู้ขอ">
                        <b className="block font-semibold">{item.name}</b>
                      </td>
                      <td data-label="คำขอ">
                        {item.topic}
                        {cutHours(item) != null && (
                          <span className="why block">อนุมัติ {cutHours(item)?.toFixed(2)} ชม.</span>
                        )}
                        {multi && <span className="why block">มาถึงคุณในฐานะ {roleLabel(item.as)}</span>}
                        {item.status === "pending" && item.block && (
                          <span className="block text-[12px] font-medium text-destructive">{item.block}</span>
                        )}
                      </td>
                      <td data-label="วันที่ส่ง" className="num text-[12.5px] whitespace-nowrap text-muted-foreground">
                        {thaiDate(item.at.split(" ")[0])}
                      </td>
                      <td
                        data-label="ส่งเมื่อ"
                        className={`text-[12.5px] whitespace-nowrap ${hot ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                        title={hot ? `รอนานเกิน ${WAIT_HOT} วัน` : undefined}
                      >
                        {wait <= 0 ? "วันนี้" : wait === 1 ? "เมื่อวาน" : `${wait} วันก่อน`}
                      </td>
                      <td data-label="" className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className="h-[30px] flex-none rounded-[8px] border border-border px-3 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              open(item);
                            }}
                          >
                            ดูรายละเอียด
                          </button>
                          {item.status === "pending" ? (
                            decide(item, false)
                          ) : (
                            <span className={`tag ${item.status === "approved" ? "t-ok" : "t-late"}`}>
                              <i />
                              {item.status === "approved" ? "อนุมัติแล้ว" : "ไม่อนุมัติ"}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {viewing && (
        <RequestDialog item={viewing} mode={mode} fixedOt={fixedOt} onClose={() => setViewing(null)} />
      )}
    </>
  );
}

/** ใบนี้คือรหัสที่ลิงก์ชี้มาไหม — ?find= ของ GM ใช้ key · ?req= ของ CEO ใช้ ref */
function sameId(item: Request, id: string) {
  return Boolean(id) && (item.ref ?? item.key) === id;
}

function Head() {
  return (
    <div className="bar">
      <div>
        <h1>คำขออนุมัติ</h1>
      </div>
    </div>
  );
}

/**
 * รายละเอียดคำขอ + ตัดสินในกล่องเดียว
 * อนุมัติ = บันทึกทันที · ไม่อนุมัติ = กดครั้งแรกเปิดช่องเหตุผล กดอีกครั้งถึงบันทึก (ต้องมีเหตุผล)
 */
function RequestDialog({
  item,
  mode = "view",
  fixedOt = false,
  onClose,
}: {
  item: Request;
  /** CEO — เห็นชั่วโมงโอทีแบบอ่านอย่างเดียว อนุมัติเท่าที่ขอ (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  fixedOt?: boolean;
  /**
   * view = ดูรายละเอียดอย่างเดียว ไม่มีปุ่มตัดสิน (ตัดสินที่ปุ่มในตาราง · ผู้ใช้สั่ง 5 ต.ค. 2569)
   * reject = เปิดที่ช่องเหตุผล มีแค่ปุ่มยืนยันไม่อนุมัติ · approve = ยืนยันชั่วโมงโอที มีแค่ปุ่มอนุมัติ
   */
  mode?: "view" | "reject" | "approve";
  onClose: () => void;
}) {
  const done = item.status !== "pending";
  const [rejecting, setRejecting] = useState(mode === "reject");
  const [why, setWhy] = useState("");
  const [warn, setWarn] = useState(false);
  /* โอทีที่รอตัดสิน — เทียบเวลาตอกบัตรจริง ให้แก้ชั่วโมงก่อนอนุมัติ */
  const ot = useOtDecision(!done && item.ot ? item.ot : null);
  const cut = cutHours(item);

  function reject() {
    if (!rejecting) return setRejecting(true);
    if (!why.trim()) return setWarn(true);
    applyDecision(item, false, why.trim());
    onClose();
  }

  function approve() {
    if (item.block) return;
    if (item.kind === "ot" && item.ot && fixedOt) {
      if (ot.tooSmall) return;
      applyDecision(item, true, ot.comment.trim(), item.hours ?? ot.asked);
    } else if (item.kind === "ot" && item.ot) {
      /* ต่ำกว่า 0.5 ชม. หรือยังไม่ยืนยันชั่วโมงเมื่อบัตรตอกไม่ครอบคลุม — อนุมัติไม่ได้ */
      if (!ot.ready) return;
      applyDecision(item, true, ot.finalComment(), ot.hours);
    } else applyDecision(item, true, "");
    onClose();
  }

  return (
    <ApprModal
      title={`${KIND[item.kind]} ${item.name}`}
      icon={<KindIcon kind={item.kind} />}
      onClose={onClose}
      footer={
        done || mode === "view" ? (
          <>
            <button type="button" className="inline-flex h-[42px] min-w-[110px] items-center justify-center rounded-lg bg-[#0f172a] px-4 text-[14px] font-medium text-white hover:bg-[#1e293b] max-md:flex-1" onClick={onClose}>
              ปิดหน้าต่าง
            </button>
          </>
        ) : (
          /* มีแค่ปุ่มของงานที่เปิดมาทำ + ยกเลิก */
          <>
            <button type="button" className="inline-flex h-[42px] min-w-[120px] items-center justify-center rounded-lg border border-[#cbd5e1] bg-white px-4 text-[14px] font-medium text-[#334155] hover:bg-[#f8fafc] max-md:flex-1" onClick={onClose}>
              ยกเลิก
            </button>
            {mode === "reject" ? (
            <button
              type="button"
              className="inline-flex h-[42px] min-w-[110px] items-center justify-center rounded-lg bg-[#be123c] px-4 text-[14px] font-medium text-white hover:bg-[#9f1239] max-md:flex-1"
              onClick={reject}
            >
              {rejecting ? "ยืนยันไม่อนุมัติ" : "ไม่อนุมัติ"}
            </button>
            ) : (
            <button
              type="button"
              className="inline-flex h-[42px] min-w-[110px] items-center justify-center rounded-lg bg-[#047857] px-4 text-[14px] font-medium text-white hover:bg-[#065f46] disabled:opacity-40 max-md:flex-1"
              onClick={approve}
              disabled={Boolean(item.block) || (item.kind === "ot" && Boolean(item.ot) && (fixedOt ? ot.tooSmall : !ot.ready))}
            >
              อนุมัติ
            </button>
            )}
          </>
        )
      }
    >
      {/* รูปแบบตามดีไซน์ Stitch — แถวคั่นเส้น หัวข้อซ้ายจาง ค่าขวา (ผู้ใช้สั่ง 29 ต.ค. 2569) */}
      <dl className="space-y-4 text-[14px]">
        <Kv
          label="ผู้ยื่น"
          value={
            <>
              <span className="font-semibold">{item.name}</span>
              {item.sub && <span className="ml-1.5 text-[12px] text-[#94a3b8]">({item.sub})</span>}
            </>
          }
        />
        {/* ใบลา: แถว "วันที่" (ช่วงวันลา + ช่วงเวลาของลาไม่เต็มวัน) แทน "ประเภท: การลา" (ผู้ใช้สั่ง 19 ต.ค. 2569) */}
        {item.kind === "leave" && item.when ? (
          <Kv label="วันที่" value={<span className="num">{item.when}</span>} />
        ) : (
          <Kv label="ประเภท" value={item.topic ? `${KIND[item.kind]} (${item.topic})` : KIND[item.kind]} />
        )}
        <Kv
          label="รายการ"
          value={
            <span className="block leading-[1.8]">
              {item.lines.map((l) =>
                item.kind === "ot" && l.startsWith("รวม ") ? (
                  <span key={l} className="num mt-1.5 inline-block rounded-md bg-[#fff1f2] px-2.5 py-1 text-[12.5px] font-bold text-[#be123c]">
                    {l}
                  </span>
                ) : (
                  <span key={l} className="block">
                    <NumBold text={l} />
                  </span>
                ),
              )}
            </span>
          }
        />
        {/* อนุมัติไม่ได้ — ไม่อนุมัติแล้วให้พนักงานลบรายการออก (ผู้ใช้สั่ง 15 ต.ค. 2569) */}
        {!done && item.block && (
          <Kv label="อนุมัติไม่ได้" value={<span className="font-medium text-destructive">{item.block}</span>} />
        )}
        {/* สิทธิ์คงเหลือหลังลา — ตัวเลขชุดเดียวกับที่ CEO เห็น (quotaAfterLeave) */}
        {item.quota !== undefined && (
          <Kv
            label="เหลือสิทธิ์หลังลา"
            value={
              item.quota >= 0 ? (
                <span className="num font-semibold">{fmtLeave(item.quota)}</span>
              ) : (
                <span className="num font-semibold text-destructive">เกินสิทธิ์ {fmtLeave(-item.quota)} — ส่วนที่เกินเป็นลาไม่รับค่าจ้าง หักเงินเดือน</span>
              )
            }
          />
        )}
        {/* เหตุผลที่ผู้ยื่นเขียนมา — ตัดสินโดยไม่อ่านเหตุผลไม่ได้ */}
        {/* โอทีของคิว CEO มีเหตุผลผู้ยื่นมาด้วย (note) — คิวของ GM ใส่ note เฉพาะใบลา จึงเหมือนเดิม (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
        {(item.kind === "leave" || Boolean(item.note)) && (
          <Kv label="เหตุผลของผู้ยื่น" value={item.note || "ไม่ได้เขียนเหตุผล"} />
        )}
        <Kv label="ยื่นเมื่อ" value={thaiStamp(item.at)} />
        {/* ไม่มีแถว "ถึงคุณในฐานะ" แล้ว (ผู้ใช้สั่ง 19 ต.ค. 2569) */}
        {done && (
          <Kv
            label="ผล"
            value={
              item.status === "approved" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#a7f3d0] bg-[#ecfdf5] px-2.5 py-1 text-[12.5px] font-semibold text-[#047857]">
                  <CheckIcon className="size-3" strokeWidth={2.6} />
                  {cut != null ? `อนุมัติ ${cut.toFixed(2)} ชม. (ขอ ${(item.hours ?? 0).toFixed(2)} ชม.)` : "อนุมัติแล้ว"}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-[#fecdd3] bg-[#fff1f2] px-2.5 py-1 text-[12.5px] font-semibold text-[#be123c]">
                  ไม่อนุมัติ
                </span>
              )
            }
          />
        )}
        {done && item.why && <Kv label="เหตุผล" value={item.why} />}
      </dl>

      {/* เอากล่อง "คนอื่นที่ไม่อยู่ช่วงวันเดียวกัน" ออก (ผู้ใช้สั่ง 19 ต.ค. 2569) */}

      {!done && item.kind === "ot" && item.ot && !rejecting && (
        <div className="mt-4 border-t border-border pt-3.5">
          <OtActualFields d={ot} idPrefix={`appr-${item.key}`} fixed={fixedOt} />
        </div>
      )}

      {rejecting && !done && (
        <div className="mt-4">
          <label htmlFor="appr-why" className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">
            เหตุผลที่ไม่อนุมัติ
          </label>
          <textarea
            id="appr-why"
            autoFocus
            value={why}
            onChange={(e) => {
              setWhy(e.target.value);
              if (e.target.value) setWarn(false);
            }}
            placeholder="บอกให้ผู้ยื่นรู้ว่าต้องแก้อะไร"
            className="field-control h-[78px] w-full resize-y rounded-[10px] px-[11px] py-[9px] text-[13.5px] leading-[1.5]"
          />
          {warn && (
            <p className="mt-[9px] rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] px-[13px] py-2.5 text-[12.5px] leading-[1.55] text-destructive">
              ไม่อนุมัติต้องระบุเหตุผล เพื่อให้ผู้ยื่นรู้ว่าต้องแก้อะไร
            </p>
          )}
        </div>
      )}
    </ApprModal>
  );
}

/**
 * กล่องรายละเอียดคำขอตามดีไซน์ Stitch (ผู้ใช้สั่ง 29 ต.ค. 2569)
 * กว้าง 520 · มุม 20 · พื้นหลังมืดเบลอ · หัวไม่มีเส้นคั่น · ท้ายเป็นแถบพื้นเทาอ่อน
 * จอแคบเปิดเป็นแผ่นจากขอบล่างเหมือนกล่องอื่นของระบบ
 */
function ApprModal({
  title,
  icon,
  onClose,
  footer,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const hydrated = useHydrated();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const unlock = lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
    };
  }, [onClose]);

  if (!hydrated) return null;

  return createPortal(
    <div
      className="appr-modal fixed inset-0 z-80 flex items-end justify-center bg-[#0f172a]/40 backdrop-blur-sm md:items-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="appr-modal-box flex max-h-[92dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[20px] bg-white text-[#0f172a] shadow-2xl md:rounded-[20px]">
        <div className="flex flex-none items-center justify-between gap-3 border-b border-[#e2e8f0] px-6 pt-5 pb-4 md:px-7 md:pt-6">
          <h2 className="flex h-12 min-w-0 items-center gap-3 text-[18px] font-bold">
            {icon}
            <span className="truncate">{title}</span>
          </h2>
          <button
            type="button"
            className="no-print grid size-8 flex-none place-items-center rounded-full text-[#94a3b8] hover:bg-[#f1f5f9] hover:text-[#334155]"
            onClick={onClose}
            aria-label="ปิด"
          >
            <CloseIcon className="size-[15px]" strokeWidth={2.2} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-5 md:px-7">{children}</div>
        <div className="no-print flex flex-none items-center justify-end gap-2.5 bg-[#f8fafc] px-6 py-4 pb-[max(16px,env(safe-area-inset-bottom))] md:px-7">
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** ตัวเลขจำนวนและยอดเงิน (มีทศนิยม) เข้มขึ้น อ่านได้เร็ว — วันที่ไม่นับ */
function NumBold({ text }: { text: string }) {
  const parts = text.split(/(\d[\d,]*\.\d{2})/);
  return (
    <>
      {parts.map((x, i) =>
        i % 2 ? (
          <b key={i} className="font-bold text-foreground">
            {x}
          </b>
        ) : (
          x
        ),
      )}
    </>
  );
}

/** บันทึกผลลงสโตร์ของคำขอแต่ละชนิด — ที่เดียว */
/* hours = ชั่วโมงโอทีที่อนุมัติ (ปรับตามเวลาตอกบัตรจริงแล้ว) — ไม่ส่งมาใช้เท่าที่ขอ */
function applyDecision(item: Request, approve: boolean, why: string, hours?: number) {
  if (item.src === "emp")
    return decideEmpRequest(item.key, approve, why, item.kind === "ot" ? hours : undefined);
  if (item.src === "intern") return decideInternLeave(item.key, approve, bkkStamp());
  if (!item.role) return;
  if (approve) {
    if (item.kind === "leave") approveLeave(item.role, item.key);
    if (item.kind === "ot") approveOt(item.role, item.key, hours ?? item.hours ?? 0, why);
    if (item.kind === "expense") approveClaim(item.role, item.key, why);
  } else {
    if (item.kind === "leave") rejectLeave(item.role, item.key, why);
    if (item.kind === "ot") rejectOt(item.role, item.key, why);
    if (item.kind === "expense") rejectClaim(item.role, item.key, why);
  }
}

function Kv({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-baseline gap-x-4">
      {/* หัวข้อทางซ้ายจางกว่าค่า ให้สายตาไปที่ข้อมูลก่อน */}
      <dt className="text-[13px] font-medium text-[#94a3b8]">{label}</dt>
      <dd className="leading-[1.6] text-[#0f172a]">{value}</dd>
    </div>
  );
}

/** ไอคอนหัวกล่องรายละเอียด — แผ่นสีแดงอ่อนตามดีไซน์ */
function KindIcon({ kind }: { kind: Kind }) {
  const Icon = kind === "ot" ? ClockIcon : kind === "leave" ? CalendarIcon : ReceiptIcon;
  return (
    <i className="grid size-9 flex-none place-items-center rounded-full bg-[#fff1f2] text-[#be123c] not-italic">
      <Icon className="size-4" strokeWidth={2.2} />
    </i>
  );
}

// ─── แปลงคำขอแต่ละประเภทให้อยู่ในรูปเดียวกัน ────────────────────────

/**
 * วันที่ของใบลาในกล่องรายละเอียด — "15 ต.ค. 2569" · "15 – 16 ต.ค." แบบช่วง
 * ลาไม่เต็มวันต่อท้ายช่วงเวลา "· 09:00–12:00 น." (ผู้ใช้สั่ง 19 ต.ค. 2569)
 */
export function leaveWhen(from: string, to: string, startMin?: number, endMin?: number) {
  const range = from === to ? thaiDate(from) : `${thaiDate(from)} – ${thaiDate(to)}`;
  return startMin != null && endMin != null && from === to
    ? `${range} · ${formatMinutesOfDay(startMin)}–${formatMinutesOfDay(endMin)} น.`
    : range;
}

/** ใบลาเก่าที่ยังไม่มีเวลายื่น ใช้วันที่ลาแทน จะได้เรียงคิวและนับวันที่รอได้เหมือนกัน */
function stampOf(submittedAt: string, fallbackDate: string) {
  return submittedAt || `${fallbackDate} 00:00`;
}

function statusOf(s: string): Status {
  return s === "อนุมัติแล้ว" ? "approved" : s === "ไม่อนุมัติ" ? "rejected" : "pending";
}

/** ชื่อและตำแหน่งของบทบาทที่ล็อกอินได้ */
function who(role: Role) {
  return { src: "role" as const, role, name: nameOf(USERS[role].name), full: USERS[role].name, sub: roleLabel(role) };
}

/** คำขอของทีมงานตามรหัสพนักงาน (emp-requests) — รูปเดียวกับใบของบทบาท */
/** แปลงช่วงที่ไม่อยู่เป็นบรรทัดอ่านง่าย — ใช้ทั้งใบลาของบทบาทและคำขอลาของทีมงาน */
function awayList(spans: AwaySpan[], me: { id: string; who: string; date: string; toDate: string }) {
  return othersAway(spans, me).map((x) => ({
    name: nameOf(x.who),
    text: `${x.type} ${x.date === x.toDate ? thaiDate(x.date) : `${thaiDate(x.date)} – ${thaiDate(x.toDate)}`}${
      x.pending ? " · ยังรออนุมัติ" : ""
    }`,
  }));
}

function fromEmp(r: EmpRequest, name: string, sub: string, as: Role, spans: AwaySpan[]): Request {
  const base = { src: "emp" as const, as, name: nameOf(name), full: name, sub, key: r.id, no: r.id, status: r.status, at: r.at, why: r.reason ?? "" };
  if (r.kind === "ot") {
    const lines = [`${thaiDate(r.date ?? "")} เวลา ${r.start}–${r.end}`, `รวม ${(r.hours ?? 0).toFixed(2)} ชม.`];
    const ot: OtReq | undefined =
      r.date && r.start && r.end
        ? { date: r.date, startMin: minutesOfDay(r.start), endMin: minutesOfDay(r.end), hours: r.hours ?? 0, emp: r.emp }
        : undefined;
    return {
      ...base, kind: "ot", topic: "ทำงานล่วงเวลา", line: `${lines.join(" ")} ${r.note}`, lines,
      hours: r.hours, approvedHours: r.approvedHours ?? null, ot,
    };
  }
  if (r.kind === "leave") {
    const range = r.from === r.toDate ? thaiDate(r.from ?? "") : `${thaiDate(r.from ?? "")} – ${thaiDate(r.toDate ?? "")}`;
    const lines = [r.leaveType ?? "การลา", `รวม ${fmtLeaveHours(empReqLeaveHours(r))}`]; // วันที่อยู่แถว "วันที่" แล้ว (ผู้ใช้สั่ง 19 ต.ค. 2569)
    return {
      ...base,
      kind: "leave",
      when: leaveWhen(
        r.from ?? "",
        r.toDate ?? r.from ?? "",
        r.span === "half" && r.start ? minutesOfDay(r.start) : undefined,
        r.span === "half" && r.end ? minutesOfDay(r.end) : undefined,
      ),
      topic: r.leaveType ?? "การลา",
      line: `${lines.join(" ")} ${range} ${r.note}`,
      lines,
      /* สูตรเดียวกับหน้าของ CEO สำหรับคำขอของทีมงาน (quota − ที่ใช้ไปก่อนใบนี้ − ใบนี้) */
      quota: quotaAfterUsed(r.leaveType ?? "", r.used ?? 0, r.days ?? 0),
      note: r.note,
      away: awayList(spans, {
        id: r.id,
        who: name,
        date: r.from ?? "",
        toDate: r.toDate ?? r.from ?? "",
      }),
    };
  }
  /* ยอดคิดรายแถวตามชนิดรถ และบอกว่าระยะทางเป็นของรถยนต์หรือมอเตอร์ไซค์ (ผู้ใช้สั่ง 29 ต.ค. 2569) */
  const fuel = r.fuel ?? [];
  const lines = [
    `ค่าน้ำมัน ${thaiMonth(r.month ?? "")}`,
    ...fuelKmLines(fuel),
    `เป็นเงิน ${baht(fuel.reduce((s, x) => s + fuelAmount(x), 0))} บาท`,
  ];
  return { ...base, kind: "expense", topic: "ค่าน้ำมัน", line: `${r.id} ${lines.join(" ")}`, lines };
}

/** ใบลานักศึกษาฝึกงานในสโตร์ฝ่ายบุคคล — รูปเดียวกับใบลาอื่น ผู้อนุมัติคือฝ่ายบุคคล */
function fromIntern(r: InternLeave, name: string, sub: string): Request {
  const type = HR_LEAVE_LABEL[r.lt];
  const range = r.from === r.to ? thaiDate(r.from) : `${thaiDate(r.from)} – ${thaiDate(r.to)}`;
  const lines = [type, `รวม ${fmtLeave(r.days)}`];
  return {
    kind: "leave",
    when: leaveWhen(r.from, r.to),
    src: "intern",
    as: "hr",
    name: nameOf(name),
    full: name,
    sub,
    key: r.id,
    no: r.id,
    status: r.status,
    at: r.at,
    topic: type,
    line: `${lines.join(" ")} ${range} ${r.note}`,
    lines,
    note: r.note,
    why: "",
  };
}

/*
 * ใบลาหนึ่งใบ — ผู้อนุมัติต้องได้ข้อมูลชุดเดียวกับที่ CEO เห็น (ผู้ใช้สั่ง 24 ก.ย. 2569)
 * เดิมหน้านี้บอกแค่ประเภท ช่วงวัน และจำนวนวัน คนที่อนุมัติการลามากที่สุดกลับรู้น้อยที่สุด
 * สิทธิ์คงเหลือคิดจาก quotaAfterLeave ตัวเดียวกับหน้าของ CEO จะได้ไม่มีเลขสองชุด
 */
function fromLeave(
  role: Role,
  v: LeaveRecord,
  as: Role,
  records: LeaveRecord[],
  spans: AwaySpan[],
): Request {
  const range = v.date === v.toDate ? thaiDate(v.date) : `${thaiDate(v.date)} – ${thaiDate(v.toDate)}`;
  const status = statusOf(v.status);
  const lines = [v.type, `รวม ${fmtLeaveHours(leaveHoursOf(v))}`];
  const away = awayList(spans, { id: v.id, who: v.employee, date: v.date, toDate: v.toDate });
  return {
    when: leaveWhen(v.date, v.toDate, v.half || v.hours != null ? v.startMin : undefined, v.half || v.hours != null ? v.endMin : undefined),
    quota: quotaAfterLeave(records, v),
    /* ไม่อนุมัติแล้ว comment ถูกแทนด้วยเหตุผลของผู้อนุมัติ — ไม่ใช่เหตุผลของผู้ยื่นอีกต่อไป */
    note: status === "rejected" ? "" : v.comment,
    away,
    kind: "leave",
    ...who(role),
    as,
    key: v.id,
    no: v.id,
    status,
    /* ใบใหม่มีเวลายื่นจริง ใบตั้งต้นบางใบไม่มี จึงถอยไปใช้วันลาแทน */
    at: stampOf(v.submittedAt ?? "", v.date),
    topic: v.type,
    line: `${lines.join(" ")} ${range} ${status === "rejected" ? "" : v.comment}`,
    lines,
    /* ไม่อนุมัติแล้ว comment ของใบลาถูกแทนด้วยเหตุผลของผู้อนุมัติ */
    why: status === "rejected" ? v.comment : "",
  };
}

function fromOt(role: Role, v: OtRecord, as: Role): Request {
  const lines = [
    `${thaiDate(v.date)} เวลา ${formatMinutesOfDay(v.startMin)}–${formatMinutesOfDay(v.endMin)}`,
    `รวม ${v.hours.toFixed(2)} ชม.`,
  ];
  return {
    kind: "ot",
    ...who(role),
    as,
    key: v.id,
    no: v.id,
    status: statusOf(v.status),
    at: stampOf(v.submittedAt, v.date),
    topic: "ทำงานล่วงเวลา",
    line: `${lines.join(" ")} ${v.reason}`,
    lines,
    hours: v.hours,
    approvedHours: v.approvedHours,
    ot: { date: v.date, startMin: v.startMin, endMin: v.endMin, hours: v.hours, role },
    why: v.comment,
  };
}

/** ระยะรวมแยกตามชนิดรถ เช่น "รถยนต์ รวม 48.00 กม." — ไม่มีแถวค่าน้ำมันคงบรรทัดเดิม (ผู้ใช้สั่ง 29 ต.ค. 2569) */
function fuelKmLines(rows: { km: string | number; vehicle?: Vehicle }[]) {
  const km = (list: typeof rows) => list.reduce((s, r) => s + (Number(String(r.km).replace(/,/g, "")) || 0), 0);
  const vs = vehiclesIn(rows);
  if (!vs.length) return [`รวม ${km(rows).toFixed(2)} กม.`];
  return vs.map((x) => `${VEHICLE_LABEL[x]} รวม ${km(fuelRowsOf(rows, x)).toFixed(2)} กม.`);
}

/* หนึ่งใบหนึ่งประเภท — key = เดือน + ประเภท ไม่ซ้ำกันแม้เดือนเดียวกัน (ผู้ใช้สั่ง 29 ต.ค. 2569) */
function fromClaim(role: Role, v: ExpenseClaim, as: Role): Request {
  const label = CLAIM_TYPE_LABEL[v.type];
  const lines = [
    `${label} ${thaiMonth(v.month)}`,
    ...(isFuelType(v.type) ? fuelKmLines(v.fuel) : [`${(v.other ?? []).length} รายการ`]),
    `เป็นเงิน ${baht(claimTotal(v))} บาท`,
  ];
  return {
    kind: "expense",
    ...who(role),
    as,
    key: keyOf(v),
    no: v.no ?? "",
    status: statusOf(v.status),
    at: stampOf(v.submittedAt, `${v.month}-01`),
    topic: label,
    line: `${v.no ?? ""} ${lines.join(" ")}`,
    lines,
    why: v.comment,
    block: v.status === "รออนุมัติ" ? claimApproveBlock(v) : "",
  };
}
