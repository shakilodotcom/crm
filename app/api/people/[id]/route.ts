import { clean, deletePerson, getPerson, updatePerson } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getPerson(id)) return Response.json({ error: "Person not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  return Response.json(updatePerson(id, clean(body)));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  deletePerson(id);
  return new Response(null, { status: 204 });
}
