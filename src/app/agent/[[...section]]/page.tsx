import { WorkspacePage } from "@/components/workspace-page";

type Props = { params: Promise<{ section?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AgentWorkspace({ params, searchParams }: Props) {
  const { section = ["dashboard"] } = await params;
  return <WorkspacePage kind="agent" section={section} searchParams={searchParams} />;
}
