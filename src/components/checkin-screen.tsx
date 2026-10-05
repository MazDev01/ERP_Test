"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  currentStatus,
  dayKey,
  formatClock,
  formatThaiDate,
  formatTime,
  newId,
  recordsOfDay,
  toSessions,
  workedMsOfDay,
  actualMsOfDay,
  type PunchRecord,
} from "@/lib/attendance";
import {
  addRecord,
  getClockServerSnapshot,
  getClockSnapshot,
  getRecordsServerSnapshot,
  getRecordsSnapshot,
  subscribeClock,
  subscribeRecords,
} from "@/lib/attendance-store";
import { bkkOf, parseIsoDate, pad2, toIsoDate, thaiMonth, TH_MONTHS_FULL } from "@/lib/format";
import { leavesOnDate, useLeaveRecords } from "@/lib/leave-store";
import { useRole } from "@/lib/role";
import { expectedInMinutes, expectedOutMinutes, formatMinutes, formatMinutesOfDay, leaveWindowOf, looksForgotten, minutesOfTime, requiredMinutes } from "@/lib/work-schedule";
import { areaSettings, freshFix, judge, locate, meters, useLiveGeo, type LiveGeo, type PunchGeo } from "@/lib/work-area";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, LoginIcon, LogoutIcon, PinIcon, PlusIcon, PowerIcon } from "./icons";
import "@/styles/mobile/checkin.css";

const DOW_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/* เวลาที่เตือนล่วงหน้ามาจากตั้งค่าในหน้าโปรไฟล์ ไม่ใช่ค่าคงที่ในหน้านี้ */

/** ขั้นตรวจพื้นที่ตอนกดเข้างาน — null คือไม่ได้อยู่ระหว่างตรวจ */
type Check =
  | { phase: "locating" }
  /* อยู่นอกพื้นที่ หรือหาพิกัดไม่ได้ — error มีค่าเมื่อหาพิกัดไม่ได้ */
  | { phase: "outside"; geo: PunchGeo; error?: string };

