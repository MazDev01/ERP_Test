"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { bottomNav, canVisit, canVisitAny, findItem, homeOf, mobileHomeOf, navGroupsOf, navItemsOf, pageTitle, useMenuAccess, type IconName, type NavItem } from "@/lib/nav";
import { BillingNavDot } from "./acc-ui";
import { useMyRoles } from "@/lib/hr-link";
import { thaiDate, todayIso } from "@/lib/format";
import { useHydrated } from "@/lib/pwa";
import { lockScroll } from "@/lib/scroll-lock";
import { ROLES, roleLabel, setRole, useApprovalRoute, useRole, type Role } from "@/lib/role";
import {
  AccBoardIcon,
  AdsIcon,
  ApproveIcon,
  PinIcon,
  ShieldIcon,
  BillingIcon,
  ChartIcon,
  ChevronLeftIcon,
  ClockIcon,
  CloseIcon,
  CommissionIcon,
  DealsIcon,
  LeadsIcon,
  HomeIcon,
  LeaveIcon,
  MenuIcon,
  OtIcon,
  InboxIcon,
  PlanBoardIcon,
  PresalesIcon,
  ProjectIcon,
  QuotationIcon,
  ReceiptIcon,
  TaxIcon,
  TasksIcon,
  TeamIcon,
  UserIcon,
} from "./icons";
import { NotificationMenu } from "./notification-menu";
import { SideSub, SubNav } from "./sub-nav";
import {
  BOTNAV_EMPTY,
  botnavChoices,
  botnavDefault,
  botnavOf,
  useBotnavPrefs,
} from "@/lib/botnav-prefs";
import { UserMenu } from "./user-menu";
import { goLive, settingsId, useLiveSettings } from "@/lib/system-settings";

const DW_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

function weekdayOf(iso: string) {
  return `วัน${DW_FULL[new Date(`${iso}T00:00:00`).getDay()]}`;
}

export const ICONS: Record<IconName, (p: { className?: string; strokeWidth?: number }) => React.ReactNode> = {
  tasks: TasksIcon,
  leads: LeadsIcon,
  presales: PresalesIcon,
  quotation: QuotationIcon,
  deals: DealsIcon,
  chart: ChartIcon,
  clock: ClockIcon,
  leave: LeaveIcon,
  ot: OtIcon,
  commission: CommissionIcon,
  user: UserIcon,
  inbox: InboxIcon,
  planboard: PlanBoardIcon,
  project: ProjectIcon,
  team: TeamIcon,
  ads: AdsIcon,
  accboard: AccBoardIcon,
  billing: BillingIcon,
  receipt: ReceiptIcon,
  tax: TaxIcon,
  approve: ApproveIcon,
  pin: PinIcon,
  shield: ShieldIcon,
  home: HomeIcon,
};

/* เมนูย่อยที่แยกด้วย query (รอบเงินเดือน ?g=) — เช็คแค่ว่าหน้านี้อยู่ใต้เมนูย่อยไหม ไม่สนค่า (ผู้ใช้สั่ง 5 ต.ค. 2569) */
const NO_QUERY = new URLSearchParams();

/** หน้าที่ยืนเต็มจอเอง ไม่ต้องมีแถบข้าง */
const BARE_PAGES = ["/login", "/install", "/offline", "/set-password", "/notify-test"];

