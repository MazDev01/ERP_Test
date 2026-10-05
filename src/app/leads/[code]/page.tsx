import { LeadDetailPage } from "@/components/lead-detail-page";

export const metadata = { title: "รายละเอียดผู้สนใจ — ERP MAZ" };

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <LeadDetailPage code={decodeURIComponent(code)} />;
}
