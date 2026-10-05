import { CeoView } from "@/components/ceo-view";
import { HrDashboardPage } from "@/components/hr-dashboard-page";

export const metadata = { title: "บุคคล — ERP MAZ" };

/* ต้นแบบ ceo-hr.html — แดชบอร์ดฝ่ายบุคคลแบบดูอย่างเดียว ซ่อนปุ่มจัดการเงินเดือน · ปุ่มอนุมัติลาฝึกงานยังอยู่ตามต้นแบบ */
export default function Page() {
  return (
    <CeoView>
      <HrDashboardPage />
    </CeoView>
  );
}
