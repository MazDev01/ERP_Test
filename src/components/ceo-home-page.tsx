"use client";

/*
 * หน้าหลักของ CEO (ต้นแบบ dose-erp-maz/ceo-home.html) — มีไว้สำหรับมือถือเท่านั้น
 * คำทักทาย + ภาพประกอบ (mh-art) + การ์ดเมนูตามเมนูข้างของ CEO
 * จอกว้างกว่า 640px เด้งไปเมนูแรกของบทบาท (ต้นแบบ toDesktop) เพราะมีเมนูข้างอยู่แล้ว
 * แถบล่างสามช่อง (หน้าหลัก / บัญชีของฉัน / แจ้งเตือน) และแผ่นเมนูบัญชีมาจากเปลือกแอป (app-shell)
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { mobileHomeOf, navItemsOf, useMenuAccess, type NavItem } from "@/lib/nav";
import { ROLE_EMPLOYEE, useMyMine, useMyRoles } from "@/lib/hr-link";
import { useHydrated } from "@/lib/pwa";
import { useProfile } from "@/lib/profile-data";
import { useProfilePhoto } from "@/lib/profile-store";
import { approvers, roleLabel, useApprovalRoute, useRole, type Role } from "@/lib/role";
import Image from "next/image";
import { bkkNow, daysBetween, greetNow, thaiDate, thaiMonth, toIsoDate, todayIso } from "@/lib/format";
import { ICONS } from "./app-shell";
import {
  BillingIcon,
  ChevronRightIcon,
  ClockIcon,
  HomeIcon,
  InboxIcon,
  LeadsIcon,
  LeaveIcon,
  ReceiptIcon,
  SearchIcon,
  TasksIcon,
  UsersIcon,
} from "./icons";
import { NotificationMenu } from "./notification-menu";
import { AccMobileHome } from "./acc-home-mobile";
import { awaitingReceipt, invoiceDue, seqStatus, useAcc } from "@/lib/acc-store";
import { useHr } from "@/lib/hr-store";
import { inPeriod, inRange, isDaily, probEnd, rangeLabel } from "@/lib/hr-data";
import { usePm } from "@/lib/pm-store";
import { isJobOf } from "@/lib/pm-data";
import { USERS } from "@/lib/mock-data";
import { useCrm } from "@/lib/crm-store";
import { buildReport } from "@/lib/sales-report";
import { leaveUsage, useLeaveRecords } from "@/lib/leave-store";
import { fmtLeave } from "@/lib/leave-data";
import { getRecordsServerSnapshot, getRecordsSnapshot, subscribeRecords } from "@/lib/attendance-store";
import { formatClock, recordsOfDay } from "@/lib/attendance";
import { WORK_SCHEDULE } from "@/lib/work-schedule";
import { initialOf, useNameOf } from "@/lib/emp-name";
import "@/styles/mobile/home.css";

export function CeoHomePage() {
  return <RoleHomePage />;
}

/*
 * /home — หน้าหลักการ์ดเมนูของบทบาทที่ไม่มีหน้าหลักเป็นของตัวเอง
 * ทีมงานกับ CEO มีหน้าหลักของตัวเอง (my-home · ceo-home) เปิด /home แล้วพาไปหน้านั้นแทน
 * ไม่งั้นลิงก์เก่าหรือที่อยู่ที่พิมพ์เองจะไปจบที่หน้า "ไม่ได้อยู่ในเมนู"
 */
export function HomePage() {
  const router = useRouter();
  const role = useRole();
  const hydrated = useHydrated();
  /* บทบาทอ่านจาก localStorage — ย้ายหลัง hydrate เท่านั้น ไม่งั้นเด้งตามค่าเริ่มต้นฝั่งเซิร์ฟเวอร์ */
  const mine = mobileHomeOf(role);
  useEffect(() => {
    if (hydrated && mine !== "/home") router.replace(mine);
  }, [hydrated, mine, router]);
  return <RoleHomePage />;
}

/*
 * หน้าหลักการ์ดเมนูบนมือถือของทุกบทบาท (ผู้ใช้สั่ง 22 ก.ย. 2569 ให้ทุกบทบาทเป็นแบบหน้าหลัก CEO)
 * การ์ดสร้างจากเมนูข้างของบทบาท จึงตรงกับเมนูเสมอ รวมกลุ่ม "ของฉัน" ด้วย
 */