export function CheckinScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const records = useSyncExternalStore(
    subscribeRecords,
    getRecordsSnapshot,
    getRecordsServerSnapshot,
  );
  const tick = useSyncExternalStore(
    subscribeClock,
    getClockSnapshot,
    getClockServerSnapshot,
  );
  const leaveRecords = useLeaveRecords();
  const role = useRole();
  /* ฝึกงานกับแม่บ้านไม่มีเมนูโอทีและบันทึกเวลาทั้งเดือน (ผู้ใช้สั่ง 2 ต.ค. 2569) จึงไม่มีลิงก์ไปสองหน้านั้น */
  const punchOnly = role === "intern" || role === "maid";
  const now = useMemo(() => (tick ? new Date(tick) : null), [tick]);

  const [popOpen, setPopOpen] = useState(false);
  const [done, setDone] = useState<{ title: string; note: string } | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  /* ปิดกล่องระหว่างรอพิกัดแล้วผลมาทีหลัง ต้องไม่บันทึกเข้างานเอง — นับรอบไว้เทียบ */
  const attempt = useRef(0);

  const today = now ? dayKey(now) : null;
  const todayRecords = today ? recordsOfDay(records, today) : [];
  const { isWorking } = currentStatus(records);
  // ตอกได้หลายรอบต่อวัน จึงต้องโชว์รอบล่าสุดเสมอ ไม่งั้นกดแล้วเลขไม่ขยับ
  const lastIn = [...todayRecords].reverse().find((r) => r.type === "in") ?? null;
  const lastOut = [...todayRecords].reverse().find((r) => r.type === "out") ?? null;
  const checkedOut = !isWorking && Boolean(lastOut);
  /* ตำแหน่งสดสำหรับป้ายสถานะ — ติดตามเฉพาะตอนยังไม่ได้เข้างาน */
  const live = useLiveGeo(!isWorking);
  const rounds = toSessions(todayRecords).length;

  const leave = today ? leavesOnDate(leaveRecords, today)[0] : undefined;
  const leaveWindow = leaveWindowOf(leave);
  const expectIn = expectedInMinutes(leaveWindow);
  const expectOut = expectedOutMinutes(leaveWindow);
  const requiredMin = requiredMinutes(leaveWindow);

  const mode: "in" | "out" = isWorking ? "out" : "in";

  /*
   * ตัวเลขของหน้าจอมือถือ (ตามแบบ checkin.html) — ใช้สูตรชุดเดียวกับจอคอม ไม่ได้คิดใหม่
   * workedMin  เวลาที่ทำไปแล้ววันนี้ (หักพักกลางวันตามกติกาเดิม)
   * weekDays   เจ็ดวันของสัปดาห์นี้ วันไหนตอกครบเข้า-ออกแล้วติดดาว
   */
  const workedMin = today
    ? Math.round(workedMsOfDay(todayRecords, tick ?? 0, leaveWindow) / 60000)
    : 0;
  /*
   * วันที่กำลังดูอยู่ในแถบสัปดาห์ (เจ้าของสั่ง 25 ก.ย. 2569 ให้กดย้อนดูวันก่อนหน้าได้)
   * ว่าง = วันนี้ · เลือกวันย้อนหลังแล้วสามช่องเวลาเปลี่ยนตามวันนั้น
   * ตอกบัตรได้เฉพาะวันนี้ วันย้อนหลังจึงเป็นแค่การดู ไม่มีปุ่มกด
   */
  const [seeDay, setSeeDay] = useState("");
  const viewDay = seeDay && seeDay !== today ? seeDay : today;
  const viewIsToday = viewDay === today;
  const viewRecords = viewDay ? recordsOfDay(records, viewDay) : [];
  const viewLeave =
    viewIsToday || !viewDay ? leaveWindow : leaveWindowOf(leavesOnDate(leaveRecords, viewDay)[0]);
  const viewIn = [...viewRecords].reverse().find((r) => r.type === "in") ?? null;
  const viewOut = [...viewRecords].reverse().find((r) => r.type === "out") ?? null;
  const viewWorked = viewDay
    ? Math.round(workedMsOfDay(viewRecords, viewIsToday ? (tick ?? 0) : 0, viewLeave) / 60000)
    : 0;
  const viewRequired = requiredMinutes(viewLeave);
  const viewPct =
    viewRequired > 0 ? Math.min(100, Math.round((viewWorked * 100) / viewRequired)) : 0;

  /* เลื่อนดูสัปดาห์ก่อน ๆ ได้ (0 = สัปดาห์นี้ · ติดลบ = ย้อนหลัง) ไปข้างหน้าเกินสัปดาห์นี้ไม่ได้ */
  const [weekOff, setWeekOff] = useState(0);
  const swipeX = useRef<number | null>(null);

  const weekDays = (() => {
    if (!now) return [];
    const base = bkkOf(now);
    const start = new Date(base);
    start.setDate(base.getDate() - base.getDay() + weekOff * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = toIsoDate(d);
      const rows = recordsOfDay(records, iso);
      return {
        iso,
        day: d.getDate(),
        dow: DOW_SHORT[d.getDay()],
        weekend: d.getDay() % 6 === 0,
        today: iso === today,
        /* ติดดาวเมื่อวันนั้นตอกครบทั้งเข้าและออก — เห็นทั้งสัปดาห์ว่ามีวันไหนค้าง */
        done: rows.some((r) => r.type === "in") && rows.some((r) => r.type === "out"),
      };
    });
  })();

  /* ชื่อเดือนตามสัปดาห์ที่ดูอยู่ — ใช้วันพุธเป็นตัวแทน สัปดาห์คร่อมเดือนจะได้เดือนที่กินวันมากกว่า */
  const monthTitle = weekDays[3] ? thaiMonth(weekDays[3].iso.slice(0, 7)) : "";

  /*
   * สถานะหน้าปัดมือถือ
   * searching ยังไม่เข้างานและยังไม่อยู่ในพื้นที่ (กดไม่ได้) · found อยู่ในพื้นที่ กดเข้างานได้
   * working กำลังทำงาน · done ออกงานแล้ววันนี้ · past ดูวันย้อนหลัง
   * หาพิกัดไม่ได้ (error) ยังให้กดได้ — กล่องที่ขึ้นจะบอกสาเหตุและให้ตรวจใหม่
   */
  const inZone = live.phase === "ready" && live.geo.status === "inside";
  const dial: "searching" | "found" | "working" | "done" | "past" = !viewIsToday
    ? "past"
    : isWorking
      ? "working"
      : checkedOut
        ? "done"
        : inZone || live.phase === "error"
          ? "found"
          : "searching";
  const workedSec = today
    ? Math.floor(workedMsOfDay(todayRecords, tick ?? 0, leaveWindow) / 1000)
    : 0;
  /* ก่อนเวลาเลิกงานกี่นาที — มากกว่า 0 ปุ่มเช็คเอาท์กลายเป็น "ก่อนเวลา" */
  const beforeEnd = isWorking && now ? Math.max(0, expectOut - minutesOfTime(now)) : 0;

  /* สถานะของวันย้อนหลังที่เลือก */
  const viewLeaveRec = viewDay && !viewIsToday ? leavesOnDate(leaveRecords, viewDay)[0] : undefined;
  const pastStatus: { label: string; tone: keyof typeof PAST_TONE } = (() => {
    const firstIn = viewRecords.find((r) => r.type === "in");
    if (!firstIn) return viewLeaveRec ? { label: "ลา", tone: "info" } : { label: "ไม่มีบันทึก", tone: "neutral" };
    if (viewRecords[viewRecords.length - 1]?.type === "in") return { label: "ไม่ได้เช็คเอาท์", tone: "warning" };
    if (minutesOfTime(new Date(firstIn.at)) > expectedInMinutes(viewLeave)) return { label: "มาสาย", tone: "danger" };
    return { label: "ปกติ", tone: "success" };
  })();

  /* สามช่องนี้เปลี่ยนตามวันที่เลือกในแถบสัปดาห์ ไม่ได้ผูกกับวันนี้อย่างเดียว */
  const stats = (
    <>
      <MobStat tone="peach" label="เวลาเข้างาน" value={viewIn ? formatClock(new Date(viewIn.at)) : null} />
      <MobStat tone="rose" label="เวลาออกงาน" value={viewOut ? formatClock(new Date(viewOut.at)) : null} />
      <MobStat tone="lilac" label="รวมชั่วโมง" value={viewWorked ? hhmm(viewWorked) : null} />
    </>
  );

  /*
   * ลืมตอกบัตรออก — เลยเวลาเลิกงานเกินที่ผู้ดูแลตั้งไว้แต่ยังไม่ตอกออก แจ้งเข้า LINE ให้เจ้าตัว
   * ส่งจากหน้าจอที่เปิดอยู่เท่านั้น (ยังไม่มีตัวตั้งเวลาฝั่งเซิร์ฟเวอร์) และส่งได้วันละครั้ง
   */
  const forgot =
    isWorking && now != null && lastIn != null && looksForgotten(new Date(lastIn.at), now);
  useEffect(() => {
  }, [forgot, today, role]);

  const leaveText = leaveWindow
    ? `ลา ${formatMinutesOfDay(leaveWindow.from)}–${formatMinutesOfDay(leaveWindow.to)} น.`
    : "";

  const popAt = now;
  const popMode = mode;
  const popLeave = leaveWindow;
  const popExpectOut = expectedOutMinutes(popLeave);
  const popMin = popAt ? minutesOfTime(popAt) : 0;
  const popEarly = popMode === "out" ? Math.max(0, popExpectOut - popMin) : 0;

  function closePop() {
    attempt.current += 1;
    setPopOpen(false);
    setDone(null);
    setCheck(null);
  }

  /*
   * ข้อความใต้ป้ายตำแหน่ง — บอกเฉพาะเรื่องของผู้ใช้เอง (ลา เลิกงานกี่โมง ออกงานแล้ว)
   * ไม่บอกเวลาที่ระบบจะเด้งเตือน (ผู้ใช้สั่ง 2 ต.ค. 2569 ว่าเป็นการทำงานของระบบ ไม่ต้องให้ผู้ใช้รู้)
   * ไม่มีอะไรต้องบอกคืนค่าว่าง แล้วไม่แสดงกล่องข้อความเลย
   */
  function homeNote() {
    if (requiredMin === 0 && leaveWindow)
      return "วันนี้คุณลาทั้งวัน ไม่ต้องตอกบัตร — ถ้าเข้ามาทำงานก็ตอกได้ตามปกติ";
    if (checkedOut)
      return "ออกงานแล้ววันนี้ — ถ้ากลับเข้ามาทำงานต่อ กดเข้างานได้อีก";
    if (isWorking) return `เลิกงานเวลา ${formatMinutesOfDay(expectOut)} น.`;
    return leaveWindow ? `${leaveText} · เริ่มงาน ${formatMinutesOfDay(expectIn)} น.` : "";
  }

  /*
   * กดเข้างาน — ขอพิกัดก่อนทุกครั้ง อยู่ในรัศมีของที่ทำงานก็บันทึกเลยเหมือนเดิม
   * อยู่นอกรัศมีเข้างานไม่ได้ (ผู้ใช้สั่ง) — ขึ้นกล่องบอกระยะ ให้ลองตรวจใหม่เมื่อถึงที่ทำงาน
   * อ่านที่ทำงานสด ๆ ตอนกด ไม่ใช่จากตอนเปิดหน้า เผื่อผู้ดูแลเพิ่งแก้
   */
  async function checkIn() {
    const rules = areaSettings();
    const mine = ++attempt.current;
    setCheck({ phase: "locating" });
    /* มีพิกัดสดจากป้ายสถานะอยู่แล้ว ใช้ต่อได้เลย ไม่ต้องรอเครื่องหาใหม่ */
    const recent = freshFix(live);
    const got = recent ? { fix: recent } : await locate();
    if (mine !== attempt.current) return;
    if ("error" in got) {
      setCheck({ phase: "outside", geo: { status: "nogps" }, error: got.error });
      return;
    }
    const geo = judge(got.fix, rules);
    if (geo.status === "inside") {
      setCheck(null);
      confirm(geo);
      return;
    }
    setCheck({ phase: "outside", geo });
  }

  function confirm(geo?: PunchGeo) {
    /* ตอนรอพิกัดนาฬิกาเดินไปแล้ว — ใช้เวลาตอนที่บันทึกจริง ไม่ใช่ตอนกดปุ่ม */
    const at = geo ? new Date() : popAt;
    if (!at) return;

    const record: PunchRecord = {
      id: newId(),
      type: popMode,
      at: at.toISOString(),
      note: geo?.why ?? "",
      ...(geo ? { geo } : {}),
    };
    addRecord(record);
    setCheck(null);

    const t = `${formatClock(at)} น.`;
    if (popMode === "out") {
      const dayList = [...todayRecords, { id: "preview", type: "out" as const, at: at.toISOString(), note: "" }];
      /* แสดงชั่วโมงจริง · ที่ขาดคิดจากชั่วโมงในกะเหมือนตอนคิดเงิน */
      const worked = Math.round(actualMsOfDay(dayList, at.getTime()) / 60_000);
      const paid = Math.round(workedMsOfDay(dayList, at.getTime(), popLeave) / 60_000);
      const missing = Math.max(0, requiredMinutes(popLeave) - paid);
      setDone(
        popEarly > 0
          ? {
              title: "บันทึกออกก่อนเวลา",
              note: `ออกงาน ${t} · ทำงาน ${formatMinutes(worked)}${missing ? ` · ขาด ${formatMinutes(missing)}` : ""}`,
            }
          : {
              title: "เช็คเอาท์สำเร็จ",
              note: `บันทึกเวลาออกงาน ${t} เรียบร้อย`,
            },
      );
    } else {
      setDone({
        title: "เช็คอินสำเร็จ",
        note:
          geo?.status === "inside"
            ? `บันทึกเวลาเข้างาน ${t} · อยู่ในพื้นที่ทำงาน`
            : `บันทึกเวลาเข้างาน ${t} เรียบร้อย`,
      });
    }

    /* ป็อปอัพสำเร็จค้างไว้ 4 วินาที (เดิม 1.9) ให้อ่านเวลาที่บันทึกทัน — ผู้ใช้สั่ง 2 ต.ค. 2569 */
    setTimeout(closePop, 4000);
  }

  return (
    <div
      className={
        embedded
          ? ""
          : "flex min-h-dvh items-center justify-center p-0 sm:p-8"
      }
    >
      {/*
        ── โหมดมือถือ (ทำตามแบบ checkin.html · เจ้าของสั่ง 25 ก.ย. 2569) ──
        หัวเดือน+เลื่อนสัปดาห์ · แถบสัปดาห์ติดดาว · หน้าปัดเรดาร์/นาฬิกาดิจิทัล · สามช่องเวลา · ปุ่มเช็คเอาท์
        ตัวเลขและกติกาใช้ชุดเดียวกับจอคอมทั้งหมด เปลี่ยนแค่วิธีแสดงผล
      */}
      <div className="ck-m mx-auto flex w-full max-w-[520px] flex-col gap-4 text-[#2A1F22] md:hidden">
        {/* หัวหน้า — เดือนของสัปดาห์ที่ดูอยู่ · ปุ่มเลื่อนสัปดาห์ · วันนี้กับนาฬิกา · ปุ่มขอโอที */}
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="flex min-w-0 items-center gap-2.5 text-[22px] leading-tight font-bold">
                <CalendarIcon className="size-[22px] flex-none text-[#D0021B]" strokeWidth={2.2} />
                <span className="truncate">{monthTitle || "—"}</span>
              </p>
              <span className="flex flex-none gap-1">
                <button
                  type="button"
                  aria-label="สัปดาห์ก่อน"
                  onClick={() => setWeekOff((w) => w - 1)}
                  className={WEEK_NAV}
                >
                  <ChevronLeftIcon className="size-4" strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  aria-label="สัปดาห์ถัดไป"
                  disabled={weekOff >= 0}
                  onClick={() => setWeekOff((w) => Math.min(0, w + 1))}
                  className={WEEK_NAV}
                >
                  <ChevronRightIcon className="size-4" strokeWidth={2.4} />
                </button>
              </span>
            </div>
            <p className="mt-0.5 text-[12.5px] text-[#6E6164]">
              {today ? thaiDayLong(today) : "—"} ·{" "}
              <b className="num font-bold">{now ? formatClock(now) : "--:--"}</b> น.
            </p>
          </div>
          {/* เปิดหน้าโอที — ดูสถานะคำขอ ชั่วโมงที่อนุมัติ และกดขอโอทีได้ในหน้านั้น */}
          {!punchOnly && (
          <Link
            href="/ot"
            className="flex h-11 flex-none items-center gap-1.5 rounded-full border border-[#EFE3E5] bg-white/70 px-3.5 text-[13.5px] font-semibold whitespace-nowrap text-[#2A1F22] shadow-[0_6px_14px_-6px_rgba(90,20,35,.22),0_1px_2px_rgba(90,20,35,.08)] backdrop-blur-[18px]"
          >
            ขอโอที
            <PlusIcon className="size-4" strokeWidth={2.4} />
          </Link>
          )}
        </header>

        {/* แถบสัปดาห์ — ปัดซ้ายขวาเปลี่ยนสัปดาห์ · กดวันย้อนหลังเพื่อดูเวลาวันนั้น */}
        <nav
          className="grid touch-pan-y grid-cols-7 gap-1.5"
          aria-label="สัปดาห์"
          onTouchStart={(e) => {
            swipeX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            const x0 = swipeX.current;
            swipeX.current = null;
            if (x0 == null) return;
            const dx = e.changedTouches[0].clientX - x0;
            if (dx > 50) setWeekOff((w) => w - 1);
            else if (dx < -50) setWeekOff((w) => Math.min(0, w + 1));
          }}
        >
          {weekDays.map((d) => (
            /* วันข้างหน้ายังไม่มีอะไรให้ดู จึงกดไม่ได้ */
            <button
              key={d.iso}
              type="button"
              disabled={!today || d.iso > today}
              onClick={() => setSeeDay(d.iso === today ? "" : d.iso)}
              aria-current={d.today ? "date" : undefined}
              aria-pressed={d.iso === viewDay}
              aria-label={`ดูเวลาของวันที่ ${d.day}`}
              className={`relative flex flex-col items-center gap-px rounded-[18px] py-2 text-[15px] font-semibold disabled:opacity-45 ${
                d.iso === viewDay
                  ? "border-[1.5px] border-[#C8102E] bg-white shadow-[0_8px_16px_-8px_rgba(200,16,46,.45),0_1px_2px_rgba(90,20,35,.08)]"
                  : `border border-[#EFE3E5] shadow-[0_6px_14px_-6px_rgba(90,20,35,.22),0_1px_2px_rgba(90,20,35,.08)] backdrop-blur-[18px] ${
                      d.weekend ? "bg-white/45 text-[#A3979A]" : "bg-white/70"
                    }`
              }`}
            >
              {d.day}
              <small className={`text-[10.5px] font-medium ${d.today ? "text-[#D0021B]" : "text-[#A3979A]"}`}>
                {d.dow}
              </small>
              {d.done && (
                /* ดาวบอกว่าวันนั้นลงเวลาครบทั้งเข้าและออก */
                <svg
                  viewBox="0 0 24 24"
                  className="ck-m-star absolute -top-[7px] -right-[5px] size-5"
                  role="img"
                  aria-label="ลงเวลาครบ"
                >
                  <path
                    d="M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"
                    fill="#F5B21B"
                    stroke="#ffffff"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ))}
        </nav>

        {/* หน้าปัด — ค้นหาพื้นที่ (เรดาร์) · พบพื้นที่ (ปุ่มแดง) · กำลังทำงาน · ออกงานแล้ว · ดูวันย้อนหลัง */}
        <section className="relative isolate mx-auto mt-1.5 aspect-square w-[min(290px,78vw)]">
          {/* เรดาร์สามวงกระจายอยู่หลังปุ่ม ต้องเป็นลูกสามตัวแรกของ section (หน่วงเวลาตามลำดับ) */}
          {dial === "searching" && [0, 1, 2].map((i) => <span key={i} className="ck-m-pulse" aria-hidden="true" />)}
          {(dial === "working" || dial === "done" || dial === "past") && (
            <svg viewBox="0 0 120 120" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
              <circle
                cx="60"
                cy="60"
                r="45.3"
                fill="none"
                stroke="#D0021B"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={RING}
                strokeDashoffset={dial === "done" ? 0 : RING * (1 - viewPct / 100)}
                style={{ transition: "stroke-dashoffset .6s ease" }}
              />
            </svg>
          )}
          {dial === "past" || dial === "working" ? (
            /* ระหว่างทำงานและวันย้อนหลังเป็นแค่การแสดงผล — ออกงานใช้ปุ่มเช็คเอาท์ด้านล่าง */
            <div className={`${DIAL_FACE} ${DIAL_RING_SHADOW}`}>
              {dial === "working" ? (
                <>
                  <span className="mb-3 text-[12.5px] text-[#6E6164]">เวลาทำงาน</span>
                  <Digital text={hhmmss(workedSec)} />
                </>
              ) : (
                <>
                  <span className="text-[12.5px] text-[#6E6164]">ชั่วโมงทำงาน</span>
                  {viewWorked ? (
                    <Digital text={hhmm(viewWorked)} />
                  ) : (
                    <b className="text-center text-[28px] leading-tight font-bold text-[#6E6164]">
                      {viewLeaveRec ? "วันลา" : "ไม่มีชั่วโมงทำงาน"}
                    </b>
                  )}
                </>
              )}
            </div>
          ) : (
            /* ออกงานแล้ววันนี้ยังกดได้ — กลับเข้ามาทำงานต่อ เข้างานได้อีกรอบตามกติกาเดิม */
            <button
              type="button"
              disabled={!now || dial === "searching"}
              onClick={() => {
                setPopOpen(true);
                void checkIn();
              }}
              className={`${DIAL_FACE} transition-[background,box-shadow,transform] duration-[450ms,450ms,150ms] active:scale-[0.97] disabled:active:scale-100 ${
                dial === "found"
                  ? "bg-[#C8102E] shadow-[0_0_0_12px_rgba(200,16,46,.14),0_0_0_26px_rgba(200,16,46,.07),0_26px_44px_-18px_rgba(200,16,46,.85)]"
                  : dial === "done"
                    ? DIAL_RING_SHADOW
                    : "shadow-[0_6px_12px_-8px_rgba(142,0,18,.35)]"
              }`}
            >
              {dial === "done" ? (
                <>
                  <span className="text-[12.5px] text-[#6E6164]">วันนี้ทำงาน</span>
                  <Digital text={hhmm(workedMin)} />
                  <span
                    className={`mt-1.5 rounded-full px-[11px] py-[5px] text-[12px] font-semibold ${
                      workedMin >= requiredMin
                        ? "bg-[#DDF2E6] text-[#14875A]"
                        : "bg-[#FDEDD6] text-[#B4630B]"
                    }`}
                  >
                    {workedMin >= requiredMin
                      ? "ครบเวลาแล้ว"
                      : `ขาด ${formatMinutes(Math.max(0, requiredMin - workedMin))}`}
                  </span>
                </>
              ) : (
                <>
                  <b
                    className={`text-[34px] leading-tight font-bold transition-colors duration-[450ms] ${
                      dial === "found" ? "text-white" : "text-[#C8102E]"
                    }`}
                  >
                    เข้างาน
                  </b>
                  <span
                    className={`px-6 text-center text-[12.5px] leading-snug transition-colors duration-[450ms] ${
                      dial === "found" ? "text-white/90" : "text-[#6E6164]"
                    }`}
                  >
                    {dial === "found"
                      ? live.phase === "error"
                        ? "เปิดตำแหน่งเพื่อเข้างาน"
                        : "แตะเพื่อบันทึกเวลาเข้างาน"
                      : "กำลังค้นหาพื้นที่ทำงาน…"}
                  </span>
                </>
              )}
            </button>
          )}
        </section>

        {/* สามช่องเวลา — วันย้อนหลังมีหัวบอกวันและสถานะของวันนั้นเพิ่ม */}
        {viewIsToday ? (
          <div className="grid grid-cols-3 gap-2.5">{stats}</div>
        ) : (
          <section className="flex flex-col gap-2.5" aria-live="polite">
            <div className="flex items-center justify-between gap-2.5">
              <span className="flex flex-wrap items-center gap-2 text-[14px]">
                <b>{viewDay ? thaiDayLong(viewDay) : ""}</b>
                <span className={`rounded-full px-[9px] py-[3px] text-[12px] font-bold ${PAST_TONE[pastStatus.tone]}`}>
                  {pastStatus.label}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setSeeDay("");
                  setWeekOff(0);
                }}
                className="h-[34px] flex-none rounded-full border border-[#EFE3E5] bg-white px-3.5 text-[13px] font-semibold text-[#B0101F] shadow-[0_3px_8px_-4px_rgba(90,20,35,.25)]"
              >
                กลับวันนี้
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2.5">{stats}</div>
          </section>
        )}

        {/* ส่วนปุ่ม — วันย้อนหลังไม่มี · กำลังทำงานมีปุ่มเช็คเอาท์ · อื่น ๆ เป็นข้อความแนะนำ (ซ่อนตอนยังค้นหาพื้นที่) */}
        {viewIsToday &&
          (isWorking ? (
            <section className="relative">
              {beforeEnd > 0 && (
                <span className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 rounded-[9px] bg-[#2A1F22] px-[11px] py-1.5 text-[12px] whitespace-nowrap text-white after:absolute after:top-full after:left-1/2 after:-ml-[5px] after:border-[5px] after:border-transparent after:border-t-[#2A1F22] after:content-['']">
                  เวลาเลิกงาน {formatMinutesOfDay(expectOut)} น. อีก {formatMinutes(beforeEnd)}
                </span>
              )}
              <button
                type="button"
                disabled={!now}
                onClick={() => setPopOpen(true)}
                className={`h-[52px] w-full rounded-[16px] text-[15px] font-bold transition-transform active:scale-[0.98] disabled:opacity-50 ${
                  beforeEnd > 0
                    ? "bg-white text-[#D0021B] shadow-[inset_0_0_0_1.5px_#D0021B]"
                    : "bg-[#D0021B] text-white shadow-[0_12px_22px_-12px_rgba(208,2,27,.9)]"
                }`}
              >
                {beforeEnd > 0 ? "เช็คเอาท์ก่อนเวลา" : "เช็คเอาท์"}
              </button>
            </section>
          ) : dial !== "searching" && homeNote() ? (
            <p className="rounded-[22px] border border-white/95 bg-white/70 px-3.5 py-3 text-center text-[13px] leading-normal text-[#6E6164] shadow-[0_12px_30px_-22px_rgba(140,20,40,.45)] backdrop-blur-[18px]">
              {homeNote()}
            </p>
          ) : null)}

        {!embedded && !punchOnly && (
          <Link href="/records" className="btn glass-thin btn-mini w-full justify-center">
            ดูตารางเวลาทำงานทั้งเดือน
            <ChevronRightIcon className="size-3.5" strokeWidth={2.4} />
          </Link>
        )}
      </div>

      <main
        className={`glass w-full overflow-hidden max-md:hidden lg:grid lg:grid-cols-2 ${
          embedded
            ? /* สูงเต็มพื้นที่ที่เหลือใต้แถบบนและแท็บ ไม่เหลือที่ว่างด้านล่าง (ผู้ใช้สั่ง 2 ต.ค. 2569)
                 224px = แถบบน 72 + แท็บ ตอกบัตร/บันทึกเวลา และระยะห่างบนล่างของหน้า */
              "rounded-2xl lg:min-h-[calc(100dvh-224px)]"
            : "max-w-[460px] rounded-none sm:rounded-[28px] lg:max-w-[920px]"
        }`}
      >

        {/* ── ฝั่งแดง: นาฬิกา ── */}
        <section className="checkin-top relative px-7 pt-[26px] pb-[74px] text-center text-white lg:flex lg:flex-col lg:justify-center lg:py-14 lg:pr-[136px] lg:pb-14 lg:pl-6">
          <span
            className="pointer-events-none absolute bottom-0 left-1/2 z-0 h-[100px] w-[112%] -translate-x-1/2 translate-y-1/2 rounded-[50%] bg-white lg:top-0 lg:bottom-auto lg:left-full lg:h-full lg:w-[160px] lg:translate-y-0 lg:-translate-x-1/2"
            aria-hidden="true"
          />
          {/* ไม่มีคำว่า MAZ เหนือคำทักทายแล้ว (ผู้ใช้สั่ง 2 ต.ค. 2569) */}
          <p className="relative z-10 text-[15px] text-white/80 lg:text-base">
            {greeting(now)}
          </p>
          <p className="num relative z-10 mt-0.5 text-[38px] leading-tight font-semibold sm:text-[44px] lg:text-[52px]">
            {now ? formatTime(now) : "--:--:--"}
          </p>
          <p className="relative z-10 text-sm text-white/75 lg:text-[15px]">
            {now ? formatThaiDate(now) : "—"}
          </p>
        </section>

        {/* ── ฝั่งขาว: สถานะและปุ่ม ── */}
        <section className="relative z-10 px-6 pt-16 pb-7 text-center sm:px-7 lg:flex lg:flex-col lg:justify-center lg:py-14 lg:pr-20 lg:pl-12">
          <AreaBadge
            checkedOut={checkedOut}
            isWorking={isWorking}
            geo={lastIn?.geo}
            live={live}
          />

          {homeNote() && (
            <p className="mt-3.5 text-sm leading-relaxed text-muted-foreground lg:text-[14.5px]">
              {homeNote()}
            </p>
          )}

          <button
              type="button"
              disabled={!now}
              onClick={() => {
                /*
                 * เข้างาน = กดแล้วบันทึกเลย ไม่ต้องถามยืนยัน (ยกเว้นอยู่นอกพื้นที่)
                 * ของเดิมขึ้นกล่องถามก่อน ซึ่งกลายเป็นหน้าประจานว่ามาสายทุกเช้าที่มาสาย
                 * และเพิ่มขั้นตอนโดยไม่ได้อะไร เพราะยังไงคนก็กดยืนยันอยู่แล้ว
                 * ออกงานยังถามอยู่ เพราะกดพลาดแล้วเท่ากับจบวันทำงาน ย้อนไม่ได้
                 */
                setPopOpen(true);
                if (!isWorking) void checkIn();
              }}
              className={[
                "mx-auto mt-5 flex h-14 w-full max-w-xs items-center justify-center gap-2.5",
                "rounded-full text-lg font-semibold text-white",
                "transition-transform active:scale-[0.98] disabled:opacity-50",
                isWorking
                  ? "bg-[var(--brand-700)] hover:brightness-110"
                  : "bg-primary hover:bg-primary-hover",
              ].join(" ")}
            >
              <PowerIcon className="size-6" strokeWidth={2} />
              {isWorking ? "ออกงาน" : "เข้างาน"}
            </button>

          {/* ไม่มีเส้นคั่นเหนือกล่องเวลาแล้ว (ผู้ใช้สั่ง 2 ต.ค. 2569) */}
          <div className="mt-6 grid grid-cols-2 gap-3 lg:mt-7">
            <Slot
              label={rounds > 1 ? `เข้างาน (รอบที่ ${rounds})` : "เวลาเข้างาน"}
              value={lastIn ? formatClock(new Date(lastIn.at)) : null}
            />
            <Slot
              label="เวลาออกงานล่าสุด"
              value={lastOut ? formatClock(new Date(lastOut.at)) : null}
            />
          </div>

          {!embedded && !punchOnly && (
            <Link href="/records" className="btn glass-thin btn-mini mt-6">
              ดูตารางเวลาทำงานทั้งเดือน
              <ChevronRightIcon className="size-3.5" strokeWidth={2.4} />
            </Link>
          )}

        </section>
      </main>

      {/* กล่องตอกบัตร — ยิงออกไปที่ body เพราะการ์ดตอกบัตรมี backdrop-filter
          ซึ่งกลายเป็นกรอบอ้างอิงของ position: fixed ทำให้ฉากหลังคลุมแค่การ์ด */}
      {popOpen && popAt && typeof document !== "undefined" &&
        createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pop-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !done) closePop();
          }}
        >
          <div className="pop-in w-full max-w-[340px] rounded-[26px] bg-white px-[26px] pt-0 pb-7 text-center">
            {done ? (
              <div className="pop-rise flex flex-col items-center">
                <div className="relative -mt-12 flex size-[92px] items-center justify-center">
                  <span
                    className="halo absolute size-[92px] rounded-full bg-[var(--success)]"
                    aria-hidden="true"
                  />
                  <svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label="สำเร็จ">
                    <circle cx="46" cy="46" r="36" fill="#189a30" />
                    <path
                      className="tick"
                      d="M30 47 L41 58 L62 36"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="6.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h2 className="mt-3.5 text-2xl font-semibold">{done.title}</h2>
                <p className="mt-2 text-[14.5px] text-muted-foreground">{done.note}</p>
              </div>
            ) : check?.phase === "locating" ? (
              <div className="flex flex-col items-center pt-7" aria-live="polite">
                <span className="relative grid size-16 place-items-center rounded-full bg-[var(--warning-soft)] text-primary">
                  <span className="halo absolute size-16 rounded-full bg-primary/25" aria-hidden="true" />
                  <PinIcon className="relative size-7" strokeWidth={2} />
                </span>
                <h2 id="pop-title" className="mt-4 text-xl font-semibold">
                  กำลังตรวจพื้นที่
                </h2>
                <p className="mt-2 text-[14px] text-muted-foreground">
                  ขอตำแหน่งจากเครื่องเพื่อยืนยันว่าอยู่ในพื้นที่ทำงาน
                </p>
                <button
                  type="button"
                  onClick={closePop}
                  className="mt-6 h-[48px] w-full rounded-[24px] bg-secondary text-[15px] font-semibold text-muted-foreground"
                >
                  ยกเลิก
                </button>
              </div>
            ) : check?.phase === "outside" ? (
              <OutsidePanel check={check} onRetry={() => void checkIn()} onCancel={closePop} />
            ) : popMode === "in" ? (
              /* เข้างานที่ไม่ต้องตรวจพื้นที่บันทึกไปแล้ว รอกล่องสำเร็จขึ้น */
              null
            ) : (
              <>
                <div className="-mt-14 flex justify-center">
                  <FaceOut />
                </div>
                <h2 id="pop-title" className="mt-1.5 text-2xl font-semibold">
                  {popEarly > 0 ? "ออกก่อนเวลา" : "เลิกงานแล้ว"}
                </h2>
                <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">
                  {popEarly > 0
                    ? `ออกเวลา ${formatClock(popAt)} น. · เร็วกว่ากำหนด ${formatMinutes(popEarly)}`
                    : "ขอบคุณสำหรับวันนี้ พักผ่อนเยอะ ๆ นะ"}
                </p>

                <div className="mt-[26px] flex gap-3">
                  <button
                    type="button"
                    onClick={closePop}
                    className="h-[54px] flex-1 rounded-[27px] bg-secondary text-base font-semibold text-muted-foreground transition-transform active:scale-95"
                  >
                    ยังไม่ใช่ตอนนี้
                  </button>
                  <button
                    type="button"
                    onClick={() => confirm()}
                    className="btn-solid h-[54px] flex-1 rounded-[27px] text-base font-semibold transition-transform active:scale-95"
                  >
                    เช็คเอาท์
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
          document.body,
        )}
    </div>
  );
}

