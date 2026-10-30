import { listGroups, listPeople } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ people: listPeople(), groups: listGroups() });
}
