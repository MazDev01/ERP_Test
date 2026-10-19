import { redirect } from "next/navigation";

/* เลิกหน้าข้อมูลตัวอย่างแล้ว ลิงก์เก่าพาไปหน้าตั้งค่า (ผู้ใช้สั่ง 13 ต.ค. 2569) */
export default function Page() {
  redirect("/admin/settings?s=staff");
}