/** ป้ายบอกสถานะพื้นที่ใต้หัวการ์ด */
function AreaBadge({
  checkedOut,
  isWorking,
  geo,
  live,
}: {
  checkedOut: boolean;
  isWorking: boolean;
  geo?: PunchGeo;
  live: LiveGeo;
}) {
  /* ยังไม่ได้เข้างาน (รวมออกงานแล้ว จะกลับเข้ามาอีกรอบได้) — บอกตามตำแหน่งสดว่าตอนนี้อยู่ในพื้นที่ไหม */
  const where = (): readonly ["neutral" | "success" | "warning", string] => {
    if (live.phase === "locating") return ["neutral", "กำลังตรวจตำแหน่ง…"];
    if (live.phase === "error") return ["warning", "เปิดตำแหน่งเพื่อเข้างาน"];
    const g = live.geo;
    /* ผู้ใช้สั่ง — บอกแค่ว่าอยู่ในพื้นที่ ไม่ต้องต่อท้ายชื่อบริษัท */
    if (g.status === "inside") return ["success", "อยู่ในพื้นที่ทำงาน"];
    if (g.status === "weak") return ["warning", "สัญญาณ GPS ไม่แม่น"];
    return ["warning", `อยู่นอกพื้นที่ทำงาน · ห่าง ${meters(g.dist ?? 0)}`];
  };
  const [tone, text] = isWorking
    ? geo?.status === "inside"
      ? (["success", "เข้างานในพื้นที่ทำงาน"] as const)
      : geo && geo.status !== "off"
        ? (["warning", "เข้างานนอกพื้นที่"] as const)
        : (["success", "กำลังทำงาน"] as const)
    : checkedOut && live.phase !== "ready"
      ? (["neutral", "ออกงานแล้ว"] as const)
      : where();
  const skin = {
    neutral: "bg-[var(--neutral-soft)] text-[var(--neutral)]",
    success: "bg-[var(--success-soft)] text-[var(--success)]",
    warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
  }[tone];
  return (
    <span
      className={`inline-flex max-w-full items-center gap-2.5 self-center rounded-[20px] px-[18px] py-2.5 text-sm font-medium ${skin}`}
    >
      {!isWorking ? (
        <PinIcon className="size-4 shrink-0" strokeWidth={2.2} />
      ) : (
        <i className="size-2 shrink-0 rounded-full bg-current" aria-hidden="true" />
      )}
      {/* ชื่อที่ทำงานยาว — ให้ขึ้นบรรทัดใหม่ ไม่ตัดท้าย คนจะได้เห็นว่าอยู่ในพื้นที่ของที่ไหน */}
      <span className="min-w-0 text-left leading-snug break-words">{text}</span>
    </span>
  );
}

