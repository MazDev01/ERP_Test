/*
 * กติกาความยาว/ความซับซ้อนของรหัสผ่าน — ที่เดียวทั้งระบบ
 * ใช้ทั้งหน้าตั้งรหัสผ่านใหม่ และแท็บความปลอดภัยในหน้าโปรไฟล์
 * TODO: ให้ตรงกับกติกาฝั่งเซิร์ฟเวอร์เมื่อต่อ auth แล้ว
 */

export const PASSWORD_MIN = 8;

export const PASSWORD_HINT =
  "อย่างน้อย 8 ตัวอักษร ประกอบด้วยตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก และตัวเลข";

export type PasswordCheck = { key: string; label: string; pass: boolean };

export function checkPassword(value: string): PasswordCheck[] {
  return [
    { key: "len", label: `ยาวอย่างน้อย ${PASSWORD_MIN} ตัวอักษร`, pass: value.length >= PASSWORD_MIN },
    { key: "upper", label: "มีตัวพิมพ์ใหญ่", pass: /[A-Z]/.test(value) },
    { key: "lower", label: "มีตัวพิมพ์เล็ก", pass: /[a-z]/.test(value) },
    { key: "digit", label: "มีตัวเลข", pass: /\d/.test(value) },
  ];
}

export function passwordOk(value: string) {
  return checkPassword(value).every((c) => c.pass);
}
