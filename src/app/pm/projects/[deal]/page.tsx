import { redirect } from "next/navigation";

/*
 * ลิงก์เก่ารูปแบบ /pm/projects/<เลขดีล หรือเลขที่โปรเจค> — ส่งต่อไปที่ /pm/projects?pj=<เลขเดิม>
 * ให้รายละเอียดโปรเจคมีที่อยู่เดียว (หน้าโฟลเดอร์ = หน้าแรก · ?pj= = หน้าหลังคลิกเข้าไป)
 * หน้ารายละเอียดหาโปรเจคได้ทั้งจากเลข PJ และเลขดีลเดิม (isRef — ผู้ใช้สั่ง 5 ต.ค. 2569)
 * Next รุ่นนี้ส่ง params มาเป็น Promise ต้อง await ก่อนใช้
 */
export default async function Page({ params }: { params: Promise<{ deal: string }> }) {
  const { deal } = await params;
  redirect(`/pm/projects?pj=${encodeURIComponent(decodeURIComponent(deal))}`);
}
