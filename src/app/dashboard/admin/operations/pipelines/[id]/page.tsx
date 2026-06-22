import { PipelineDetailClient } from "./pipeline-detail-client";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PipelineDetailPage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <PipelineDetailClient companyId={id} />
    </div>
  );
}
