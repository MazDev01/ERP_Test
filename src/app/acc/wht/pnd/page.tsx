import { Suspense } from "react";
import { AccWhtPndPage } from "@/components/acc-wht-forms";

export const metadata = { title: "ใบแนบ ภ.ง.ด.3 / ภ.ง.ด.53 — ERP MAZ" };

/* อยู่ใต้เมนูหัก ณ ที่จ่าย สิทธิ์เข้าหน้าตามเมนูนั้น (ผู้ใช้สั่ง 9 ต.ค. 2569) */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AccWhtPndPage />
    </Suspense>
  );
}
