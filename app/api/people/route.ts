import { clean, createPerson } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return Response.json(createPerson(clean(body)), { status: 201 });
}
