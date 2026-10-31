import { clean, deletePerson, updatePerson } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const saved = await updatePerson(id, clean(await req.json().catch(() => ({}))));
  if (!saved) return Response.json({ error: "That person no longer exists." }, { status: 404 });
  return Response.json(saved);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await deletePerson(id);
  return new Response(null, { status: 204 });
}
