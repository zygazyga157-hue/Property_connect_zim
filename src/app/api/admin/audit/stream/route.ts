import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { withApiErrors } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    let after = BigInt(new URL(request.url).searchParams.get("after") ?? "0");
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const poll = async () => {
          if (closed) return;
          try {
            const events = await prisma.auditEvent.findMany({
              where: { sequence: { gt: after } }, orderBy: { sequence: "asc" }, take: 100,
            });
            for (const event of events) {
              after = event.sequence;
              controller.enqueue(encoder.encode("data: " + JSON.stringify({ ...event, sequence: event.sequence.toString() }) + "\n\n"));
            }
            if (!events.length) controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            controller.enqueue(encoder.encode("event: error\ndata: {\"message\":\"Audit feed temporarily unavailable.\"}\n\n"));
          }
          timer = setTimeout(poll, 5000);
        };
        void poll();
      },
      cancel() {
        closed = true;
        if (timer) clearTimeout(timer);
      },
    });
    return new Response(stream, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
    });
  });
}
