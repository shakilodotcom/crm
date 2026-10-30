import { listGroups, listPeople } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { STAGES } from "@/lib/types";

export const dynamic = "force-dynamic";

export function GET() {
  const groups = new Map(listGroups().map((g) => [g.id, g.name]));
  const rows = [
    ["name", "email", "phone", "company", "role", "link", "stage", "groups", "follow up", "last touch"],
    ...listPeople().map((p) => [
      p.name, p.email, p.phone, p.company, p.role, p.link,
      STAGES.find((s) => s.id === p.stage)?.label ?? p.stage,
      p.groupIds.map((id) => groups.get(id)).filter(Boolean).join("; "),
      p.followUp ?? "", p.lastTouch ?? "",
    ]),
  ];
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="people-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
