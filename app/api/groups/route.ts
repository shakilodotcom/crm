import { createGroup } from "@/lib/db";

export async function POST(req: Request) {
  const { name } = await req.json().catch(() => ({}));
  const n = String(name ?? "").trim().slice(0, 80);
  if (!n) return Response.json({ error: "Give the group a name." }, { status: 400 });
  return Response.json(createGroup(n), { status: 201 });
}