/* หน้าที่มีเส้นทาง (ใบเสนอราคา > สร้างใหม่) ของตัวเอง — ไม่ต้องมีปุ่มย้อนกลับของเปลือกซ้ำ */
const OWN_CRUMB = ["/quotations/new"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  /* ทีมงานใช้เปลือกมือถือแบบใหม่ (ปุ่มเมนูกลมกลางจอ) — คลี่จากปุ่มนี้ */
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  /* บทบาทอื่นยังใช้ลิ้นชักด้านซ้ายแบบเดิม ตามที่ผู้ใช้สั่งไว้ */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const today = todayIso();

  /* บทบาทเป็นตัวกำหนดว่าเมนูซ้ายมีอะไรบ้าง — เลือกไว้ตอนเข้าสู่ระบบ */
  const role = useRole();
  /* เมนูที่ผู้ดูแลระบบปิดไว้ และสายอนุมัติ (เมนูรออนุมัติโผล่ตามสาย) — อ่านผ่าน hook ให้ตรงกับฝั่งเซิร์ฟเวอร์ตอน hydrate */
  const access = useMenuAccess();
  const route = useApprovalRoute();
  /* คนที่ควบสองตำแหน่งเห็นแถบงานของทั้งสองฝ่าย (บัญชีผู้ใช้กำหนดไว้ที่ /hr/accounts) */
  const roles = useMyRoles();
  const items = navItemsOf(roles, access, route);
  const groups = navGroupsOf(roles);
  const current = findItem(pathname, role);
  const title = pageTitle(pathname, role);
  /* บทบาทอ่านจาก localStorage ฝั่งเซิร์ฟเวอร์ยังไม่รู้ จึงเช็คสิทธิ์หลัง hydrate เท่านั้น
     ไม่งั้น PM จะเห็นหน้ากันแวบหนึ่งทุกครั้งที่รีเฟรช เพราะค่าเริ่มต้นฝั่งเซิร์ฟเวอร์เป็นฝ่ายขาย */
  const hydrated = useHydrated();
  const blocked = hydrated && !canVisitAny(pathname, roles, access, route);
  /*
   * หน้าที่ "ไปแล้วกลับไม่ได้" — หน้าย่อยที่ไม่มีในเมนูซ้าย เช่น รายละเอียดผู้สนใจ ใบเสนอราคา ใบแจ้งหนี้
   * บนมือถือมีปุ่มกลับหน้าหลักอยู่แล้ว จอคอมเดิมไม่มีอะไรให้กลับนอกจากปุ่ม back ของเบราว์เซอร์
   */
  const onMenuPage =
    items.some((i) => i.href === pathname) ||
    items.some((i) => i.sub?.some((x) => x.href === pathname || x.on?.(pathname, NO_QUERY)));
  const router = useRouter();

  /* บทบาทที่ไม่มีหน้าตอกบัตร (ผู้ดูแลระบบ) เปิด "/" แล้วพาไปหน้าแรกของตัวเอง ไม่ขึ้นหน้าห้ามเข้า */
  const home = homeOf(role, access, route);
  /* มือถือ: เปิดแอปครั้งแรกของรอบที่หน้า "/" (start_url) ให้เด้งหน้าหลักการ์ดเมนูก่อน (ผู้ใช้สั่ง 22 ก.ย. 2569)
     จดไว้ใน sessionStorage ตั้งแต่หน้าแรกที่เปิด กดการ์ด "เวลาทำงาน" ทีหลังจะเข้าหน้าตอกบัตรได้ตามปกติ */
  const firstOpen = useRef<boolean | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (firstOpen.current === null) {
      try {
        firstOpen.current = !sessionStorage.getItem("maz-erp.opened");
        sessionStorage.setItem("maz-erp.opened", "1");
      } catch {
        firstOpen.current = false;
      }
    }
    if (pathname !== "/") {
      firstOpen.current = false;
      return;
    }
    if (firstOpen.current && window.matchMedia("(max-width: 640px)").matches) {
      firstOpen.current = false;
      router.replace(mobileHomeOf(role));
      return;
    }
    if (home !== "/") router.replace(home);
  }, [hydrated, pathname, home, router, role]);
  /*
   * ลิงก์เดโม ?as=<บทบาท> (ผู้ใช้สั่ง 5 ต.ค. 2569) — เปิดแท็บนี้เป็นบทบาทนั้นทันที ไม่ต้องผ่านหน้าเข้าสู่ระบบ
   * ตั้งบทบาทของแท็บ (sessionStorage) แล้วลบ as ออกจาก URL พารามิเตอร์อื่นอยู่ครบ
   * ทำใน effect หลัง hydrate เท่านั้น ไม่งั้นฝั่งเซิร์ฟเวอร์กับเบราว์เซอร์เรนเดอร์ไม่ตรงกัน
   * เปิดที่ /login?as= ถือว่าล็อกอินแล้ว พาไปหน้าแรกของบทบาทนั้น
   * TODO: ต่อ auth จริงแล้วต้องถอดออก — ใครก็สลับบทบาทได้ด้วย URL
   */
  useEffect(() => {
    const url = new URL(window.location.href);
    const as = url.searchParams.get("as");
    if (as === null) return;
    url.searchParams.delete("as");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    const next = ROLES.find((r) => r.key === as)?.key;
    if (!next) return;
    setRole(next);
    if (pathname === "/login") {
      const phone = window.matchMedia("(max-width: 640px)").matches;
      router.replace(homeOf(next, access, route, phone));
    }
  }, [pathname, router, access, route]);
  /*
   * เปลือกแบบมือถือใหม่ใช้เฉพาะทีมงาน เพราะมีแบบดีไซน์ของบทบาทนี้อย่างเดียว
   * บทบาทอื่นยังไม่มีแบบ จึงคงของเดิมไว้ ไม่เดาแทนผู้ใช้
   * ฝั่งจอกว้างใช้แถบข้างสีแบรนด์เหมือนกันหมด ตรงนั้นไม่ได้แยกตามบทบาท
   */
  /* 22 ก.ย. 2569 ผู้ใช้สั่งให้มือถือทุกบทบาทใช้แบบเดียวกับ CEO: หน้าหลักการ์ดเมนู + แถบล่างสามช่อง */
  const newMobile = true;
  /* ช่องแรกของแถบล่าง — หน้าหลักการ์ดเมนูของบทบาท (ต้นแบบ ceo-home.html · my-home.html .mh-tab) */
  const tabHome = { href: mobileHomeOf(role), label: "หน้าหลัก" };
  /*
   * แถบล่างบนมือถือตามแบบ (tabbar2): หน้าหลัก · แดชบอร์ด · ลงเวลา (ปุ่มกลางยกนูน) · การลา · โปรไฟล์
   * เลือกจากเมนูของบทบาทเอง บทบาทไหนไม่มีหน้านั้นก็ไม่มีช่อง ไม่ลิงก์ข้ามฝ่าย
   */
  const tabPunch = items.find((i) => i.href === "/");
  /*
   * สี่ช่องข้างของแถบล่าง — แต่ละคนเลือกเองได้ที่หน้าโปรไฟล์ (เจ้าของสั่ง 25 ก.ย. 2569)
   * ยังไม่เคยตั้งก็ใช้ชุดตั้งต้นตามแบบ · กรองอีกชั้นว่าหน้านั้นยังอยู่ในเมนูของบทบาทจริง
   * (ผู้ดูแลระบบปิดเมนูทีหลังได้ ช่องที่ตั้งไว้เดิมจึงต้องไม่พาไปหน้าที่เข้าไม่ได้)
   */
  const botPrefs = useBotnavPrefs();
  const botSlots = (() => {
    const allow = new Set(botnavChoices(items, role).map((c) => c.href));
    const saved = botnavOf(botPrefs, role);
    const base = saved ?? botnavDefault(items, role);
    return base.map((href) => (allow.has(href) ? href : BOTNAV_EMPTY));
  })();

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const unlock = lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  /*
   * การตั้งค่าระบบ (เวลาทำงาน วันหยุด อัตราภาษี ฯลฯ) ใช้ค่าจริงหลัง hydrate เท่านั้น — ดู system-settings.ts
   * พอค่าเปลี่ยน (โหลดครั้งแรกที่เคยแก้ไว้ หรือผู้ดูแลเพิ่งบันทึก) วาดเนื้อหาใหม่ด้วย key
   * เพราะหลายหน้าอ่านค่าผ่านฟังก์ชันธรรมดา ไม่ได้ subscribe เอง
   */
  const liveSettings = useLiveSettings();
  useEffect(() => {
    goLive();
  }, []);
  const settingsKey = settingsId(liveSettings);

  /* /review/<token> = หน้าลูกค้าตรวจงาน เปิดจากลิงก์โดยไม่ล็อกอิน ต้องไม่มีเมนูของระบบ */
  if (BARE_PAGES.includes(pathname) || pathname.startsWith("/review/")) return <Fragment key={settingsKey}>{children}</Fragment>;

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[70] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        ข้ามไปยังเนื้อหา
      </a>

      {/* ── แถบข้าง: สีแบรนด์ · มีเฉพาะจอกว้าง มือถือใช้ปุ่มเมนูกลมด้านบนแทน ── */}
      <aside
        className={[
          "app-side sidebar-skin z-50 flex-none flex-col rounded-none",
          newMobile ? "w-[236px]" : "w-[288px]",
          "md:sticky md:top-0 md:flex md:h-dvh md:translate-x-0",
          newMobile
            ? /* ทีมงานเข้าเมนูจากปุ่มกลมด้านบน จอแคบจึงไม่มีแถบข้างเลย */
              "hidden"
            : [
                "fixed inset-y-0 left-0 flex transition-transform duration-200 ease-out",
                drawerOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
              ].join(" "),
        ].join(" ")}
        aria-label="เมนูหลัก"
      >
        {/* หัวแถบ — เวิร์ดมาร์กอย่างเดียวตามดีไซน์ บทบาทไปอยู่ในเมนูผู้ใช้มุมขวาบนแทน */}
        {newMobile ? (
          /* หัวแถบ — เวิร์ดมาร์กอย่างเดียวตามดีไซน์ · อยู่กึ่งกลางแถบซ้าย (ผู้ใช้สั่ง 2 ต.ค. 2569 เดิมชิดซ้ายเกินไป) */
          <div className="flex flex-none items-center justify-center px-5 py-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/maz-logo.png" alt="MAZ" className="h-[26px] w-auto" />
          </div>
        ) : (
          /* บทบาทอื่นคงหัวแถบแบบเดิม — ตัวย่อในกล่องแดง ชื่อระบบ และบทบาทที่ล็อกอินอยู่ */
          <div className="flex flex-none items-center gap-3 border-b border-sidebar-border px-5 py-4">
            <span className="grid size-11 flex-none place-items-center rounded-[14px] bg-primary text-base font-bold tracking-[0.04em] text-primary-foreground">
              M
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <b className="block truncate text-[17px] font-bold">ERP MAZ</b>
              <span className="block truncate text-[13px] text-muted-foreground">
                {roleLabel(role)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
              aria-label="ปิดเมนู"
            >
              <CloseIcon className="size-5" />
            </button>
          </div>
        )}

        <nav className="scroll-stable flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-3.5 py-3">
          {/* กลุ่มที่เมนูถูกปิดหมด (แท็บเมนูที่ใช้ได้ ?s=positions&t=menu) ไม่ต้องขึ้นหัวข้อกลุ่มลอย ๆ */}
          {groups
            .map((group) => [group, items.filter((item) => item.group === group)] as const)
            .filter(([, list]) => list.length > 0)
            .map(([group, list]) => (
            <div key={group}>
              <p className="side-group first:pt-0">{group}</p>
              {list.map((item) => {
                const ItemIcon = ICONS[item.icon];
                const active = (current?.parent ?? current?.href) === item.href;
                return (
                  <Fragment key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`side-link${active ? " on" : ""}`}
                    >
                      <ItemIcon className="size-[17px] shrink-0" />
                      <span className="truncate">{item.label}</span>
                      {/* ดีลใหม่ที่ฝ่ายบัญชียังไม่ได้เปิดดู (AC-BR-01) */}
                      {item.href === "/acc/billing" && <BillingNavDot />}
                    </Link>
                    {/* เมนูย่อยกางใต้เมนูแม่ที่เปิดอยู่ แทนแถบชิปเหนือเนื้อหา (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                    {active && item.sub && <SideSub items={item.sub} pathname={pathname} />}
                  </Fragment>
                );
              })}
            </div>
          ))}
        </nav>

      </aside>

      {!newMobile && drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── ฝั่งเนื้อหา ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        {/* หน้าหลัก CEO บนมือถือไม่มีแถบบน — มีแต่คำทักทายกับการ์ดเมนู (ต้นแบบ ceo-home.html ซ่อน .tk-head) */}
        <header className={`app-top glass sticky top-0 z-30 flex h-[72px] items-center justify-between gap-4 rounded-none border-x-0 border-t-0 px-4 sm:px-6 ${pathname === tabHome.href ? "max-sm:hidden" : ""}`}>
          {/* จอใหญ่ — ชื่อหน้าและวันที่วันนี้ ตามดีไซน์ */}
          {!newMobile && (
            <div className="flex min-w-0 items-center gap-2.5 md:hidden">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="-ml-1 rounded-lg p-2 text-foreground hover:bg-muted"
                aria-label="เปิดเมนู"
              >
                <MenuIcon className="size-6" />
              </button>
              <p className="truncate text-base font-semibold">{title}</p>
            </div>
          )}

          <div className="hidden min-w-0 md:block">
            <p className="truncate text-[19px] leading-tight font-bold">{title}</p>
            <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
              <b className="font-semibold text-primary">{weekdayOf(today)}</b>{" "}
              {thaiDate(today)}
            </p>
          </div>

          {/* มือถือ — ชื่อหน้าตัวหนังสือธรรมดา ผู้ใช้สั่ง 22 ก.ย. 2569 เอาปุ่มเมนูกลมสีแดงออก
              ไปหน้าอื่นกดแท็บ "หน้าหลัก" ที่แถบล่าง */}
          {newMobile && (
            /*
              หัวหน้าจอมือถือตามแบบ (m-*-head): ปุ่มย้อนกลับเป็นวงกลมขาวซ้าย ชื่อหน้าอยู่กลาง
              ขวาเว้นไว้ให้กระดิ่ง ทั้งสามช่องกว้างเท่ากัน ชื่อหน้าจึงอยู่กลางจริง
            */
            <div className="grid min-w-0 flex-1 grid-cols-[44px_minmax(0,1fr)_44px] items-center md:hidden">
              {/* มือถือ: ปุ่มนี้กลับ "หน้าหลัก" การ์ดเมนูเสมอ (ผู้ใช้สั่ง 23 ก.ย. 2569)
                  กลับไปหน้าก่อนหน้าให้ใช้ลิงก์ในหน้า เช่น "กลับไปหน้าโปรเจค" หรือเส้นทางด้านบน */}
              <button
                type="button"
                aria-label="ย้อนกลับ"
                onClick={() => router.push(tabHome.href)}
                className="grid size-11 flex-none place-items-center rounded-full bg-card text-foreground shadow-[0_1px_2px_rgba(120,20,35,.05),0_12px_28px_-18px_rgba(120,20,35,.3)] active:bg-muted"
              >
                <ChevronLeftIcon className="size-5" strokeWidth={2.4} />
              </button>
              <p className="truncate text-center text-[18px] leading-tight font-bold">{title}</p>
              <span aria-hidden="true" />
            </div>
          )}

          {/* ทีมงานย้ายกระดิ่งกับเมนูผู้ใช้ไปแถบล่าง จอแคบจึงไม่มีตรงนี้ */}
          {/* กระดิ่งอยู่มุมขวาบนทุกจอ (ผู้ใช้สั่ง 22 ก.ย. 2569 ย้ายออกจากแถบล่าง) · เมนูผู้ใช้บนมือถืออยู่แถบล่าง */}
          <div className="ml-auto flex flex-none items-center gap-[9px] max-md:-ml-11">
            <NotificationMenu />
            <span className={newMobile ? "hidden md:contents" : "contents"}>
              <UserMenu />
            </span>
          </div>
        </header>

        {/* แถบชิปเมนูย่อยเหลือเฉพาะมือถือ — จอคอมย้ายไปเป็นเมนูย่อยในแถบข้างแล้ว (ผู้ใช้สั่ง 5 ต.ค. 2569)
            มือถือไม่มีแถบข้าง (newMobile) ชิปนี้จึงเป็นทางเดียวที่สลับหน้าย่อยได้ */}
        {current?.sub && (
          <div className="app-sub px-4 pt-[18px] sm:px-[30px] md:hidden">
            <SubNav items={current.sub} pathname={pathname} />
          </div>
        )}

        <main id="main" className="w-full min-w-0 flex-1 px-4 pt-[18px] pb-10 max-md:pb-[calc(94px+env(safe-area-inset-bottom))] sm:px-[30px]">
          {/* จอคอม — ทางกลับของหน้าย่อยที่ไม่มีในเมนู วางเหนือเนื้อหาเป็นลิงก์ข้อความ
              ไม่เอาไว้บนแถบบน เพราะปุ่มกลมเบียดชื่อหน้าแล้วดูไม่เข้ากับหัวหน้าจอ (เจ้าของทัก 28 ก.ย. 2569) */}
          {!blocked && !onMenuPage && !OWN_CRUMB.includes(pathname) && (
            /* .btn ประกาศ display เอง คลาส hidden/md:inline-flex จึงสู้ไม่ได้ ต้องซ่อนที่กล่องนอกแทน */
            <div className="mb-3 hidden md:block">
              <button type="button" onClick={() => router.back()} className="btn glass-thin gap-1.5">
                <ChevronLeftIcon className="size-4" strokeWidth={2.4} />
                ย้อนกลับ
              </button>
            </div>
          )}
          {blocked ? (
            /* ทุกบทบาทอยู่ในหน้าของตัวเองเท่านั้น — ลิงก์เก่าหรือพิมพ์ที่อยู่เองก็เข้าหน้าของบทบาทอื่นไม่ได้ */
            <section className="glass mx-auto mt-10 max-w-[520px] rounded-[16px] px-6 py-12 text-center">
              <h1 className="text-lg font-bold">หน้านี้ไม่ได้อยู่ในเมนูของ{roleLabel(role)}</h1>
              <p className="mt-2 text-[13.5px] text-muted-foreground">
                แต่ละบทบาทเปิดได้เฉพาะหน้าในเมนูของตัวเอง หรือผู้ดูแลระบบปิดเมนูนี้ไว้
              </p>
              {/* บทบาทจำแยกตามแท็บ แท็บใหม่ใช้บทบาทล่าสุดที่เข้าระบบ อาจไม่ใช่บทบาทที่ตั้งใจเปิดหน้านี้
                  ให้สลับเป็นบทบาทที่เปิดหน้านี้ได้ในคลิกเดียว ไม่ต้องออกแล้วเข้าใหม่ (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
              {ROLES.some((r) => r.key !== role && canVisit(pathname, r.key, access, route)) && (
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {ROLES.filter((r) => r.key !== role && canVisit(pathname, r.key, access, route)).map((r) => (
                    <button key={r.key} type="button" className="btn solid btn-solid" onClick={() => setRole(r.key)}>
                      เปิดในฐานะ{r.label}
                    </button>
                  ))}
                </div>
              )}
              {items[0] && (
                <Link href={items[0].href} className="btn glass-thin mt-3 inline-flex">
                  กลับไปหน้า{items[0].label}
                </Link>
              )}
            </section>
          ) : (
            <Fragment key={settingsKey}>{children}</Fragment>
          )}
        </main>
      </div>

      {/* ── เมนูล่างบนมือถือ — หน้าตาต่างกันตามบทบาท ── */}
      <nav
        className="botnav glass"
        aria-label="เมนูลัด"
        /* บางบทบาทไม่มีแดชบอร์ด ช่องเมนูจึงเหลือสี่ — แบ่งคอลัมน์ตามจำนวนจริง ไม่ให้เหลือช่องว่าง */
        /* ช่องที่ไม่ได้เลือกอะไรไว้จะไม่ขึ้น — แบ่งคอลัมน์ตามจำนวนช่องที่มีจริง ไม่ให้เหลือที่ว่าง */
        style={
          newMobile
            ? { gridTemplateColumns: `repeat(${botSlots.filter(Boolean).length + (tabPunch ? 1 : 0)}, 1fr)` }
            : undefined
        }
      >
        {newMobile ? (
          /*
            ตามแบบมือถือ: หน้าหลัก · แดชบอร์ด · ลงเวลา (ปุ่มกลาง) · การลา · โปรไฟล์
            ลงเวลาอยู่ตรงกลางเป็นปุ่มกลมยกนูน เพราะเป็นสิ่งที่ทุกคนกดทุกวัน
          */
          <>
            {/* ซ้ายสองช่อง · ปุ่มกลางลงเวลา · ขวาสองช่อง — ช่องว่างข้ามไปเลย */}
            {botSlots.slice(0, 2).map((href, i) => (
              <BotTab key={`l${i}-${href}`} href={href} items={items} role={role} pathname={pathname} />
            ))}
            {tabPunch && (
              <Link href={tabPunch.href} className="bn-mid" aria-label="ลงเวลา">
                <i>
                  <ClockIcon className="size-[26px]" strokeWidth={2.3} />
                </i>
                <span>ลงเวลา</span>
              </Link>
            )}
            {botSlots.slice(2).map((href, i) => (
              <BotTab key={`r${i}-${href}`} href={href} items={items} role={role} pathname={pathname} />
            ))}
          </>
        ) : (
          /* บทบาทอื่นคงของเดิม — สี่หน้าที่เข้าบ่อย ที่เหลือกด "อื่นๆ" เปิดลิ้นชัก */
          <>
            {bottomNav(role, access, route).map((item) => {
              const ItemIcon = ICONS[item.icon];
              const active = (current?.parent ?? current?.href) === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={active ? "on" : undefined}
                >
                  <ItemIcon className="size-[21px]" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <button type="button" onClick={() => setDrawerOpen(true)} aria-label="เมนูทั้งหมด">
              <MenuIcon className="size-[21px]" />
              <span>อื่นๆ</span>
            </button>
          </>
        )}
      </nav>
    </div>
  );
}

/*
 * หนึ่งช่องในแถบเมนูล่าง — ชื่อกับไอคอนอ่านจากเมนูของบทบาทเอง
 * ช่องว่าง (ยังไม่ได้เลือก) ไม่ขึ้นอะไรเลย
 */
function BotTab({
  href,
  items,
  role,
  pathname,
}: {
  href: string;
  items: NavItem[];
  role: Role;
  pathname: string;
}) {
  if (!href) return null;
  const found = botnavChoices(items, role).find((c) => c.href === href);
  if (!found) return null;
  const Icon = ICONS[found.icon] ?? HomeIcon;
  const on = pathname === href;
  return (
    <Link href={href} aria-current={on ? "page" : undefined} className={on ? "on" : undefined}>
      <Icon className="size-[22px]" />
      <span>{found.label}</span>
    </Link>
  );
}
