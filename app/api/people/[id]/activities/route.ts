import { addActivity, deleteActivity, getPerson, listActivities } from "@/lib/db";
import { ACTIVITY_KINDS } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return Response.json(listActivities(id));
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getPerson(id)) return Response.json({ error: "Person not found" }, { status: 404 });
  const { kind, body } = await req.json().catch(() => ({}));
  const text = String(body ?? "").trim();
  if (!ACTIVITY_KINDS.includes(kind) || !text) {
    return Response.json({ error: "Write something to log, and pick note, call, email or meeting." }, { status: 400 });
  }
  return Response.json(addActivity(id, kind, text.slice(0, 5000)), { status: 201 });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const activityId = new URL(req.url).searchParams.get("activity");
  if (activityId) deleteActivity(id, activityId);
  return new Response(null, { status: 204 });
}
