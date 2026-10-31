import Crm from "@/components/Crm";
import { listPeople } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  let people;
  try {
    people = await listPeople();
  } catch (e) {
    console.error(e);
    const missing = !process.env.DATABASE_URL && !process.env.POSTGRES_URL;
    return (
      <main className="login">
        <p className="error">
          {missing
            ? "You're signed in, but no database is connected yet. In Vercel, open Storage, create a Neon database, connect it to this project, then redeploy."
            : "You're signed in, but the database didn't answer. Try again in a minute; if it keeps happening, check the database in Vercel's Storage tab."}
        </p>
      </main>
    );
  }
  return <Crm initialPeople={people} />;
}