/** กล่องตอนอยู่นอกพื้นที่ หรือหาพิกัดไม่ได้ — เข้างานไม่ได้ ให้ลองตรวจใหม่ */
function OutsidePanel({
  check,
  onRetry,
  onCancel,
}: {
  check: { geo: PunchGeo; error?: string };
  onRetry: () => void;
  onCancel: () => void;
}) {
  const { geo, error } = check;
  const title = error
    ? "หาตำแหน่งไม่ได้"
    : geo.status === "weak"
      ? "สัญญาณ GPS ไม่แม่นพอ"
      : "อยู่นอกพื้นที่ทำงาน";
  const detail = error
    ? error
    : geo.status === "weak"
      ? `ตำแหน่งคลาดเคลื่อนประมาณ ${meters(geo.acc ?? 0)} · ลองขยับไปที่โล่งแล้วตรวจใหม่`
      : `ห่างจากที่ทำงาน ${meters(geo.dist ?? 0)}`;

  return (
    <div className="pt-7 text-left">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--warning-soft)] text-[var(--warning)]">
        <PinIcon className="size-7" strokeWidth={2} />
      </span>
      <h2 id="pop-title" className="mt-4 text-center text-xl font-semibold">
        {title}
      </h2>
      <p className="mt-2 text-center text-[14px] leading-relaxed text-muted-foreground">{detail}</p>

      <p className="mt-4 rounded-[12px] bg-[var(--destructive-soft)] px-3.5 py-2.5 text-center text-[13px] text-destructive">
        ต้องอยู่ในพื้นที่ทำงานจึงจะเข้างานได้ · ติดต่อหัวหน้าหากทำงานนอกสถานที่
      </p>

      <div className="mt-5 flex gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="h-[50px] flex-1 rounded-[25px] bg-secondary text-[15px] font-semibold text-muted-foreground"
        >
          ปิด
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="btn-solid h-[50px] flex-1 rounded-[25px] text-[15px] font-semibold"
        >
          ตรวจใหม่
        </button>
      </div>
    </div>
  );
}

