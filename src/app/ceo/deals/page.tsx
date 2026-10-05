import { Suspense } from "react";
import { CeoView } from "@/components/ceo-view";
import { DealsPage } from "@/components/deals-page";

export const metadata = { title: "ดีลและใบงาน — ERP MAZ" };

/* ต้นแบบ ceo-deals.html — รายการดีลแบบดูอย่างเดียว · ?find= ยังใช้เจาะดีลเดียวได้ */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <CeoView>
        <DealsPage ceo />
      </CeoView>
    </Suspense>
  );
}
