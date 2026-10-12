"use client";

/*
 * ตั้งค่าระบบ — หน้าเดียวรวมทุกหัวข้อ (ต้นแบบ "ตั้งค่าระบบ — ERP MAZ.html" ที่เจ้าของส่งมา 28 ก.ย. 2569)
 *
 * หัวข้อแบ่งสามกลุ่ม เลือกจากเมนูย่อยในแถบข้าง (?s=) หน้านี้แสดงเฉพาะหัวข้อที่เลือก (ผู้ใช้สั่ง 5 ต.ค. 2569)
 * เนื้อในแต่ละหัวข้อยังเป็นคอมโพเนนต์เดิมที่ใช้งานและทดสอบแล้ว ไม่ได้เขียนใหม่
 * หน้าเดิม (/admin/leave, /admin/rates, …) ยังเปิดตรงได้ เพราะกระดิ่งและลิงก์เก่าชี้ไปที่นั่น
 */

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SETTINGS_SECTIONS, settingsKeyOf, type SettingsKey } from "@/lib/nav";
import { AdminOptionsPage } from "./admin-options-page";
import { AdminPositionsPage } from "./admin-positions-page";
import { AdminLeavePage } from "./admin-leave-page";
import { AdminHolidaysPage } from "./admin-holidays-page";
import { AdminAttendancePage, PayAndLate } from "./admin-attendance-page";
import { AdminRatesPage } from "./admin-rates-page";
import { AdminCompanyPage } from "./admin-company-page";

type SecKey = SettingsKey;

function Section({ sec }: { sec: SecKey }) {
  switch (sec) {
    case "master":
      return <AdminOptionsPage />;
    case "positions":
      return <AdminPositionsPage />;
    case "leave":
      return <AdminLeavePage />;
    case "holidays":
      return <AdminHolidaysPage />;
    case "attendance":
      return <AdminAttendancePage />;
    case "payroll":
      /* รอบเงินเดือน เริ่มนับโอที การหักมาสาย อยู่ท้ายหน้านี้ — ย้ายมาจากเวลาทำงานและจุดลงเวลา (ผู้ใช้สั่ง 6 ต.ค. 2569) */
      return (
        <div className="space-y-4">
          <AdminRatesPage />
          <PayAndLate />
        </div>
      );
    case "wht":
      /* เมนู "ภาษี" — อัตรา VAT/หัก ณ ที่จ่าย ย้ายมาจากการคำนวณเงินเดือน (ผู้ใช้สั่ง 6 ต.ค. 2569) */
      /* ไม่มีตารางประเภทเงินได้และตัวอย่างการหัก (ผู้ใช้สั่ง 6 ต.ค. 2569) */
      return <AdminRatesPage taxOnly />;
    case "issuer":
      return <AdminCompanyPage />;
  }
}

/**
 * หัวข้อที่เปิดอยู่มาจาก ?s= — เลือกจากเมนูย่อยในแถบข้าง (จอคอม) หรือแถบชิปเมนูย่อย (มือถือ)
 * รายการหัวข้อในเนื้อหาหน้าเอาออกแล้ว เนื้อหัวข้อกินเต็มความกว้าง (ผู้ใช้สั่ง 5 ต.ค. 2569)
 * หน้าที่เรียกต้องมี Suspense คร่อมที่ page.tsx เพราะ useSearchParams
 */
export function AdminSettingsPage() {
  const q = useSearchParams();
  const here = usePathname();
  const router = useRouter();
  const sec = settingsKeyOf(q);

  /* ลิงก์เก่าแบบ #hash (เช่น /admin/settings#holidays) ยังใช้ได้ — อ่านครั้งเดียวแล้วเปลี่ยนเป็น ?s= */
  useEffect(() => {
    const id = window.location.hash.replace("#", "");
    if (!q.get("s") && SETTINGS_SECTIONS.some((x) => x.key === id)) router.replace(`${here}?s=${id}`);
  }, [q, here, router]);

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <Section sec={sec} />
      </div>
    </div>
  );
}
