import postgres from "postgres";
import type { List, Person } from "./types";

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

// One small pool per server instance, reused across hot reloads in dev.
const g = globalThis as unknown as { __sql?: postgres.Sql };
function client() {
  if (!url) throw new Error("No database connected. Add a Postgres database to the project (it sets DATABASE_URL).");
  return (g.__sql ??= postgres(url, {
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
    max: 3,
    idle_timeout: 20,
    prepare: false, // works with pooled connection strings
  }));
}

let schema: Promise<unknown> | undefined;
async function ready() {
  const sql = client();
  schema ??= sql`
    CREATE TABLE IF NOT EXISTS people (
      id text PRIMARY KEY,
      name text NOT NULL DEFAULT '',
      about text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '',
      list text NOT NULL DEFAULT 'clients',
      archived boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`.catch((e) => { schema = undefined; throw e; });
  await schema;
  return sql;
}

type Row = { id: string; name: string; about: string; notes: string; list: string; archived: boolean; created_at: Date };

const toPerson = (r: Row): Person => ({
  id: r.id, name: r.name, about: r.about, notes: r.notes,
  list: r.list === "team" ? "team" : "clients",
  archived: r.archived, createdAt: r.created_at.toISOString(),
});

/** Keep only known fields, trimmed to sane lengths. */
export function clean(input: Record<string, unknown>) {
  const out: Partial<Omit<Person, "id">> = {};
  if (typeof input.name === "string") out.name = input.name.trim().slice(0, 120);
  if (typeof input.about === "string") out.about = input.about.trim().slice(0, 200);
  if (typeof input.notes === "string") out.notes = input.notes.slice(0, 20000);
  if (input.list === "clients" || input.list === "team") out.list = input.list as List;
  if (typeof input.archived === "boolean") out.archived = input.archived;
  if (typeof input.createdAt === "string" && !Number.isNaN(Date.parse(input.createdAt))) out.createdAt = input.createdAt;
  return out;
}

export async function listPeople(): Promise<Person[]> {
  const sql = await ready();
  const rows = await sql<Row[]>`SELECT * FROM people ORDER BY lower(name)`;
  return rows.map(toPerson);
}

/** Create a person, or put one back exactly as it was (used by Undo). */
export async function savePerson(id: string, p: ReturnType<typeof clean>): Promise<Person> {
  const sql = await ready();
  const [row] = await sql<Row[]>`
    INSERT INTO people (id, name, about, notes, list, archived, created_at)
    VALUES (${id}, ${p.name ?? ""}, ${p.about ?? ""}, ${p.notes ?? ""}, ${p.list ?? "clients"}, ${p.archived ?? false}, ${p.createdAt ?? new Date().toISOString()})
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, about = EXCLUDED.about, notes = EXCLUDED.notes,
      list = EXCLUDED.list, archived = EXCLUDED.archived, updated_at = now()
    RETURNING *`;
  return toPerson(row);
}

export async function updatePerson(id: string, p: ReturnType<typeof clean>): Promise<Person | null> {
  const sql = await ready();
  const { createdAt: _, ...fields } = p;
  if (!Object.keys(fields).length) return null;
  const [row] = await sql<Row[]>`UPDATE people SET ${sql(fields)}, updated_at = now() WHERE id = ${id} RETURNING *`;
  return row ? toPerson(row) : null;
}

export async function deletePerson(id: string) {
  const sql = await ready();
  await sql`DELETE FROM people WHERE id = ${id}`;
}

/** Add people from a backup. Anyone already here (same id) is left untouched. */
export async function importPeople(list: { id: string; data: ReturnType<typeof clean> }[]) {
  const sql = await ready();
  let added = 0;
  await sql.begin(async (tx) => {
    for (const { id, data: p } of list) {
      const r = await tx`
        INSERT INTO people (id, name, about, notes, list, archived, created_at)
        VALUES (${id}, ${p.name ?? ""}, ${p.about ?? ""}, ${p.notes ?? ""}, ${p.list ?? "clients"}, ${p.archived ?? false}, ${p.createdAt ?? new Date().toISOString()})
        ON CONFLICT (id) DO NOTHING`;
      added += r.count;
    }
  });
  return added;
}
