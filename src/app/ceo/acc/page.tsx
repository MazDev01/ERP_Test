import { AccDashboardPage } from "@/components/acc-dashboard-page";
import { CeoView } from "@/components/ceo-view";

export const metadata = { title: "บัญชี — ERP MAZ" };

/* ต้นแบบ ceo-acc.html — แดชบอร์ดบัญชีแบบดูอย่างเดียว */
export default function Page() {
  return (
    <CeoView>
      <AccDashboardPage />
    </CeoView>
  );
}