function Slot({ label, value }: { label: string; value: string | null }) {
  return (
    /* เตี้ยลงตามที่ผู้ใช้สั่ง 2 ต.ค. 2569 — ระยะบนล่าง 14 → 8px ตัวเลข 21 → 19px */
    <div className="glass-thin rounded-[14px] px-2.5 py-2">
      <span className="block text-[12.5px] text-muted-foreground">{label}</span>
      <b
        className={`num mt-0.5 block text-[19px] ${
          value ? "font-semibold" : "font-normal text-muted-foreground"
        }`}
      >
        {value ?? "--:--"}
      </b>
    </div>
  );
}

/* now เป็นชั่วขณะจริง — ต้องแปลงเป็นหน้าปัดไทยก่อน ไม่งั้นเครื่องนอกไทยทักทายผิดช่วง */
function greeting(now: Date | null) {
  if (!now) return "สวัสดี";
  const h = bkkOf(now).getHours();
  if (h < 12) return "สวัสดี ตอนเช้า";
  if (h < 17) return "สวัสดี ตอนบ่าย";
  return "สวัสดี ตอนเย็น";
}

// ─── หน้าตัวการ์ตูน ───────────────────────────────────────────────
function Dots() {
  return (
    <>
      <circle className="bob" cx="30" cy="44" r="6" fill="#F5A8B2" />
      <circle className="bob b" cx="150" cy="56" r="5" fill="#FAD2D7" />
      <circle className="bob b" cx="26" cy="114" r="4.5" fill="#FAD2D7" />
      <circle className="bob" cx="152" cy="116" r="7" fill="#F5A8B2" />
      <circle cx="88" cy="80" r="48" fill="#FBE6E9" />
    </>
  );
}

