import { redirect } from "next/navigation";

/* ใบเสร็จรวมเข้าหน้าวางบิลแล้ว — ที่อยู่เดิมพาไปแท็บใบเสร็จ (ผู้ใช้สั่ง 9 ต.ค. 2569) */
export default function Page() {
  redirect("/acc/billing?tab=rc");
}
