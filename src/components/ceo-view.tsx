"use client";

/*
 * ครอบหน้าของฝ่ายอื่นให้ CEO ดูอย่างเดียว (ต้นแบบ dose-erp-maz/ceo-*.html · body.ceov)
 *
 * ใช้คอมโพเนนต์เดียวกับหน้าของฝ่ายนั้น ตัวเลขจึงตรงกันเสมอ ไม่ต้องคัดลอกหน้า
 * - ลิงก์ที่พาไปหน้าของฝ่ายอื่นกดไม่ได้ (กติกาห้ามลิงก์ข้ามบทบาท) แสดงเป็นข้อความธรรมดา
 *   ลิงก์ที่ขึ้นต้นด้วย /ceo ยังกดได้ — หน้าไหนต้องพาไปหน้าของ CEO ให้ส่ง href เข้าคอมโพเนนต์เอง
 * - ปุ่มที่เปลี่ยนข้อมูลของฝ่ายนั้นใส่ data-ceo-hide ไว้ในคอมโพเนนต์ ที่นี่ซ่อนให้
 * กันที่จังหวะ click (capture) จึงครอบทั้งเมาส์และกด Enter บนลิงก์
 */

export function CeoView({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="ceo-view"
      onClickCapture={(e) => {
        const a = (e.target as Element).closest("a[href]");
        const href = a?.getAttribute("href") ?? "";
        if (!a || href.startsWith("/ceo") || href.startsWith("#")) return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}