function FaceOut() {
  return (
    <svg width="176" height="150" viewBox="0 0 176 150" role="img" aria-label="หน้าเหนื่อยแต่ยิ้ม">
      <Dots />
      <g className="bow">
        <circle cx="88" cy="80" r="42" fill="#EE9A4D" />
        <g fill="none" stroke="#3B3B4F" strokeWidth="3.4" strokeLinecap="round" opacity=".75">
          <path d="M64 60 Q74 56 84 61" />
          <path d="M112 60 Q102 56 92 61" />
        </g>
        <g fill="none" stroke="#3B3B4F" strokeWidth="4" strokeLinecap="round">
          <path d="M66 72 Q74 80 82 72" />
          <path d="M94 72 Q102 80 110 72" />
        </g>
        <ellipse cx="63" cy="88" rx="8" ry="5" fill="#E06A6A" opacity=".55" />
        <ellipse cx="113" cy="88" rx="8" ry="5" fill="#E06A6A" opacity=".55" />
        <path d="M76 94 Q88 106 100 94 Q88 100 76 94 Z" fill="#3B3B4F" />
        <path d="M76 94 Q88 106 100 94" fill="none" stroke="#3B3B4F" strokeWidth="3.6" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/* ช่องเวลาเล็กสามช่องบนมือถือ (ตามแบบ .ck-stat) — ยังไม่มีค่าก็ยังเห็นหัวข้อ ไม่หายไปทั้งช่อง */
function MobStat({
  tone,
  label,
  value,
}: {
  tone: "peach" | "rose" | "lilac";
  label: string;
  value: string | null;
}) {
  const [skin, Icon] = {
    peach: ["bg-[#FDEDD6] text-[#B4630B]", LoginIcon],
    rose: ["bg-[#FCE3E7] text-[#C0121F]", LogoutIcon],
    lilac: ["bg-[#ECE6FA] text-[#5B3FBF]", ClockIcon],
  }[tone];
  return (
    <div className="relative flex min-h-[98px] flex-col justify-between overflow-hidden rounded-[20px] border border-white/95 bg-white/70 p-3 shadow-[0_12px_30px_-22px_rgba(140,20,40,.45)] backdrop-blur-[18px]">
      {/* ลายจุดมุมขวาบน ตามแบบ */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-1.5 -right-1.5 size-[70px] opacity-50 [background-image:radial-gradient(rgba(208,2,27,.18)_1.2px,transparent_1.4px)] [background-size:9px_9px]"
      />
      <span className={`relative grid size-[30px] place-items-center rounded-[10px] ${skin}`}>
        <Icon className="size-4" strokeWidth={2.4} />
      </span>
      <b className={`num relative mt-2 text-[20px] font-bold ${value ? "" : "text-[#A3979A]"}`}>
        {value ?? "--:--"}
      </b>
      <span className="relative text-[12px] text-[#6E6164]">{label}</span>
    </div>
  );
}

// ─── ชิ้นส่วนของหน้าจอมือถือ ───────────────────────────────────────
const WEEK_NAV =
  "grid size-[30px] place-items-center rounded-full border border-[#EFE3E5] bg-white text-[#2A1F22] shadow-[0_3px_8px_-4px_rgba(90,20,35,.25)] disabled:opacity-35";
const DIAL_FACE =
  "absolute inset-[14%] flex flex-col items-center justify-center gap-1 rounded-full bg-white disabled:cursor-default";
/** เงาหน้าปัดตอนมีวงแหวนเวลา (กำลังทำงาน · ออกงานแล้ว · วันย้อนหลัง) */
const DIAL_RING_SHADOW =
  "shadow-[0_22px_40px_-16px_rgba(90,20,35,.38),0_6px_14px_-6px_rgba(90,20,35,.18)]";
/** เส้นรอบวงของวงแหวน r = 45.3 */
const RING = 2 * Math.PI * 45.3;
const PAST_TONE = {
  success: "bg-[#DDF2E6] text-[#0F7049]",
  danger: "bg-[#FCE3E7] text-[#B0101F]",
  warning: "bg-[#FDEDD6] text-[#94500A]",
  info: "bg-[#E3EEFC] text-[#1A5DB5]",
  neutral: "bg-[#EFEBEC] text-[#5E5255]",
};
const DOW_LONG = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

/** "2026-10-02" → "วันศุกร์ที่ 2 ตุลาคม 2569" */
function thaiDayLong(iso: string) {
  const d = parseIsoDate(iso);
  return `วัน${DOW_LONG[d.getDay()]}ที่ ${d.getDate()} ${TH_MONTHS_FULL[d.getMonth()]} ${d.getFullYear() + 543}`;
}
const hhmm = (min: number) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
const hhmmss = (sec: number) =>
  `${pad2(Math.floor(sec / 3600))}:${pad2(Math.floor((sec % 3600) / 60))}:${pad2(sec % 60)}`;

/*
 * นาฬิกาดิจิทัลเจ็ดขีด (เรขาคณิตเดียวกับแบบ checkin.html) — ขีดที่ไม่ติดจาง 7% · เอียง -7°
 * กว้าง 72% ของหน้าปัด สูงไม่เกิน 44px · สีตามหน้าปัด #5A4B4F
 */
const hbar = (x1: number, x2: number, y: number) =>
  `${x1},${y + 3} ${x1 + 3},${y} ${x2 - 3},${y} ${x2},${y + 3} ${x2 - 3},${y + 6} ${x1 + 3},${y + 6}`;
const vbar = (x: number, y1: number, y2: number) =>
  `${x + 3},${y1} ${x + 6},${y1 + 3} ${x + 6},${y2 - 3} ${x + 3},${y2} ${x},${y2 - 3} ${x},${y1 + 3}`;
const SEG_GEO: Record<string, string> = {
  a: hbar(3, 27, 0), g: hbar(3, 27, 23), d: hbar(3, 27, 46),
  f: vbar(0, 3, 26), b: vbar(24, 3, 26), e: vbar(0, 26, 49), c: vbar(24, 26, 49),
};
const DIGIT_ON: Record<string, string> = {
  "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc",
  "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcdfg",
};
function Digital({ text }: { text: string }) {
  let x = 0;
  const parts = [...text].map((ch, i) => {
    const at = x;
    if (ch === ":") {
      x += 12;
      return (
        <g key={i} transform={`translate(${at},0)`}>
          <rect x="1" y="14" width="6" height="6" rx="1.2" />
          <rect x="1" y="33" width="6" height="6" rx="1.2" />
        </g>
      );
    }
    x += 36;
    const on = DIGIT_ON[ch] ?? "";
    return (
      <g key={i} transform={`translate(${at},0)`}>
        {"abcdefg".split("").map((k) => (
          <polygon key={k} points={SEG_GEO[k]} className={on.includes(k) ? undefined : "off"} />
        ))}
      </g>
    );
  });
  return (
    <span className="ck-m-digits block w-full leading-none text-[#5A4B4F]">
      <svg
        viewBox={`-9 -1 ${x + 10} 54`}
        fill="currentColor"
        role="img"
        aria-label={text}
        className="mx-auto block h-auto max-h-[44px] w-[72%]"
      >
        <g transform="skewX(-7)">{parts}</g>
      </svg>
    </span>
  );
}
