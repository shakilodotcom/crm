import { randomUUID } from "node:crypto";
import { clean, listPeople, savePerson } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await listPeople());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" && /^[\w-]{1,80}$/.test(body.id) ? body.id : randomUUID();
  const data = clean(body);
  if (!data.name) return Response.json({ error: "Give them a name." }, { status: 400 });
  return Response.json(await savePerson(id, data), { status: 201 });
}
