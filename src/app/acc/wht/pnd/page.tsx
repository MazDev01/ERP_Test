import { redirect } from "next/navigation";

/* บริษัทไม่ใช้ใบแนบ ภ.ง.ด.3 / ภ.ง.ด.53 — ถอดหน้านี้ออก ลิงก์เก่าพากลับหน้ายื่นภาษี (ผู้ใช้สั่ง 16 ต.ค. 2569) */
export default function Page() {
  redirect("/acc/wht");
}
