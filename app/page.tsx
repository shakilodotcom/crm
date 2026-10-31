import Crm from "@/components/Crm";
import { listPeople } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <Crm initialPeople={await listPeople()} />;
}
