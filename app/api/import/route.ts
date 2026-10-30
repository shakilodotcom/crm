import { createPerson, db } from "@/lib/db";
import { csvToPeople } from "@/lib/csv";

export async function POST(req: Request) {
  const { csv, groupId } = await req.json().catch(() => ({}));
  const rows = csvToPeople(String(csv ?? ""));
  if (!rows.length) {
    return Response.json({ error: "No people found. The first row needs headers such as name, email, company." }, { status: 400 });
  }
  db.transaction(() => {
    for (const r of rows) createPerson({ ...r, groupIds: groupId ? [String(groupId)] : [] });
  })();
  return Response.json({ imported: rows.length });
}
