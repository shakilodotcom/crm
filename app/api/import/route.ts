import { clean, importPeople } from "@/lib/db";

// Accepts a backup file: either a list of people, or a database export where
// each entry is { id, data: {...} }.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const items: unknown[] = Array.isArray(body) ? body : Array.isArray(body?.people) ? body.people : [];
  const list = items.flatMap((it) => {
    if (!it || typeof it !== "object") return [];
    const o = it as Record<string, unknown>;
    const data = clean((o.data && typeof o.data === "object" ? o.data : o) as Record<string, unknown>);
    const id = typeof o.id === "string" && /^[\w-]{1,80}$/.test(o.id) ? o.id : crypto.randomUUID();
    return data.name ? [{ id, data }] : [];
  });
  if (!list.length) return Response.json({ error: "No people found in that file." }, { status: 400 });
  return Response.json({ added: await importPeople(list), total: list.length });
}
