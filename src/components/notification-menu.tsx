"use client";
import { bkkNow, thaiDate, todayIso } from "@/lib/format";
import "@/styles/mobile/notifications.css";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  getRecordsServerSnapshot,
  getRecordsSnapshot,
  subscribeRecords,
} from "@/lib/attendance-store";
import { useCrm } from "@/lib/crm-store";
import { useContracts } from "@/lib/contract-store";
import { CURRENT_USER } from "@/lib/mock-data";
import { useExpenseClaims } from "@/lib/expense-store";
import { useLeaveRecords } from "@/lib/leave-store";
import { markAllRead, markRead, useReadNotices } from "@/lib/notification-store";
import { buildNotices, LEVEL_STYLE, type Notice } from "@/lib/notifications";
import { useAcc } from "@/lib/acc-store";
import { canVisitAny, useMenuAccess } from "@/lib/nav";
import { usePm } from "@/lib/pm-store";
import { useClientReviews } from "@/lib/client-review-store";
import { useSchedule } from "@/lib/pm-schedule-store";
import { useHr } from "@/lib/hr-store";
import { useSystemSettings } from "@/lib/system-settings";
import { useAdminLog } from "@/lib/admin-log";
import { useProfile } from "@/lib/profile-data";
import { approvesFor, useApprovalRoute, useRole } from "@/lib/role";
import { useHrTime, useMyRoles, usePunchTimes } from "@/lib/hr-link";
import { useEmpRequests } from "@/lib/emp-requests";
import { useAllLeave } from "@/lib/leave-store";
import { useAllOt } from "@/lib/ot-store";
import { useAllClaims } from "@/lib/expense-store";
import { useOtRecords } from "@/lib/ot-store";
import {
  BellIcon,
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ClockIcon,
  CloseIcon,
  FileIcon,
} from "./icons";

