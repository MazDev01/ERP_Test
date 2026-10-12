import { Suspense } from "react";
import { AccWhtCertPage } from "@/components/acc-wht-forms";

export const metadata = { title: "หนังสือรับรองการหักภาษี ณ ที่จ่าย — ERP MAZ" };

/* อยู่ใต้เมนูหัก ณ ที่จ่าย สิทธิ์เข้าหน้าตามเมนูนั้น (ผู้ใช้สั่ง 9 ต.ค. 2569) */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AccWhtCertPage />
    </Suspense>
  );
}