export function RoleHomePage() {
  const router = useRouter();
  const role = useRole();
  const roles = useMyRoles();
  const access = useMenuAccess();
  const route = useApprovalRoute();
  /* ทักทายด้วยชื่อเล่น เหมือนเมนูผู้ใช้ด้านบน (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  const nameOf = useNameOf();
  const prof = useProfile();
  const me = { ...prof, name: nameOf(prof.name) };
  /* การ์ดตรงกับเมนูข้างเสมอ ไม่กรองทิ้งรายการไหน — มือถือกับจอกว้างจะได้เห็นหน้าชุดเดียวกัน
     (เดิมตัดโอทีกับสลิปเงินเดือนของทีมงานออกตามต้นแบบ my-home.html ที่มีแค่ห้าการ์ด
      แต่ต้นแบบนั้นไม่มีสองเมนูนี้ในเมนูข้างด้วย พอระบบจริงมี คนที่ใช้แต่มือถือจึงหาสลิปของตัวเองไม่เจอ) */
  const mine = useMyMine();
  const menu = navItemsOf(roles, access, route, mine);
  /* บนจอกว้างไปเมนูแรกที่เป็นงานของบทบาท — ข้ามหน้าตอกบัตรเพราะมีแถบข้างอยู่แล้ว */
  const first = menu.find((i) => i.href !== "/")?.href ?? "/";
  /* การ์ดหน้าหลัก (มือถือ) รวม "ผู้สนใจ" กับ "ใบเสนอราคา" เป็นการ์ดเดียว (ผู้ใช้สั่ง 29 ก.ย. 2569)
     จอคอมยังใช้สองเมนูเดิมในแถบข้าง — รวมเฉพาะเมื่อเห็นทั้งสองเมนู (ผู้ดูแลอาจปิดเมนูใดเมนูหนึ่งไว้) */
  const items = useMemo(() => {
    const lead = menu.find((i) => i.href === "/leads");
    if (!lead || !menu.some((i) => i.href === "/quotations")) return menu;
    return menu
      .filter((i) => i.href !== "/quotations")
      .map((i) => (i === lead ? { ...i, label: "ผู้สนใจและใบเสนอราคา", icon: "quotation" as const, href: "/leads-quotes" } : i));
  }, [menu]);
  /*
   * บทบาทผู้บริหารยังไม่มีชื่อจริงในทะเบียน เดิมจึงทักว่า "สวัสดี, CEO" ซึ่งอ่านเหมือนชื่อตำแหน่ง
   * ใช้ชื่อที่ผู้ดูแลตั้งไว้ในผู้อนุมัติระดับผู้บริหารก่อน ยังไม่ได้ตั้งค่อยใช้คำเรียกตำแหน่ง
   */
  /* เทียบกับค่าที่ตั้งไว้ก่อนแปลงชื่อ — nameOf แปลง "CEO" เป็นชื่อตำแหน่งเต็มแล้ว (ผู้ใช้สั่ง 29 ต.ค. 2569) */
  const execRaw = approvers().exec.name.trim();
  const execName = execRaw && execRaw !== "CEO" ? nameOf(execRaw) : "";
  const hello =
    role === "ceo"
      ? execName
        ? execName.split(" ")[0]
        : "ผู้บริหาร"
      : me.name.split(" ")[0];

  /* ชื่อย่อบนปุ่มโปรไฟล์ — ตัวแรกของชื่อกับของนามสกุล เหมือนที่ใช้ในเมนูผู้ใช้ */
  const initials = initialOf(me.name);
  const photo = useProfilePhoto();
  /* วันนี้เป็นวันอะไร — อ่านผ่าน bkkNow() ตามกติกาเวลาของโปรเจค ไม่ใช่ new Date() ตรง ๆ */
  const now = bkkNow();
  const todayText = `วัน${TH_DAYS[now.getDay()]}ที่ ${thaiDate(todayIso())}`;
  /* คำค้นเมนู — ว่าง = เห็นทุกกลุ่มตามเดิม */
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const key = q.trim().toLowerCase();
    return key ? items.filter((i) => i.label.toLowerCase().includes(key)) : items;
  }, [items, q]);
  const groups = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const i of hits) map.set(i.group, [...(map.get(i.group) ?? []), i]);
    return [...map.entries()];
  }, [hits]);
  /* ชื่อเต็มบนการ์ดทักทายของมือถือ (ต้นแบบ home-*.html) — ผู้บริหารใช้ชื่อผู้อนุมัติที่ตั้งไว้เหมือนเดิม */
  const fullName = role === "ceo" ? (execName || "ผู้บริหาร") : me.name;

  useEffect(() => {
    const phone = window.matchMedia("(max-width: 640px)");
    const go = () => {
      if (!phone.matches) router.replace(first);
    };
    go();
    phone.addEventListener("change", go);
    return () => phone.removeEventListener("change", go);
  }, [router, first]);

  return (
    <>
    {/* บัญชีใช้หน้าหลักมือถือตามต้นแบบ home-glass-ref ของตัวเอง — บทบาทอื่นคงของเดิม (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
    {role === "acc" ? (
      <AccMobileHome hits={hits} q={q} setQ={setQ} name={fullName} photo={photo} />
    ) : (
    <MobileHome
      role={role}
      menu={menu}
      hits={hits}
      q={q}
      setQ={setQ}
      name={fullName}
      photo={photo}
      employeeId={me.employeeId}
    />
    )}
    {/* จอกว้าง — ของเดิมทุกอย่าง ซ่อนบนมือถือเพราะมือถือใช้หน้าหลักแบบใหม่ (MobileHome) */}
    <div className="-mx-4 -mt-[18px] min-h-full bg-[#fbf5f4] px-4 pt-2 pb-6 max-sm:hidden sm:-mx-[30px] sm:bg-[#F6F7FA] sm:px-12 sm:pt-8">
      {/* แถบบนของหน้าหลัก — ชื่อย่อของเจ้าของเครื่องซ้าย ชื่อหน้าตรงกลาง กระดิ่งขวา
         หน้านี้ไม่มีแถบบนของเปลือกแอป (เป็นหน้าแรก ไม่มีที่ให้ย้อนกลับ) จึงทำแถบของตัวเอง */}
      <div className="flex min-w-0 items-center gap-3 sm:hidden">
        <Link
          href="/profile"
          aria-label="โปรไฟล์ของฉัน"
          className="size-11 flex-none overflow-hidden rounded-full bg-card shadow-[0_6px_16px_-10px_rgb(120_20_35/0.5)]"
        >
          {/* ตั้งรูปไว้แล้วใช้รูป ยังไม่ได้ตั้งใช้ตัวย่อชื่อ — อ่านจากสโตร์เดียวกับการ์ดโปรไฟล์ */}
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-[14px] font-bold text-primary">
              {initials}
            </span>
          )}
        </Link>
        <b className="min-w-0 flex-1 truncate text-center text-[18px] font-bold">หน้าหลัก</b>
        <NotificationMenu />
      </div>
      <div className="hidden justify-end sm:flex">
        <NotificationMenu />
      </div>

      <>
          {/* การ์ดทักทาย — ไล่สีแดงของแบรนด์ พร้อมวันที่วันนี้และบทบาทที่กำลังใช้อยู่
             ช่องค้นหาเกยขอบล่างของการ์ด ตามแบบที่เจ้าของส่งมา (25 ก.ย. 2569) */}
          <section className="relative mt-3 sm:mt-0">
            <div className="relative overflow-hidden rounded-[22px] bg-[linear-gradient(135deg,#8e0012_0%,#c00019_45%,#db0000_100%)] px-5 pt-5 pb-14 text-white sm:pb-6">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:repeating-linear-gradient(90deg,#fff_0_1px,transparent_1px_20px),repeating-linear-gradient(0deg,#fff_0_1px,transparent_1px_20px)]"
              />
              <span className="relative block">
                <Image src="/maz-logo.png" alt="MAZ" width={640} height={158} className="h-8 w-auto brightness-0 invert" priority />
                <b className="mt-3 block text-[21px] leading-tight font-bold">
                  {greetNow()}, {hello}
                </b>
                <em className="mt-1 block text-[12.5px] text-white/80 not-italic">{todayText}</em>
                <span className="mt-3 flex flex-wrap gap-2">
                  <em className="rounded-full bg-white/18 px-3 py-1 text-[12px] font-semibold not-italic">
                    {roleLabel(role)}
                  </em>
                  <em className="rounded-full border border-white/40 px-3 py-1 text-[12px] font-semibold not-italic">
                    ERP MAZ
                  </em>
                </span>
              </span>
            </div>
            {/* ค้นหาเมนู — เมนูของบางบทบาทมีสิบกว่ารายการ พิมพ์หาเร็วกว่าเลื่อนดูทีละกลุ่ม */}
            <label className="absolute inset-x-4 bottom-0 flex h-12 translate-y-1/2 items-center gap-2.5 rounded-[14px] bg-card px-4 shadow-[0_12px_28px_-14px_rgb(120_20_35/0.45)] sm:hidden">
              <SearchIcon className="size-[18px] flex-none text-muted-foreground" strokeWidth={2} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาเมนู..."
                aria-label="ค้นหาเมนู"
                className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
              />
            </label>
          </section>
      </>



      {/* เมนูแบ่งตามกลุ่มเดียวกับเมนูข้าง — คนที่ชินกับจอคอมจะหาของเจอที่เดิม */}
      <div className="mt-11 sm:mt-7">
        {groups.length === 0 ? (
          <p className="glass rounded-[18px] px-4 py-8 text-center text-[13px] text-muted-foreground">
            ไม่พบเมนูที่ตรงกับ “{q}”
          </p>
        ) : (
          groups.map(([group, list]) => (
            <section key={group} className="mb-5">
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <h3 className="text-[15px] font-bold">{group}</h3>
                <em className="num text-[12px] text-muted-foreground not-italic">{list.length} เมนู</em>
              </div>
              {/*
                มือถือ: ทุกกลุ่มเรียงเหมือนกันหมด สามช่องต่อแถว การ์ดขนาดเดียวกัน
                และคอลัมน์ตรงกันทุกกลุ่ม (เจ้าของสั่ง 25 ก.ย. 2569)
                เคยลองให้กลุ่มเล็กขยายเต็มแถวและจัดเศษไว้กลาง แล้วการ์ดโตไม่เท่ากันระหว่างกลุ่ม อ่านแล้วขัดตา
                จอกว้างยังเป็นกริดเติมเต็มความกว้างตามเดิม
              */}
              <ul
                className="flex list-none flex-wrap gap-2.5 p-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] sm:gap-[18px]"
                aria-label={group}
              >
                {list.map((i, n) => {
                  const Icon = ICONS[i.icon] ?? HomeIcon;
                  /* ทุกกลุ่มใช้การ์ดขนาดเดียวกันหมด (สามช่องต่อแถว) แถวไหนไม่เต็มจัดกลาง
                     ถ้าให้กลุ่มเล็กขยายเต็มแถว การ์ดจะโตไม่เท่ากันระหว่างกลุ่ม อ่านแล้วขัดตา */
                  const cols = 3;
                  return (
                    <li
                      key={i.href}
                      className="min-w-0"
                      style={{ flexBasis: `calc((100% - ${(cols - 1) * 10}px) / ${cols})` }}
                    >
                      <Link
                        href={i.href}
                        className="group flex h-full w-full flex-col items-center justify-start gap-2 rounded-[18px] bg-white p-2.5 text-center text-foreground shadow-[0_1px_2px_rgb(120_20_35/0.05),0_12px_28px_-20px_rgb(120_20_35/0.35)] transition-shadow hover:shadow-[0_14px_30px_-14px_rgba(30,40,70,.36),0_0_0_1.5px_var(--primary)] active:bg-primary active:text-white sm:aspect-square sm:justify-center sm:gap-3 sm:rounded-2xl sm:p-3.5 sm:shadow-[0_10px_26px_-14px_rgba(30,40,70,.28),0_1px_0_rgba(30,40,70,.04)]"
                      >
                        <span
                          className={`grid size-[42px] flex-none place-items-center rounded-[13px] transition-colors group-active:bg-white/20 group-active:text-white md:size-12 md:!bg-transparent md:!text-inherit ${TILE_TONE[n % TILE_TONE.length]}`}
                        >
                          <Icon className="size-[22px] flex-none md:size-12" strokeWidth={1.8} />
                        </span>
                        <span className="text-[11.5px] leading-[1.3] font-semibold sm:text-[15px]">
                          {i.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
    </>
  );
}

/** ชื่อวันภาษาไทย — ใช้ในบรรทัดวันที่ของการ์ดทักทาย */
const TH_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

/*
 * สีแผ่นไอคอนบนมือถือ — วนตามลำดับเมนู ให้แต่ละช่องแยกจากกันด้วยสายตา ไม่ใช่ขาวล้วนทั้งหน้า
 * ใช้โทนชุดเดียวกับที่หน้าลงเวลาใช้อยู่ ไม่ได้ตั้งสีใหม่เฉพาะหน้านี้
 */
const TILE_TONE = [
  "bg-[var(--accent)] text-primary",
  "bg-[var(--info-soft)] text-[var(--info)]",
  "bg-[var(--success-soft)] text-[var(--success)]",
  "bg-[var(--warning-soft)] text-[var(--warning)]",
];


/* ═══════════════════════════════════════════════════════════════════════════
 * หน้าหลักมือถือ (ต้นแบบ home-glass · home-employee · home-pm · home-sales — 2 ต.ค. 2569)
 * คอมโพเนนต์เดียวทุกบทบาท ต่างกันแค่ตัวเลขสรุปกับสิ่งที่ต้องทำ
 * ตัวเลขทุกตัวอ่านจากสโตร์จริงของหน้านั้น ๆ — ตัวไหนไม่มีแหล่งข้อมูล หรือบทบาทนี้เข้าหน้านั้นไม่ได้ ไม่แสดง
 * ═══════════════════════════════════════════════════════════════════════════ */

type Stat = { value: string; unit: string; label: string; href: string };
type Tone = { bg: string; ac: string };
type Todo = {
  key: string;
  title: string[];
  count: number;
  unit: string;
  href: string;
  source: string;
  Icon: typeof HomeIcon;
  tone: Tone;
  kind: "rows" | "cal" | "people";
};

/* สีพื้นภาพตัวอย่างหลังการ์ดสิ่งที่ต้องทำ — ชุดเดียวกับต้นแบบ */
const TONE_AMBER: Tone = { bg: "#FBF1E6", ac: "#E0A04A" };
const TONE_BLUE: Tone = { bg: "#EEF3FB", ac: "#5A8FDB" };
const TONE_PINK: Tone = { bg: "#FCEFF1", ac: "#D9475E" };

/* ไล่สีแผ่นไอคอนเมนู — วนตามลำดับเมนู (ต้นแบบ home-glass.html) */
const TILE_GRAD = [
  "linear-gradient(150deg,#F2A93B,#D9731A)",
  "linear-gradient(150deg,#9B83F0,#5B3FBF)",
  "linear-gradient(150deg,#5A9BF0,#1F63C4)",
  "linear-gradient(150deg,#EE5A6F,#B0101F)",
  "linear-gradient(150deg,#2EC4B6,#13867D)",
];

const GLASS =
  "border border-white/95 bg-white/72 shadow-[0_12px_30px_-20px_rgba(140,20,40,.45)] backdrop-blur-[18px]";

/** ตัวเลขย่อแบบต้นแบบ — 171K · 1.2M */
function shortNum(n: number) {
  const a = Math.abs(n);
  if (a >= 1e6) return `${Math.round((n / 1e6) * 10) / 10}M`;
  if (a >= 1e3) return `${Math.round(n / 1e3)}K`;
  return `${Math.round(n)}`;
}

/** วันลาที่โชว์บนหน้าหลัก — ชื่อประเภทตรงกับ LEAVE_TYPES */
const MY_LEAVE: { type: string; label: string }[] = [
  { type: "ลากิจ", label: "ลากิจ" },
  { type: "ลาพักร้อน", label: "พักร้อน" },
  { type: "ลาป่วย", label: "ลาป่วย" },
];

/**
 * ตัวเลขสรุป + สิ่งที่ต้องทำวันนี้ + วันนี้ของฉัน — อ่านอย่างเดียว ไม่เขียนสโตร์ไหน
 * สูตรลอกจากหน้าที่ตัวเลขนั้นลิงก์ไป เพื่อให้กดเข้าไปแล้วเห็นเลขเดียวกัน
 */
function useHomeData(role: Role, menu: NavItem[], employeeId: string) {
  const acc = useAcc();
  const hr = useHr();
  const pm = usePm();
  const crm = useCrm();
  const leaves = useLeaveRecords();
  const punches = useSyncExternalStore(subscribeRecords, getRecordsSnapshot, getRecordsServerSnapshot);
  const menuKey = menu.map((i) => i.href).join("|");

  return useMemo(() => {
    const hrefs = new Set(menuKey.split("|"));
    /* แสดงเฉพาะสิ่งที่พาไปหน้าที่บทบาทนี้เข้าได้จริง */
    const has = (href: string) => hrefs.has(href.split("?")[0]);
    const today = todayIso();
    const stats: Stat[] = [];
    const todos: Todo[] = [];
    const left = (t: string) => leaveUsage(leaves, t).remaining;

    if (role === "acc" || role === "hr") {
      /* สูตรเดียวกับแดชบอร์ดบัญชี (ช่วง "เดือนนี้") — รับชำระ = รับจริง + ภาษีที่ลูกค้าหัก */
      const from = `${today.slice(0, 7)}-01`;
      const got = acc.payments
        .filter((p) => p.date && p.date >= from && p.date <= today)
        .reduce((a, p) => a + p.received + p.wht, 0);
      const owe = awaitingReceipt(acc).reduce((a, v) => a + invoiceDue(v), 0);
      const active = hr.emp.filter((e) => e.status === "active");
      /* ใบเสร็จรวมเข้าหน้าวางบิล (ผู้ใช้สั่ง 9 ต.ค. 2569) */
      if (has("/acc/billing")) stats.push({ value: shortNum(got), unit: "฿", label: "รับชำระแล้ว", href: "/acc/billing?tab=rc" });
      if (has("/acc/billing")) stats.push({ value: shortNum(owe), unit: "฿", label: "ลูกหนี้คงเหลือ", href: "/acc/billing" });
      if (has("/hr/employees")) stats.push({ value: `${active.length}`, unit: "คน", label: "พนักงาน", href: "/hr/employees" });
      /* วันลาคงเหลือ = ลากิจ + ลาพักร้อน (ไม่รวมลาป่วย) — ตัวคำนวณเดียวกับกล่อง "วันนี้ของฉัน" */
      if (has("/leave")) {
        /* แสดงเป็นชั่วโมง — เลขแรกตัวใหญ่ หน่วยที่เหลือตัวเล็ก "29" + "วัน 4 ชม." (ผู้ใช้สั่ง 19 ต.ค. 2569) */
        const txt = fmtLeave(left("ลากิจ") + left("ลาพักร้อน"));
        const cut = txt.indexOf(" ");
        stats.push({ value: txt.slice(0, cut), unit: txt.slice(cut + 1), label: "วันลาคงเหลือ", href: "/leave" });
      }

      /* ดีลรอวางบิล — เงื่อนไขเดียวกับแท็บ "รอวางบิล" ของหน้าวางบิล (ไม่กรองช่วงวันที่) */
      const toBill = acc.deals.filter(
        (d) => !d.cancelled && (d.plan.length === 0 || d.plan.some((p) => seqStatus(acc, d.no, p.seq) === "pending")),
      ).length;
      if (toBill && has("/acc/billing"))
        todos.push({ key: "bill", title: ["รอวางบิล"], count: toBill, unit: "ดีล", href: "/acc/billing", source: "วางบิล", Icon: BillingIcon, tone: TONE_AMBER, kind: "rows" });
      /* ใบลาของนักศึกษาฝึกงาน — ฝ่ายบุคคลอนุมัติเองที่แดชบอร์ดบุคคล */
      const leaveWait = hr.internLeave.filter((r) => r.status === "pending").length;
      if (leaveWait && has("/hr/dashboard"))
        todos.push({ key: "hrleave", title: ["คำขอลา", "รออนุมัติ"], count: leaveWait, unit: "คำขอ", href: "/hr/dashboard", source: "แดชบอร์ดบุคคล", Icon: LeaveIcon, tone: TONE_BLUE, kind: "cal" });
      /* ทดลองงานใกล้ครบ/เลยกำหนด ภายใน 30 วัน — เกณฑ์เดียวกับแดชบอร์ดบุคคล */
      const prob = active.filter(
        (e) => e.type === "probat" && daysBetween(today, toIsoDate(probEnd(e.startedAt))) <= 30,
      ).length;
      if (prob && has("/hr/employees"))
        todos.push({ key: "prob", title: ["ครบกำหนด", "ทดลองงาน"], count: prob, unit: "คน", href: "/hr/employees", source: "ข้อมูลพนักงาน", Icon: UsersIcon, tone: TONE_PINK, kind: "people" });
    }

    if (role === "staff" && has("/my-tasks")) {
      /* งานของตัวเอง — สูตรเดียวกับหน้างานที่ได้รับ (my-tasks · stageOf) */
      const mine = pm.projects
        .filter((p) => p.status !== "cancelled")
        .flatMap((p) => p.tasks.filter((t) => t.whos.includes(employeeId)));
      const isRecv = (s: string) => s !== "done" && s !== "revise" && s !== "sent";
      const count = (s: string) => mine.filter((t) => (s === "recv" ? isRecv(t.status) : t.status === s)).length;
      stats.push({ value: `${count("recv")}`, unit: "งาน", label: "งานที่ได้รับ", href: "/my-tasks" });
      stats.push({ value: `${count("sent")}`, unit: "งาน", label: "รอตรวจ", href: "/my-tasks?stage=sent" });
      stats.push({ value: `${count("revise")}`, unit: "งาน", label: "ต้องแก้ไข", href: "/my-tasks?stage=revise" });
      stats.push({ value: `${count("done")}`, unit: "งาน", label: "เสร็จแล้ว", href: "/my-tasks?stage=done" });
      const late = mine.filter((t) => isRecv(t.status) && t.due < today).length;
      if (late)
        todos.push({ key: "late", title: ["เลยกำหนดส่ง"], count: late, unit: "งาน", href: "/my-tasks", source: "งานของฉัน", Icon: ClockIcon, tone: TONE_PINK, kind: "rows" });
      const back = count("revise");
      if (back)
        todos.push({ key: "revise", title: ["งานที่ Project Manager ส่งกลับ", "ให้แก้ไข"], count: back, unit: "งาน", href: "/my-tasks?stage=revise", source: "งานของฉัน", Icon: TasksIcon, tone: TONE_AMBER, kind: "rows" });
    }

    if (role === "pm") {
      /* สูตรเดียวกับแดชบอร์ด PM — โปรเจคที่ยกเลิกแล้วไม่นับ · ใกล้ครบกำหนด = ภายใน 7 วัน */
      const open = pm.projects
        .filter((p) => p.status !== "cancelled")
        .flatMap((p) => p.tasks.filter((t) => t.status !== "done"));
      /* งานที่ GM มอบหมายให้ PM คนนี้และยังไม่ได้วางแผน — PM กดรับงานเองไม่ได้แล้ว (ผู้ใช้สั่ง 27 ต.ค. 2569) */
      const waiting = pm.inbox.filter((j) => isJobOf(j, USERS.pm.name) && !pm.projects.some((p) => p.pj === j.pj)).length;
      const review = open.filter((t) => t.status === "sent").length;
      const running = pm.projects.filter((p) => p.status === "running").length;
      const soon = open.filter((t) => {
        const d = daysBetween(today, t.due);
        return t.status !== "sent" && d >= 0 && d <= 7;
      }).length;
      if (has("/pm/inbox")) stats.push({ value: `${waiting}`, unit: "งาน", label: "งานที่ได้รับมอบหมาย", href: "/pm/inbox" });
      if (has("/pm/reviews")) stats.push({ value: `${review}`, unit: "งาน", label: "งานรอตรวจ", href: "/pm/reviews" });
      if (has("/pm/projects")) stats.push({ value: `${running}`, unit: "โปรเจค", label: "กำลังทำ", href: "/pm/projects" });
      if (has("/pm/dashboard")) stats.push({ value: `${soon}`, unit: "งาน", label: "ใกล้ครบกำหนด", href: "/pm/dashboard" });
      if (waiting && has("/pm/inbox"))
        todos.push({ key: "inbox", title: ["งานที่ได้รับมอบหมาย"], count: waiting, unit: "งาน", href: "/pm/inbox", source: "รอวางแผน", Icon: InboxIcon, tone: TONE_BLUE, kind: "rows" });
      if (review && has("/pm/reviews"))
        todos.push({ key: "review", title: ["งานรอตรวจ", "ทีมส่งมาแล้ว"], count: review, unit: "งาน", href: "/pm/reviews", source: "งานรอตรวจ", Icon: TasksIcon, tone: TONE_AMBER, kind: "rows" });
      if (soon && has("/pm/projects"))
        todos.push({ key: "soon", title: ["ใกล้ครบกำหนด", "ภายใน 7 วัน"], count: soon, unit: "งาน", href: "/pm/projects", source: "โปรเจค", Icon: ClockIcon, tone: TONE_PINK, kind: "cal" });
    }

    if (role === "sales") {
      /* ช่วง "เดือนนี้" ของแดชบอร์ดขาย — buildReport ตัวเดียวกัน */
      const d = buildReport(crm, "m", bkkNow());
      if (has("/deals")) stats.push({ value: shortNum(d.won), unit: "฿", label: "ปิดการขาย", href: "/deals" });
      if (has("/leads")) stats.push({ value: `${d.leads}`, unit: "ราย", label: "ผู้สนใจใหม่", href: "/leads" });
      if (has("/quotations"))
        stats.push({ value: d.quotes ? `${d.rate}` : "—", unit: d.quotes ? "%" : "", label: "อัตราปิด", href: "/quotations" });
      if (has("/deals")) stats.push({ value: `${d.avgDays}`, unit: "วัน", label: "ปิดเฉลี่ย", href: "/deals" });
      if (has("/leads")) {
        /* นัดติดตามที่ถึงกำหนดวันนี้หรือเลยมาแล้ว — เกณฑ์เดียวกับกระดิ่ง */
        const follow = crm.activities.filter((a) => a.followUp && a.followUp <= today).length;
        if (follow)
          todos.push({ key: "follow", title: ["นัดติดตามวันนี้"], count: follow, unit: "ราย", href: "/leads", source: "ผู้สนใจ", Icon: ClockIcon, tone: TONE_BLUE, kind: "cal" });
        const waitMeet = crm.customers.filter((c) => c.status === "รอนัดหมาย").length;
        if (waitMeet)
          todos.push({ key: "meet", title: ["ผู้สนใจ", "รอนัดหมาย"], count: waitMeet, unit: "ราย", href: "/leads", source: "ผู้สนใจ", Icon: LeadsIcon, tone: TONE_PINK, kind: "people" });
      }
    }

    /* ── วันนี้ของฉัน ── */
    const day = recordsOfDay(punches, today);
    const firstIn = day.find((r) => r.type === "in");
    const last = day.at(-1);
    const checkin = !has("/")
      ? null
      : !firstIn || !last
        ? { title: "ยังไม่ได้เช็คอิน", sub: `เข้างาน ${WORK_SCHEDULE.start} น.` }
        : last.type === "in"
          ? { title: "เช็คอินแล้ว", sub: `เข้างาน ${formatClock(new Date(firstIn.at))} น.` }
          : { title: "ออกงานแล้ว", sub: `${formatClock(new Date(firstIn.at))} – ${formatClock(new Date(last.at))} น.` };

    const leaveBox = has("/leave") ? MY_LEAVE.map((l) => ({ label: l.label, n: fmtLeave(left(l.type)) })) : null;

    /* สลิปล่าสุดที่เผยแพร่แล้ว — เงื่อนไขเดียวกับหน้าสลิปของฉัน (ฝึกงานไม่มีสลิป) */
    let payslip: string | null = null;
    if (has("/payslip")) {
      const myId = ROLE_EMPLOYEE[role];
      const emp = myId ? hr.emp.find((e) => e.id === myId) : undefined;
      if (emp && emp.type !== "intern") {
        /* ทดลองงานรับสลิปตามรอบจ่ายรายช่วง (ผู้ใช้สั่ง 6 ต.ค. 2569) */
        const label = isDaily(emp)
          ? [...hr.dailyRounds]
              .filter((r) => r.published && inRange(emp, r))
              .sort((a, b) => a.to.localeCompare(b.to))
              .map((r) => ` ${rangeLabel(r)}`)
              .at(-1)
          : hr.slips
              .filter((s) => s.published && inPeriod(emp, s.month))
              .map((s) => s.month)
              .sort()
              .map((m) => thaiMonth(m))
              .at(-1);
        payslip = label ? `รอบ${label}` : "ยังไม่มีสลิปที่เผยแพร่";
      }
    }

    return { stats, todos, checkin, leaveBox, payslip };
  }, [role, menuKey, employeeId, acc, hr, pm, crm, leaves, punches]);
}

function MobileHome({
  role,
  menu,
  hits,
  q,
  setQ,
  name,
  photo,
  employeeId,
}: {
  role: Role;
  menu: NavItem[];
  hits: NavItem[];
  q: string;
  setQ: (v: string) => void;
  name: string;
  photo: string | null | undefined;
  employeeId: string;
}) {
  const { stats, todos, checkin, leaveBox, payslip } = useHomeData(role, menu, employeeId);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const initials = initialOf(name);
  const showSearch = searching || q !== "";

  useEffect(() => {
    if (searching) inputRef.current?.focus();
  }, [searching]);

  const myRows = [
    checkin && (
      <MyRow key="in" href="/" icon={<ClockIcon className="size-5" strokeWidth={2} />} iconCls="bg-[#FCE3E7] text-[#B0101F]">
        <span className="text-[14px] font-bold">{checkin.title}</span>
        <span className="text-[12px] text-[#6B5F62]">{checkin.sub}</span>
      </MyRow>
    ),
    leaveBox && (
      <MyRow key="leave" href="/leave" icon={<LeaveIcon className="size-5" strokeWidth={2} />} iconCls="bg-[#E3EEFC] text-[#1A5DB5]" gap>
        <span className="text-[12.5px] font-bold">วันลาคงเหลือ</span>
        <span className="flex gap-1.5">
          {leaveBox.map((b) => (
            <span key={b.label} className="flex flex-1 flex-col items-center rounded-xl bg-[rgba(236,240,250,.9)] py-1.5">
              <span className="text-[11px] text-[#6B5F62]">{b.label}</span>
              <span className="num text-[14px] font-bold whitespace-nowrap text-[#1A5DB5]">{b.n}</span>
            </span>
          ))}
        </span>
      </MyRow>
    ),
    payslip && (
      <MyRow key="slip" href="/payslip" icon={<ReceiptIcon className="size-5" strokeWidth={2} />} iconCls="bg-[#DDF2E6] text-[#0F7049]">
        <span className="text-[14px] font-bold">สลิปเงินเดือน</span>
        <span className="text-[12px] text-[#6B5F62]">{payslip}</span>
      </MyRow>
    ),
  ].filter(Boolean);

  return (
    <div className="rh-home relative -mx-4 -mt-[18px] flex min-h-full flex-col gap-[18px] bg-[#FAF6F6] pt-[22px] pb-4 text-[#2A1F22] sm:hidden [&>*]:shrink-0">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[380px] [background:radial-gradient(60%_55%_at_18%_18%,#FFFFFF_0%,rgba(255,255,255,0)_70%),radial-gradient(55%_60%_at_85%_10%,#FFE9EC_0%,rgba(255,233,236,0)_70%),radial-gradient(70%_60%_at_60%_60%,#FCD9DF_0%,rgba(252,217,223,0)_75%),linear-gradient(180deg,#F9D3DA_0%,#FDF0F2_70%,#FAF6F6_100%)]"
      />

      {/* หัวหน้า — โลโก้ MAZ + ERP · ปุ่มค้นหาเมนู · กระดิ่ง (ตัวเดียวกับแถบบนของแอป) */}
      <header className="relative flex items-center justify-between px-5">
        <div className="flex items-center gap-2.5">
          <svg width="64" height="17" viewBox="60 115 1560 410" role="img" aria-label="MAZ">
            <g fill="none" stroke="#B0101F" strokeWidth="90" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="115,470 115,170 335,355 555,170 555,470" />
              <polyline points="670,470 885,170 1105,470" />
              <polyline points="1215,170 1565,170 1215,470 1565,470" />
            </g>
          </svg>
          <span className="text-[18px] font-bold">ERP</span>
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            aria-label="ค้นหาเมนู"
            aria-expanded={showSearch}
            onClick={() => {
              if (showSearch) {
                setSearching(false);
                setQ("");
              } else setSearching(true);
            }}
            className="relative grid size-[46px] place-items-center rounded-full border border-white/95 bg-white/85 text-[#2A1F22] shadow-[0_10px_24px_-16px_rgba(140,20,40,.5)]"
          >
            <SearchIcon className="size-[22px]" strokeWidth={2} />
          </button>
          <div className="rh-bell">
            <NotificationMenu />
          </div>
        </div>
      </header>

      {/* ค้นหาเมนู — กดปุ่มแว่นขยายแล้วเปิด ใช้คำค้นชุดเดียวกับของเดิม */}
      {showSearch && (
        <label className="relative mx-4 flex h-[46px] items-center gap-2.5 rounded-full border border-[#EFE6E8] bg-white px-4">
          <SearchIcon className="size-[18px] flex-none text-[#8A7E81]" strokeWidth={2} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาเมนู..."
            aria-label="ค้นหาเมนู"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#9A8E91]"
          />
        </label>
      )}

      {/* การ์ดทักทาย — รูป/ชื่อย่อ · คำทักทายตามเวลา · ชื่อเต็ม · ตัวเลขสรุปของบทบาท */}
      <section className={`relative mx-4 flex flex-col gap-4 rounded-[28px] p-4 ${GLASS}`}>
        <Link href="/profile" aria-label="โปรไฟล์ของฉัน" className="flex items-center gap-3 text-inherit">
          <span className="grid size-[52px] flex-none place-items-center overflow-hidden rounded-full bg-[#FCE3E7] text-[17px] font-bold text-[#B0101F] shadow-[0_0_0_2.5px_#FFFFFF,0_0_0_4.5px_rgba(200,16,46,.35)]">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="size-full object-cover" />
            ) : (
              initials
            )}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[12.5px] text-[#6B5F62]">{greetNow()}</span>
            <span className="truncate text-[17px] font-bold">{name}</span>
          </span>
        </Link>
        {stats.length > 0 && (
          <nav aria-label="สรุปเดือนนี้" className="flex rounded-2xl border border-[#E3D3D7] bg-[rgba(250,244,245,.9)] py-3">
            {stats.map((s, i) => (
              <Link
                key={s.label}
                href={s.href}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-0.5 text-[#2A1F22] ${i < stats.length - 1 ? "border-r border-[#D9C8CC]" : ""}`}
              >
                <span className="num text-[17px] font-bold whitespace-nowrap tabular-nums">
                  {s.value}
                  {s.unit && <span className="ml-0.5 text-[11px] font-semibold text-[#6B5F62]">{s.unit}</span>}
                </span>
                <span className="text-[11px] whitespace-nowrap text-[#8A7E81]">{s.label}</span>
              </Link>
            ))}
          </nav>
        )}
      </section>

      {/* เมนู — รายการเดียวกับเมนูข้าง (รวมผู้สนใจกับใบเสนอราคาแล้ว) เป็นกริดไอคอนสี่ช่อง */}
      <div className="relative flex items-center gap-2 px-5">
        <h2 className="m-0 text-[16px] font-bold">เมนู</h2>
      </div>
      {hits.length === 0 ? (
        <p className="relative mx-4 rounded-[18px] bg-white/70 px-4 py-6 text-center text-[13px] text-[#6E6164]">
          ไม่พบเมนูที่ตรงกับ “{q}”
        </p>
      ) : (
        <nav aria-label="เมนู" className="relative grid grid-cols-4 gap-x-2 gap-y-3.5 px-3">
          {hits.map((i, n) => {
            const Icon = ICONS[i.icon] ?? HomeIcon;
            return (
              <Link key={i.href} href={i.href} className="flex min-w-0 flex-col items-center gap-[7px] text-[#2A1F22]">
                <span
                  className="grid size-[58px] place-items-center rounded-[18px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_10px_18px_-10px_rgba(90,20,30,.55)]"
                  style={{ background: TILE_GRAD[n % TILE_GRAD.length] }}
                >
                  <Icon className="size-[26px]" strokeWidth={1.8} />
                </span>
                <span className="text-center text-[12px] leading-[1.25] font-semibold break-words">{i.label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {/* สิ่งที่ต้องทำวันนี้ — มาจากงานค้างจริงของบทบาท ไม่มีเลยไม่แสดงหัวข้อนี้ */}
      {todos.length > 0 && (
        <>
          <div className="relative flex items-center gap-2 px-5">
            <h2 className="m-0 text-[16px] font-bold">สิ่งที่ต้องทำวันนี้</h2>
            <span className="num rounded-md bg-[#C8102E] px-1.5 py-px text-[11px] font-bold text-white">
              {String(todos.length).padStart(2, "0")}
            </span>
          </div>
          <div className="rh-scroll relative flex gap-3 overflow-x-auto pl-5">
            {todos.map((t) => (
              <TodoCard key={t.key} t={t} />
            ))}
            <span aria-hidden="true" className="w-2 flex-none" />
          </div>
        </>
      )}

      {/* วันนี้ของฉัน — ลงเวลา · วันลาคงเหลือ · สลิปล่าสุด */}
      {myRows.length > 0 && (
        <>
          <div className="relative flex items-center gap-2 px-5">
            <h2 className="m-0 text-[16px] font-bold">วันนี้ของฉัน</h2>
          </div>
          <div className={`relative mx-4 flex flex-col rounded-3xl ${GLASS}`}>
            {myRows.flatMap((row, i) =>
              i === 0
                ? [row]
                : [<span key={`d${i}`} aria-hidden="true" className="mx-3.5 block h-px bg-[rgba(42,31,34,.07)]" />, row],
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MyRow({
  href,
  icon,
  iconCls,
  gap,
  children,
}: {
  href: string;
  icon: ReactNode;
  iconCls: string;
  gap?: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 px-3.5 py-[11px] text-[#2A1F22]">
      <span className={`grid size-[38px] flex-none place-items-center rounded-xl ${iconCls}`}>{icon}</span>
      <span className={`flex min-w-0 grow flex-col ${gap ? "gap-1.5" : ""}`}>{children}</span>
      <ChevronRightIcon className="size-[18px] flex-none text-[#9A8E91]" strokeWidth={2} />
    </Link>
  );
}

/** การ์ดสิ่งที่ต้องทำ 150×184 — ภาพหลังเบลอเป็นแค่ลวดลาย ตัวเลขจริงอยู่ที่ป้ายมุมขวาบน */
function TodoCard({ t }: { t: Todo }) {
  const { Icon, tone } = t;
  return (
    <Link
      href={t.href}
      className="relative h-[184px] w-[150px] flex-none overflow-hidden rounded-3xl text-white shadow-[0_14px_28px_-18px_rgba(60,10,20,.7)]"
    >
      <div
        aria-hidden="true"
        className="absolute -inset-1.5 flex scale-[1.04] flex-col gap-1.5 px-3 py-4 blur-[1.6px]"
        style={{ background: tone.bg }}
      >
        {t.kind === "cal" && (
          <div className="grid grid-cols-7 gap-1 rounded-xl bg-white/60 p-2">
            {Array.from({ length: 28 }, (_, i) => (
              <span key={i} className="h-3.5 rounded" style={{ background: [9, 10, 17].includes(i) ? tone.ac : "#FFFFFF" }} />
            ))}
          </div>
        )}
        {Array.from({ length: t.kind === "cal" ? 2 : 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-1.5 rounded-[9px] bg-white px-2 py-[7px] shadow-[0_1px_2px_rgba(0,0,0,.06)]">
            <span
              className={t.kind === "people" ? "size-5 rounded-full" : "size-[18px] rounded-md"}
              style={{ background: tone.ac, opacity: t.kind === "people" ? (i === 1 ? 0.9 : 0.35) : 0.8 }}
            />
            <span className="flex flex-1 flex-col gap-[3px]">
              <span className="h-[5px] rounded-[3px] bg-[#3A2A2E] opacity-55" style={{ width: `${70 - i * 9}%` }} />
              <span className="h-1 w-[45%] rounded-[3px] bg-[#9A8E91] opacity-50" />
            </span>
            {t.kind !== "people" && <span className="h-1.5 w-[26px] rounded-[3px]" style={{ background: tone.ac }} />}
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_top,rgba(38,16,22,.92)_0%,rgba(38,16,22,.55)_45%,rgba(38,16,22,.05)_75%)]"
      />
      <span className="absolute top-2.5 right-2.5 flex h-7 items-center gap-[5px] rounded-full border border-white/45 bg-white/28 px-2.5 text-[12px] font-bold text-white backdrop-blur-[10px]">
        <span className="num">{t.count}</span> {t.unit}
      </span>
      <span className="absolute inset-x-3 bottom-3 flex flex-col gap-2">
        <span className="text-[15px] leading-[1.3] font-bold">
          {t.title.map((line, i) => (
            <span key={i} className="block">
              {line}
            </span>
          ))}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="grid size-[22px] place-items-center rounded-full bg-white/90 text-[#B0101F]">
            <Icon className="size-3.5" strokeWidth={2.2} />
          </span>
          <span className="text-[11.5px] text-white/85">{t.source}</span>
        </span>
      </span>
    </Link>
  );
}
