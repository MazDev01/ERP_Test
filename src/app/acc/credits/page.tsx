import { redirect } from "next/navigation";

/* ระบบไม่มีใบลดหนี้/ใบเพิ่มหนี้/คืนเงิน — ที่อยู่เดิมพาไปหน้าวางบิล (ผู้ใช้สั่ง 14 ต.ค. 2569) */
export default function Page() {
  redirect("/acc/billing");
}
