import { CheckinScreen } from "@/components/checkin-screen";

export const metadata = { title: "เวลาทำงาน — ERP MAZ" };

export default function Page() {
  return (
    <div className="mx-auto max-w-[920px]">
      <CheckinScreen embedded />
    </div>
  );
}
