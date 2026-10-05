import { CeoView } from "@/components/ceo-view";
import { PmDashboardPage } from "@/components/pm-dashboard-page";

export const metadata = { title: "โปรเจค — ERP MAZ" };

/* ต้นแบบ ceo-pm.html — แดชบอร์ด PM แบบดูอย่างเดียว */
export default function Page() {
  return (
    <CeoView>
      <PmDashboardPage />
    </CeoView>
  );
}
