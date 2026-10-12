import { Suspense } from "react";
import { AccQuotationsPage } from "@/components/acc-quotations-page";

export const metadata = { title: "ใบเสนอราคา — ERP MAZ" };

/* ต้นแบบ acc-quotations.html — ใบเสนอราคาของลูกค้าจริงในเมนูบัญชี (ผู้ใช้สั่ง 9 ต.ค. 2569) */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AccQuotationsPage />
    </Suspense>
  );
}
