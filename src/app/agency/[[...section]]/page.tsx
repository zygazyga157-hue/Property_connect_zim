import { WorkspacePage } from "@/components/workspace-page";

type Props = { params: Promise<{ section?: string[] }> };

export default async function AgencyWorkspace({ params }: Props) {
  const { section = ["dashboard"] } = await params;
  return <WorkspacePage kind="agency" section={section} />;
}
