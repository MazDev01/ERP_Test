import { Suspense } from "react";
import { ExpensePage } from "@/components/expense-page";

export const metadata = { title: "เบิกค่าใช้จ่าย — ERP MAZ" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ExpensePage />
    </Suspense>
  );
}
