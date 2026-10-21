import { WorkspacePage } from "@/components/workspace-page";

type Props = { params: Promise<{ section?: string[] }> };

export default async function AdminWorkspace({ params }: Props) {
  const { section = ["dashboard"] } = await params;
  return <WorkspacePage kind="admin" section={section} />;
}
