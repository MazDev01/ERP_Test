/*
 * รวมรายการที่ผู้ดูแลระบบตั้งไว้ (settings().catalog) กับชุดตั้งต้นของระบบ
 * ชุดตั้งต้นลบไม่ได้ — ถ้าหายจากค่าที่บันทึกไว้ เติมกลับต่อท้ายให้ ข้อมูลเก่าที่อ้างรหัสนั้นจะได้ไม่พัง
 */

export function merged<T>(saved: T[] | undefined, builtins: T[], id: (t: T) => string): T[] {
  if (!saved) return builtins;
  const have = new Set(saved.map(id));
  return [...saved, ...builtins.filter((b) => !have.has(id(b)))];
}

/** รหัสใหม่ของรายการที่ผู้ดูแลระบบเพิ่มเอง */
export function newCatalogKey() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}
