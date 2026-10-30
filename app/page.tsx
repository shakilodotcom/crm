import Crm from "@/components/Crm";
import { listGroups, listPeople } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function Page() {
  return <Crm initialPeople={listPeople()} initialGroups={listGroups()} />;
}
