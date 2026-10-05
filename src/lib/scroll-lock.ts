"use client";

/*
 * ล็อกไม่ให้พื้นหลังเลื่อนตอนเปิดกล่องทับหน้า
 *
 * นับชั้นไว้ เพราะกล่องซ้อนกันได้ (เช่นเปิดฟอร์มแล้วมีกล่องยืนยันซ้อนอีกที)
 * ถ้าปลดล็อกทันทีที่ตัวในสุดปิด พื้นหลังจะเลื่อนได้ทั้งที่ยังมีกล่องค้างอยู่
 *
 * จองที่แถบเลื่อนเฉพาะตอนล็อก และเฉพาะหน้าที่มีแถบเลื่อนอยู่จริง (วัดตอนล็อกชั้นแรก)
 * ไม่จองไว้ตลอด ไม่งั้นจะเห็นแถบว่างที่ขอบขวาของทุกหน้า และแถบบนไปไม่สุดจอ
 */

let depth = 0;

export function lockScroll() {
  if (depth === 0) {
    const root = document.documentElement;
    /* มีแถบเลื่อนอยู่ → ซ่อนแล้วหน้าจะกว้างขึ้น จึงจองที่เท่าเดิมไว้ */
    if (window.innerWidth > root.clientWidth) root.style.scrollbarGutter = "stable";
  }
  depth += 1;
  document.body.classList.add("modal-open");
  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth = Math.max(0, depth - 1);
    if (depth === 0) {
      document.body.classList.remove("modal-open");
      document.documentElement.style.scrollbarGutter = "";
    }
  };
}
