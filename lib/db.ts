import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { STAGES, type Activity, type ActivityKind, type Group, type Person, type Stage } from "./types";

const file = process.env.CRM_DB ?? path.join(process.cwd(), "data", "crm.db");

function open() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      link TEXT NOT NULL DEFAULT '',
      stage TEXT NOT NULL DEFAULT 'new',
      follow_up TEXT,
      last_touch TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      hue INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS person_groups (
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      PRIMARY KEY (person_id, group_id)
    );
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      body TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS activities_person ON activities(person_id, at DESC);
  `);
  return db;
}

// Reuse one connection across hot reloads in dev.
const g = globalThis as unknown as { __crmDb?: Database.Database };
export const db = g.__crmDb ?? (g.__crmDb = open());

type PersonRow = {
  id: string; name: string; email: string; phone: string; company: string; role: string;
  link: string; stage: Stage; follow_up: string | null; last_touch: string | null; created_at: string;
};

function toPerson(r: PersonRow, groupIds: string[]): Person {
  return {
    id: r.id, name: r.name, email: r.email, phone: r.phone, company: r.company, role: r.role,
    link: r.link, stage: r.stage, followUp: r.follow_up, lastTouch: r.last_touch,
    createdAt: r.created_at, groupIds,
  };
}

export function listPeople(): Person[] {
  const rows = db.prepare("SELECT * FROM people ORDER BY name COLLATE NOCASE").all() as PersonRow[];
  const links = db.prepare("SELECT person_id, group_id FROM person_groups").all() as { person_id: string; group_id: string }[];
  const byPerson = new Map<string, string[]>();
  for (const l of links) byPerson.set(l.person_id, [...(byPerson.get(l.person_id) ?? []), l.group_id]);
  return rows.map((r) => toPerson(r, byPerson.get(r.id) ?? []));
}

export function getPerson(id: string): Person | null {
  const r = db.prepare("SELECT * FROM people WHERE id = ?").get(id) as PersonRow | undefined;
  if (!r) return null;
  const ids = (db.prepare("SELECT group_id FROM person_groups WHERE person_id = ?").all(id) as { group_id: string }[]).map((x) => x.group_id);
  return toPerson(r, ids);
}

export type PersonInput = Partial<Pick<Person, "name" | "email" | "phone" | "company" | "role" | "link" | "stage" | "followUp" | "groupIds">>;

const columns: Record<string, string> = {
  name: "name", email: "email", phone: "phone", company: "company", role: "role",
  link: "link", stage: "stage", followUp: "follow_up",
};

export function clean(input: Record<string, unknown>): PersonInput {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(columns)) {
    if (!(k in input)) continue;
    const v = input[k];
    if (k === "followUp") out[k] = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
    else if (k === "stage") { if (STAGES.some((s) => s.id === v)) out[k] = v; }
    else out[k] = String(v ?? "").trim().slice(0, 500);
  }
  if (Array.isArray(input.groupIds)) out.groupIds = input.groupIds.filter((x): x is string => typeof x === "string");
  return out as PersonInput;
}

export const createPerson = db.transaction((input: PersonInput): Person => {
  const id = randomUUID();
  db.prepare("INSERT INTO people (id, created_at) VALUES (?, ?)").run(id, new Date().toISOString());
  updatePerson(id, input);
  return getPerson(id)!;
});

export const updatePerson = db.transaction((id: string, input: PersonInput): Person | null => {
  const sets = Object.keys(input).filter((k) => k in columns);
  if (sets.length) {
    db.prepare(`UPDATE people SET ${sets.map((k) => `${columns[k]} = @${k}`).join(", ")} WHERE id = @id`)
      .run({ ...Object.fromEntries(sets.map((k) => [k, input[k as keyof PersonInput]])), id });
  }
  if (input.groupIds) {
    db.prepare("DELETE FROM person_groups WHERE person_id = ?").run(id);
    const add = db.prepare("INSERT OR IGNORE INTO person_groups (person_id, group_id) SELECT ?, id FROM groups WHERE id = ?");
    for (const gid of input.groupIds) add.run(id, gid);
  }
  return getPerson(id);
});

export function deletePerson(id: string) {
  db.prepare("DELETE FROM people WHERE id = ?").run(id);
}

export function listActivities(personId: string): Activity[] {
  return db.prepare("SELECT id, kind, body, at FROM activities WHERE person_id = ? ORDER BY at DESC").all(personId) as Activity[];
}

export const addActivity = db.transaction((personId: string, kind: ActivityKind, body: string): Activity => {
  const a = { id: randomUUID(), kind, body, at: new Date().toISOString() };
  db.prepare("INSERT INTO activities (id, person_id, kind, body, at) VALUES (?, ?, ?, ?, ?)").run(a.id, personId, kind, body, a.at);
  db.prepare("UPDATE people SET last_touch = ? WHERE id = ?").run(a.at, personId);
  return a;
});

export function deleteActivity(personId: string, activityId: string) {
  db.prepare("DELETE FROM activities WHERE id = ? AND person_id = ?").run(activityId, personId);
  const latest = db.prepare("SELECT MAX(at) at FROM activities WHERE person_id = ?").get(personId) as { at: string | null };
  db.prepare("UPDATE people SET last_touch = ? WHERE id = ?").run(latest.at, personId);
}

export function listGroups(): Group[] {
  return db.prepare("SELECT id, name, hue FROM groups ORDER BY created_at").all() as Group[];
}

const HUES = [220, 155, 30, 340, 265, 190, 95, 10];

export function createGroup(name: string): Group {
  const count = (db.prepare("SELECT COUNT(*) n FROM groups").get() as { n: number }).n;
  const grp = { id: randomUUID(), name, hue: HUES[count % HUES.length] };
  db.prepare("INSERT INTO groups (id, name, hue, created_at) VALUES (?, ?, ?, ?)").run(grp.id, grp.name, grp.hue, new Date().toISOString());
  return grp;
}

export function renameGroup(id: string, name: string) {
  db.prepare("UPDATE groups SET name = ? WHERE id = ?").run(name, id);
}

export function deleteGroup(id: string) {
  db.prepare("DELETE FROM groups WHERE id = ?").run(id);
}
