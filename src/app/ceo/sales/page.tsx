import { CeoView } from "@/components/ceo-view";
import { DashboardPage } from "@/components/dashboard-page";

export const metadata = { title: "งานขาย — ERP MAZ" };

/* ต้นแบบ ceo-sales.html — แดชบอร์ดขายแบบดูอย่างเดียว ปุ่ม "ดูทั้งหมดในหน้าดีล" ไปหน้าดีลของ CEO */
export default function Page() {
  return (
    <CeoView>
      <DashboardPage dealsHref="/ceo/deals" />
    </CeoView>
  );
}