export function NotificationMenu({
  variant = "top",
  icon,
}: {
  variant?: "top" | "bar";
  /** ไอคอนกระดิ่งแทนตัวตั้งต้น — หน้าหลักมือถือของบัญชีใช้เส้นตามต้นแบบ (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  icon?: React.ReactNode;
}) {
  /* "bar" = ปุ่มในแถบล่างบนมือถือ — กล่องยังคลี่จากขอบบนเหมือนเดิม เพราะกล่องยาว */
  const bar = variant === "bar";
  const crm = useCrm();
  /* ใบสัญญาที่ออกแล้ว — แจ้งพนักงานขายเจ้าของดีล (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  const contracts = useContracts();
  const hr = useHr();
  const adminLog = useAdminLog();
  const me = useProfile();
  const sys = useSystemSettings();
  const leaves = useLeaveRecords();
  const ot = useOtRecords();
  const punches = useSyncExternalStore(
    subscribeRecords,
    getRecordsSnapshot,
    getRecordsServerSnapshot,
  );
  const claims = useExpenseClaims();
  const read = useReadNotices();
  const role = useRole();
  const route = useApprovalRoute();
  const access = useMenuAccess();
  const pm = usePm();
  const sched = useSchedule();
  /* รอบที่ลูกค้าตรวจผ่านลิงก์ — ลูกค้าส่งความเห็นแล้วขึ้นกระดิ่งของ PM */
  const clientReviews = useClientReviews();
  const acc = useAcc();
  const allLeaves = useAllLeave();
  const allOt = useAllOt();
  const allClaims = useAllClaims();
  const extra = useEmpRequests();
  /* เวลาทำงานและเวลาตอกบัตรของทุกคน — ฝ่ายบุคคลใช้หารายการที่ต้องตรวจ (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  const hrTime = useHrTime();
  const punchTimes = usePunchTimes();

  /* คำขอที่ยังไม่ได้ตัดสิน — นับเฉพาะประเภทและบทบาทที่เราเป็นผู้อนุมัติ
     รวมคำขอของทีมงานที่ยังไม่มีบัญชีเข้าระบบ (emp-requests) ที่ส่งถึง PM / GM ด้วย

     นับรวมทุกบทบาทที่คนนี้ถืออยู่ ไม่ใช่เฉพาะบทบาทที่เลือกอยู่ (เช่น บัญชีกับบุคคลเป็นคนเดียวกัน)
     ตัวเลขบนกระดิ่งจึงตรงกับคิวในหน้าคำขออนุมัติเสมอ — หน้านั้นก็รวมทุกบทบาทเหมือนกัน */
  const myRoles = useMyRoles();
  const approvals = useMemo(() => {
    const seen = new Set<string>();
    let sum = 0;
    for (const r of myRoles)
      for (const { kind, from } of approvesFor(r, route)) {
        /* บทบาทที่ควบกันอาจเป็นผู้อนุมัติของคนเดียวกัน — นับใบเดียวกันซ้ำไม่ได้ */
        if (seen.has(`${kind}|${from}`)) continue;
        seen.add(`${kind}|${from}`);
        if (kind === "leave") sum += allLeaves[from].filter((v) => v.status === "รอการอนุมัติ").length;
        else if (kind === "ot") sum += allOt[from].filter((v) => v.status === "รออนุมัติ").length;
        else sum += allClaims[from].filter((v) => v.status === "รออนุมัติ").length;
      }
    /* คิวของทีมงานที่ยังไม่มีบัญชีเข้าระบบมีเฉพาะสองบทบาทนี้ (emp-requests.to) */
    const queues: ("pm" | "gm" | "exec")[] = myRoles.filter((r): r is "pm" | "gm" => r === "pm" || r === "gm");
    /* โอทีของ SA/Dev ที่ยังไม่มีบัญชีขึ้นถึง CEO (to = exec) — นับเข้าคิวของ CEO ตรงกับหน้า /ceo/approvals (ผู้ใช้สั่ง 16 ต.ค. 2569) */
    if (myRoles.includes("ceo")) queues.push("exec");
    return sum + extra.filter((r) => queues.includes(r.to) && r.status === "pending").length;
  }, [myRoles, route, allLeaves, allOt, allClaims, extra]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /* จอมือถือ กล่องแจ้งเตือนต้องยิงออกไปที่ body ด้วย เหมือนฉากหลัง
     ไม่งั้นกล่องติดอยู่ในกรอบซ้อนของแถบหัว/แถบล่าง แล้วฉากหลังสีดำที่อยู่ใน body ทับกล่องจนมืด */
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /**
   * ผูกกับ "วันที่" ไม่ใช่เวลา เพื่อไม่ให้คำนวณใหม่ทุกวินาที
   * (เรื่องแจ้งเตือนทั้งหมดวัดกันเป็นวัน ไม่ใช่นาที)
   */
  const notices = useMemo(
    () =>
      buildNotices({
        crm, pm, acc, leaves, ot, punches, claims,
        now: bkkNow(), role, approvals, meId: me.employeeId, hr, adminLog, myRoles,
        /* ผลการตัดสินของใบที่เรายื่นไว้ในคิวของทีม ต้องถึงเจ้าของใบเหมือนใบที่ยื่นจากหน้าตัวเอง */
        empReqs: extra,
        /* นัดหมายของทั้งระบบ — ในนี้กรองเฉพาะใบที่มีชื่อเราเป็นผู้เข้าร่วม */
        events: sched.events,
        reviews: clientReviews.rounds,
        /* คำขอแก้วันหยุดที่ส่ง CEO (ผู้ใช้สั่ง 13 ต.ค. 2569) */
        holidayReq: sys.holidayReq,
        /* ใบสัญญาที่ออกแล้ว — ถึงพนักงานขายที่ดูแลดีล (ผู้ใช้สั่ง 15 ต.ค. 2569) */
        contracts,
        meName: CURRENT_USER.name,
        hrTime,
        punchTimes,
      })
        /* กระดิ่งบันทึกทุกเรื่องเสมอ ไม่ขึ้นกับสิทธิ์แจ้งเตือนหรือค่าตั้งรายเรื่อง (ผู้ใช้สั่ง 16 ต.ค. 2569) */
        // เมนูที่ผู้ดูแลระบบปิดไว้ ไม่ต้องเตือนเรื่องของหน้านั้น กดไปก็เข้าไม่ได้
        // คำขอทำข้อเสนอที่ส่งถึงตัวเราแม้ไม่ได้อยู่ทีมก่อนการขาย — เมนู "ของฉัน" มีคิวงานให้อยู่แล้ว (ผู้ใช้สั่ง 15 ต.ค. 2569)
        .filter(
          (n) =>
            canVisitAny(n.href.split("?")[0], myRoles, access, route) ||
            (n.id.startsWith("psto-") && n.href.split("?")[0] === "/presales-work"),
        ),
    [sys.holidayReq, contracts, crm, pm, acc, hr, leaves, ot, punches, claims, role, myRoles, approvals, me.employeeId, access, route, adminLog, extra, sched.events, clientReviews.rounds, hrTime, punchTimes],
  );

  const unread = notices.filter((n) => !read.includes(n.id));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={bar ? "botnav-slot" : "relative"}>
      <button
        type="button"
        className={bar ? `relative${open ? " on" : ""}` : "iconbtn glass-thin"}
        aria-label={unread.length ? `แจ้งเตือน ${unread.length} รายการ` : "แจ้งเตือน"}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        {bar ? (
          <>
            {/* แถบล่าง: ตัวเลขติดมุมไอคอนกระดิ่ง ไม่ใช่มุมช่องที่กว้างทั้งแถบ (ผู้ใช้สั่ง 22 ก.ย. 2569) */}
            <i className="relative not-italic">
              <BellIcon className="size-[21px]" />
              {unread.length > 0 && (
                <b className="num absolute -top-1.5 left-[13px] grid h-[17px] min-w-[17px] place-items-center rounded-full border-2 border-card bg-primary px-1 text-[10px] leading-none font-bold text-primary-foreground">
                  {unread.length > 99 ? "99+" : unread.length}
                </b>
              )}
            </i>
            <span>แจ้งเตือน</span>
          </>
        ) : (
          <>
            {icon ?? <BellIcon className="size-[18px]" />}
            {unread.length > 0 && (
              <span className="num absolute -top-1.5 -right-1.5 grid min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                {unread.length}
              </span>
            )}
          </>
        )}
      </button>

      {open &&
        phone &&
        /* มือถือ: แผงแจ้งเตือนเต็มจอแบบหน้า (ต้นแบบ notifications.html)
           z ต่ำกว่าแถบล่าง (.botnav z-35) — แถบล่างยังเห็นและกดได้ตามแบบ */
        createPortal(
          <div ref={panelRef} role="menu" aria-label="แจ้งเตือน" className="nt-m">
            <MobilePanel
              notices={notices}
              read={read}
              unread={unread.length}
              onClose={() => setOpen(false)}
            />
          </div>,
          document.body,
        )}

      {open && !phone && (
        <>
          {/* บนมือถือคลุมทั้งจอ จะได้แตะปิดง่ายและแผงไม่ลอยเบียดขอบ
              ยิงออกไปที่ body เพราะแถบหัวเป็น sticky ที่มี z-index จึงเป็นกรอบ
              ของลูกที่เป็น fixed ถ้าไม่ยิงออก ฉากหลังจะคลุมแค่ความสูงของแถบหัว */}
          {createPortal(
            <div
              className="fixed inset-0 z-50 bg-black/50 md:hidden"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />,
            document.body,
          )}
          {(() => {
            const box = (
          <div
            ref={panelRef}
            role="menu"
            aria-label="แจ้งเตือน"
            className="glass-solid fixed inset-x-3 top-[68px] z-[51] flex max-h-[76dvh] flex-col overflow-hidden rounded-2xl md:absolute md:inset-x-auto md:top-[calc(100%+8px)] md:right-0 md:max-h-[70dvh] md:w-[380px]"
          >
            <Panel
              notices={notices}
              read={read}
              unread={unread.length}
              onClose={() => setOpen(false)}
            />
          </div>
            );
            return phone || bar ? createPortal(box, document.body) : box;
          })()}
        </>
      )}
    </div>
  );
}

function Panel({
  notices,
  read,
  unread,
  onClose,
}: {
  notices: Notice[];
  read: string[];
  unread: number;
  onClose: () => void;
}) {
  /** จัดกลุ่มตามหัวข้อ แต่คงลำดับความด่วนที่เรียงมาแล้ว */
  const groups = useMemo(() => {
    const map = new Map<string, Notice[]>();
    for (const n of notices) {
      const list = map.get(n.group);
      if (list) list.push(n);
      else map.set(n.group, [n]);
    }
    return [...map.entries()];
  }, [notices]);

  return (
    <>
      <div className="flex flex-none items-center gap-2.5 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">
          แจ้งเตือน
          {unread > 0 && (
            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">
              {unread}
            </span>
          )}
        </h2>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => markAllRead(notices.map((n) => n.id))}
            className="btn glass-thin btn-mini ml-auto"
          >
            <CheckIcon className="size-3.5" strokeWidth={2.4} />
            อ่านทั้งหมด
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className={`iconbtn glass-thin size-8 ${unread > 0 ? "" : "ml-auto"} md:hidden`}
        >
          <CloseIcon className="size-3.5" strokeWidth={2.2} />
        </button>
      </div>

      <div className="scroll-stable min-h-0 flex-1 overflow-auto">
        {notices.length === 0 ? (
          <p className="px-5 py-12 text-center text-[13px] text-muted-foreground">
            ไม่มีเรื่องค้าง — เคลียร์หมดแล้ว
          </p>
        ) : (
          groups.map(([group, items]) => (
            <section key={group}>
              <h3 className="glass-thin sticky top-0 z-1 px-4 py-1.5 text-[11px] font-bold tracking-wide text-muted-foreground">
                {group} · {items.length}
              </h3>
              {items.map((n) => {
                const isRead = read.includes(n.id);
                return (
                  <Link
                    key={n.id}
                    href={n.href}
                    onClick={() => {
                      markRead(n.id);
                      onClose();
                    }}
                    className={`flex gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-muted ${
                      isRead ? "opacity-55" : ""
                    }`}
                  >
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full"
                      style={{ background: LEVEL_STYLE[n.level].dot }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <b className="block text-[13.5px] leading-snug font-medium break-words">
                        {n.title}
                      </b>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground break-words">
                        {n.detail}
                      </span>
                    </span>
                    {!isRead && (
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-label="ยังไม่ได้อ่าน" />
                    )}
                  </Link>
                );
              })}
            </section>
          ))
        )}
      </div>
    </>
  );
}

/** สีวงไอคอนตามความด่วน (ต้นแบบ notifications.html) — เรื่องที่อ่านแล้วเป็นสีเทา */
const M_TINT = {
  late: { bg: "#FCE3E7", fg: "#B0101F", Icon: ClockIcon },
  soon: { bg: "#FDEDD6", fg: "#94500A", Icon: CalendarIcon },
  info: { bg: "#E3EEFC", fg: "#1A5DB5", Icon: FileIcon },
} as const;

/** มือถือ: หน้าแจ้งเตือนเต็มจอ — "ใหม่" (ยังไม่อ่าน) แล้วตามด้วย "ก่อนหน้านี้" (อ่านแล้ว) */
function MobilePanel({
  notices,
  read,
  unread,
  onClose,
}: {
  notices: Notice[];
  read: string[];
  unread: number;
  onClose: () => void;
}) {
  const today = todayIso();
  const fresh = notices.filter((n) => !read.includes(n.id));
  const old = notices.filter((n) => read.includes(n.id));

  const item = (n: Notice, isRead: boolean) => {
    const t = M_TINT[n.level];
    return (
      <Link
        key={n.id}
        href={n.href}
        onClick={() => {
          markRead(n.id);
          onClose();
        }}
        className={`nt-m-item${isRead ? "" : " unread"}`}
      >
        <span
          className="nt-m-ico"
          style={isRead ? { background: "#EFEBEC", color: "#5E5255" } : { background: t.bg, color: t.fg }}
        >
          <t.Icon strokeWidth={2.1} />
        </span>
        <span className="nt-m-txt">
          <b>{n.title}</b>
          <span>{n.detail}</span>
          <small>{n.date === today ? "วันนี้" : thaiDate(n.date)}</small>
        </span>
        {!isRead && <span className="nt-m-dot" aria-label="ยังไม่ได้อ่าน" />}
      </Link>
    );
  };

  return (
    <div className="nt-m-scroll">
      <div className="nt-m-glow" aria-hidden="true" />
      <header className="nt-m-head">
        <button type="button" onClick={onClose} aria-label="ปิด" className="nt-m-back">
          <ChevronLeftIcon strokeWidth={2.3} />
        </button>
        <h1>แจ้งเตือน</h1>
        <button
          type="button"
          className="nt-m-readall"
          disabled={unread === 0}
          onClick={() => markAllRead(notices.map((n) => n.id))}
        >
          อ่านทั้งหมด
        </button>
      </header>

      {notices.length === 0 ? (
        <p className="nt-m-empty">ไม่มีเรื่องค้าง — เคลียร์หมดแล้ว</p>
      ) : (
        <>
          {fresh.length > 0 && (
            <>
              <div className="nt-m-sec">
                <h2>ใหม่</h2>
                <span>{fresh.length > 99 ? "99+" : String(fresh.length).padStart(2, "0")}</span>
              </div>
              <div className="nt-m-list">{fresh.map((n) => item(n, false))}</div>
            </>
          )}
          {old.length > 0 && (
            <>
              <div className="nt-m-sec">
                <h2>ก่อนหน้านี้</h2>
              </div>
              <div className="nt-m-list">{old.map((n) => item(n, true))}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}
