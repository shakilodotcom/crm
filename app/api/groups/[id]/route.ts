import { deleteGroup, renameGroup } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { name } = await req.json().catch(() => ({}));
  const n = String(name ?? "").trim().slice(0, 80);
  if (!n) return Response.json({ error: "Give the group a name." }, { status: 400 });
  renameGroup(id, n);
  return new Response(null, { status: 204 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  deleteGroup(id);
  return new Response(null, { status: 204 });
}
