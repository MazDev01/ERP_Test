import { CeoView } from "@/components/ceo-view";
import { DashboardPage } from "@/components/dashboard-page";

export const metadata = { title: "งานขาย — ERP MAZ" };

/* ต้นแบบ ceo-sales.html — แดชบอร์ดขายแบบดูอย่างเดียว ปุ่ม "ดูทั้งหมดในหน้าดีล" ไปหน้าดีลของ CEO */
export default function Page() {
  return (
    <CeoView>
      {/* CEO ไม่มีหน้าตารางงานของฝ่ายขาย — ปฏิทินไม่ลิงก์ออก (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
      <DashboardPage dealsHref="/ceo/deals" scheduleHref="" />
    </CeoView>
  );
}
