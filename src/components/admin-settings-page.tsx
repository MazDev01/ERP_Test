"use client";

/*
 * ตั้งค่าระบบ — หน้าเดียวรวมทุกหัวข้อ (ต้นแบบ "ตั้งค่าระบบ — ERP MAZ.html" ที่เจ้าของส่งมา 28 ก.ย. 2569)
 *
 * 5 หมวดเลือกจากเมนูย่อยในแถบข้าง (?s=) หัวข้อในหมวดเป็นแท็บในหน้า (?t=) (ผู้ใช้สั่ง 13 ต.ค. 2569)
 * เนื้อในแต่ละแท็บยังเป็นคอมโพเนนต์เดิมที่ใช้งานและทดสอบแล้ว ไม่ได้เขียนใหม่
 * ชื่อหมวดขึ้นเป็นหัวหน้า แถบแท็บอยู่ใต้แถวหัวหน้า ปุ่มของแท็บอยู่ขวาแถวเดียวกัน (SettingsHeadContext)
 */

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { legacySettingsQuery, settingsOf, type SettingsTabKey } from "@/lib/nav";
import { useCrumb } from "@/lib/crumb";
import { SettingsHeadContext } from "./admin-ui";
import { AdminOptionsPage } from "./admin-options-page";
import { AdminPositionsPane } from "./admin-positions-page";
import { AdminLeavePage } from "./admin-leave-page";
import { AdminHolidaysPage } from "./admin-holidays-page";
import { AdminAttendancePage } from "./admin-attendance-page";
import { AdminRatesPage } from "./admin-rates-page";
import { AdminCompanyPage } from "./admin-company-page";
import { AdminLogPage } from "./admin-log-page";
import { AdminProposalTemplatesPage } from "./admin-proposal-templates-page";

/* แท็บที่เพิ่มต่อท้ายหมวด — แม่แบบ Proposal ในหมวดงานขาย (ผู้ใช้สั่ง 14 ต.ค. 2569)
   ยังไม่ได้อยู่ใน SETTINGS_DOMAINS ของ nav.ts จึงต่อท้ายตรงนี้ */
const EXTRA_TABS: Record<string, { key: string; label: string }[]> = {
  /* เอาแท็บแม่แบบ Proposal ออก (ผู้ใช้สั่ง 16 ต.ค. 2569) */
};

/** หัวข้อที่สองในแท็บเดียวกัน — หัวข้อย่อยแทนหัวหน้าหน้า */
function Sub({ children }: { children: ReactNode }) {
  return <SettingsHeadContext.Provider value={{ sub: true }}>{children}</SettingsHeadContext.Provider>;
}

function Section({ tab }: { tab: SettingsTabKey }) {
  switch (tab) {
    /* ── พนักงาน ── */
    case "depts":
      return <AdminOptionsPage only="depts" />;
    case "positions":
      return <AdminPositionsPane />;
    case "attendance":
      return <AdminAttendancePage />;
    case "holidays":
      return <AdminHolidaysPage />;
    case "leave":
      return <AdminLeavePage />;
    case "payroll":
      /* รอบเงินเดือน เริ่มนับโอที การหักมาสาย ขึ้นบนสุดของแท็บ ใต้หัวหน้า (ผู้ใช้สั่ง 13 ต.ค. 2569) */
      return <AdminRatesPage payLate />;
    case "expense":
      return <AdminOptionsPage only="expenseKind" />;
    case "info":
      return <AdminOptionsPage keys={["sex", "eduLevel", "docs"]} />;
    /* ── งานขาย ── */
    case "services":
      /* เอาตารางประเภทงาน → ตำแหน่งออก — คำขอก่อนการขายกลับไปเลือกตัวคน (ผู้ใช้สั่ง 14 ต.ค. 2569) */
      return <AdminOptionsPage only="services" />;
    case "source":
      return <AdminOptionsPage only="leadSource" />;
    case "channel":
      return <AdminOptionsPage only="leadChannel" />;
    /* ── บัญชีและภาษี ── */
    case "tax":
      /* อัตรา VAT/หัก ณ ที่จ่าย + ประเภทเงินได้พร้อมอัตรา อยู่แท็บเดียวกัน (ผู้ใช้สั่ง 13 ต.ค. 2569) */
      return (
        <div className="space-y-4">
          <AdminRatesPage taxOnly />
          <Sub>
            <AdminOptionsPage only="whtTypes" />
          </Sub>
        </div>
      );
    case "issuer":
      return <AdminCompanyPage />;
    /* ── ระบบ ── */
    case "log":
      return <AdminLogPage />;
  }
}

/**
 * หมวดมาจาก ?s= แท็บมาจาก ?t= — ?s= แบบเก่าและ #hash เก่าถูกพาไปหมวด/แท็บใหม่
 * หน้าที่เรียกต้องมี Suspense คร่อมที่ page.tsx เพราะ useSearchParams
 */
export function AdminSettingsPage() {
  const q = useSearchParams();
  const here = usePathname();
  const router = useRouter();
  const { domain, tab: navTab } = settingsOf(new URLSearchParams(q.toString()));
  const allTabs: { key: string; label: string }[] = [...domain.tabs, ...(EXTRA_TABS[domain.key] ?? [])];
  const extraTab = EXTRA_TABS[domain.key]?.find((x) => x.key === q.get("t"));
  const tab = extraTab ?? navTab;
  const many = allTabs.length > 1;

  /* ลิงก์เก่า (?s=positions, #holidays …) เปลี่ยนที่อยู่เป็นแบบใหม่ครั้งเดียว */
  useEffect(() => {
    const next = legacySettingsQuery(new URLSearchParams(q.toString()), window.location.hash.replace("#", ""));
    if (next) router.replace(`${here}?${next}`);
  }, [q, here, router]);

  /* แถบบน: ตั้งค่าระบบ / หมวด / แท็บ — หมวดที่มีแท็บเดียวจบที่ชื่อหมวด */
  useCrumb(many && tab.label);

  function go(t: string) {
    router.replace(`${here}?s=${domain.key}&t=${t}`, { scroll: false });
  }

  const tabs = many ? (
    <div className="tabs" role="tablist" aria-label={domain.label}>
      {allTabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={tab.key === t.key}
          className={tab.key === t.key ? "on" : ""}
          onClick={() => go(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    <SettingsHeadContext.Provider value={{ title: domain.label, tabs }}>
      <div className="min-w-0">
        {/* key = แท็บ — สลับแท็บแล้วร่างของแท็บเดิมไม่ค้างไปปนกับแท็บใหม่ */}
        {extraTab ? <AdminProposalTemplatesPage key={extraTab.key} /> : <Section key={navTab.key} tab={navTab.key} />}
      </div>
    </SettingsHeadContext.Provider>
  );
}
