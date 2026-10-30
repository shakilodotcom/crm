"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ACTIVITY_KINDS, STAGES, type Activity, type ActivityKind, type Group, type Person, type Stage } from "@/lib/types";

type View = { type: "all" } | { type: "followups" } | { type: "group"; id: string };
type Mode = "table" | "board";
type SortKey = "name" | "stage" | "lastTouch" | "followUp";

async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error ?? `Request failed (${res.status})`);
  }
  return (res.status === 204 ? null : res.json()) as T;
}

/* ---------- small helpers ---------- */

const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function addDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return localDate(d);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function hueOf(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function relTime(iso: string | null) {
  if (!iso) return "Never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function followUpLabel(date: string | null) {
  if (!date) return null;
  const t = localDate();
  if (date < t) {
    const days = Math.round((new Date(t).getTime() - new Date(date).getTime()) / 86_400_000);
    return { text: days === 1 ? "1 day late" : `${days} days late`, tone: "late" };
  }
  if (date === t) return { text: "Today", tone: "today" };
  if (date === addDays(1)) return { text: "Tomorrow", tone: "soon" };
  const d = new Date(date + "T00:00:00");
  return { text: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), tone: "later" };
}

const isDue = (p: Person) => !!p.followUp && p.followUp <= localDate();
const stageLabel = (s: Stage) => STAGES.find((x) => x.id === s)?.label ?? s;

/* ---------- atoms ---------- */

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span className="avatar" style={{ "--h": hueOf(name || "?"), width: size, height: size, fontSize: size * 0.38 } as React.CSSProperties}>
      {initials(name)}
    </span>
  );
}

function StageChip({ stage }: { stage: Stage }) {
  return <span className={`stage stage-${stage}`}>{stageLabel(stage)}</span>;
}

function GroupChip({ group }: { group: Group }) {
  return <span className="chip" style={{ "--h": group.hue } as React.CSSProperties}>{group.name}</span>;
}

function FollowUp({ date }: { date: string | null }) {
  const f = followUpLabel(date);
  if (!f) return <span className="muted">—</span>;
  return <span className={`due due-${f.tone}`}>{f.text}</span>;
}

/* ---------- main ---------- */

export default function Crm({ initialPeople, initialGroups }: { initialPeople: Person[]; initialGroups: Group[] }) {
  const [people, setPeople] = useState(initialPeople);
  const [groups, setGroups] = useState(initialGroups);
  const [view, setView] = useState<View>({ type: "all" });
  const [mode, setMode] = useState<Mode>("table");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3200);
  }, []);

  const fail = useCallback((e: unknown) => flash(e instanceof Error ? e.message : "Something went wrong. Try again."), [flash]);

  const reload = useCallback(async () => {
    const s = await api<{ people: Person[]; groups: Group[] }>("GET", "/api/state");
    setPeople(s.people);
    setGroups(s.groups);
  }, []);

  const patchPerson = useCallback(
    async (id: string, patch: Partial<Person>) => {
      setPeople((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      try {
        const saved = await api<Person>("PATCH", `/api/people/${id}`, patch);
        setPeople((ps) => ps.map((p) => (p.id === id ? saved : p)));
      } catch (e) {
        fail(e);
        reload();
      }
    },
    [fail, reload],
  );

  const createPerson = useCallback(
    async (seed: Partial<Person> = {}) => {
      try {
        const groupIds = view.type === "group" ? [view.id] : [];
        const p = await api<Person>("POST", "/api/people", { groupIds, ...seed });
        setPeople((ps) => [...ps, p]);
        setOpenId(p.id);
      } catch (e) {
        fail(e);
      }
    },
    [view, fail],
  );

  const removePerson = useCallback(
    async (id: string) => {
      setPeople((ps) => ps.filter((p) => p.id !== id));
      setOpenId(null);
      try {
        await api("DELETE", `/api/people/${id}`);
      } catch (e) {
        fail(e);
        reload();
      }
    },
    [fail, reload],
  );

  // Keyboard: n = new person, / = search, Esc = close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.closest("input, textarea, select, [contenteditable]");
      if (e.key === "Escape") {
        if (importing) setImporting(false);
        else if (openId) setOpenId(null);
        else if (typing) (el as HTMLInputElement).blur();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "n") { e.preventDefault(); createPerson(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, importing, createPerson]);

  const activeGroup = view.type === "group" ? groups.find((g) => g.id === view.id) : undefined;
  useEffect(() => {
    if (view.type === "group" && !activeGroup) setView({ type: "all" });
  }, [view, activeGroup]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = people;
    if (view.type === "followups") list = list.filter(isDue);
    if (view.type === "group") list = list.filter((p) => p.groupIds.includes(view.id));
    if (q) list = list.filter((p) => [p.name, p.email, p.company, p.role, p.phone].some((f) => f.toLowerCase().includes(q)));
    const key = view.type === "followups" ? "followUp" : sort.key;
    const dir = view.type === "followups" ? 1 : sort.dir;
    const order = STAGES.map((s) => s.id as string);
    const val = (p: Person): string | number => {
      if (key === "stage") return order.indexOf(p.stage);
      if (key === "lastTouch") return p.lastTouch ?? "";
      if (key === "followUp") return p.followUp ?? "9999";
      return p.name.toLowerCase() || "￿";
    };
    return [...list].sort((a, b) => (val(a) < val(b) ? -dir : val(a) > val(b) ? dir : 0));
  }, [people, view, query, sort]);

  const dueCount = people.filter(isDue).length;
  const open = people.find((p) => p.id === openId) ?? null;

  const title = view.type === "all" ? "Everyone" : view.type === "followups" ? "Follow-ups" : activeGroup?.name ?? "";

  return (
    <div className={`app ${open ? "has-drawer" : ""}`}>
      <Sidebar
        people={people}
        groups={groups}
        view={view}
        dueCount={dueCount}
        onView={(v) => { setView(v); setOpenId(null); }}
        onCreateGroup={async (name) => {
          try {
            const g = await api<Group>("POST", "/api/groups", { name });
            setGroups((gs) => [...gs, g]);
            setView({ type: "group", id: g.id });
          } catch (e) { fail(e); }
        }}
      />

      <main className="main">
        <header className="toolbar">
          <div className="title-row">
            {activeGroup ? (
              <GroupTitle
                key={activeGroup.id}
                group={activeGroup}
                onRename={async (name) => {
                  setGroups((gs) => gs.map((g) => (g.id === activeGroup.id ? { ...g, name } : g)));
                  try { await api("PATCH", `/api/groups/${activeGroup.id}`, { name }); } catch (e) { fail(e); reload(); }
                }}
                onDelete={async () => {
                  const id = activeGroup.id;
                  setGroups((gs) => gs.filter((g) => g.id !== id));
                  setPeople((ps) => ps.map((p) => ({ ...p, groupIds: p.groupIds.filter((x) => x !== id) })));
                  setView({ type: "all" });
                  try { await api("DELETE", `/api/groups/${id}`); flash("Group deleted. Its people are still in Everyone."); } catch (e) { fail(e); reload(); }
                }}
              />
            ) : (
              <h1>{title}</h1>
            )}
            <span className="count">{visible.length}</span>
          </div>

          <div className="tools">
            <label className="search">
              <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
              <input
                id="search"
                ref={searchRef}
                type="search"
                placeholder="Search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search people"
              />
              <kbd>/</kbd>
            </label>
            <div className="seg" role="tablist" aria-label="Layout">
              <button role="tab" aria-selected={mode === "table"} onClick={() => setMode("table")}>Table</button>
              <button role="tab" aria-selected={mode === "board"} onClick={() => setMode("board")}>Board</button>
            </div>
            <button className="btn ghost desk" onClick={() => setImporting(true)}>Import</button>
            <a className="btn ghost desk" href="/api/export">Export</a>
            <button className="btn primary" onClick={() => createPerson()}>
              New person <kbd>N</kbd>
            </button>
          </div>
        </header>

        {people.length === 0 ? (
          <Empty onNew={() => createPerson()} onImport={() => setImporting(true)} />
        ) : mode === "table" ? (
          <Table
            people={visible}
            groups={groups}
            sort={sort}
            sortLocked={view.type === "followups"}
            onSort={(key) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "lastTouch" ? -1 : 1 }))}
            openId={openId}
            onOpen={setOpenId}
            emptyText={view.type === "followups" ? "Nobody is due for a follow-up. Nice." : query ? `No one matches “${query}”.` : "No one here yet."}
          />
        ) : (
          <Board people={visible} groups={groups} onOpen={setOpenId} onMove={(id, stage) => patchPerson(id, { stage })} />
        )}
      </main>

      {open && (
        <Drawer
          key={open.id}
          person={open}
          groups={groups}
          onClose={() => {
            const empty = !open.name && !open.email && !open.company && !open.lastTouch;
            if (empty) removePerson(open.id);
            else setOpenId(null);
          }}
          onPatch={(patch) => patchPerson(open.id, patch)}
          onDelete={() => removePerson(open.id)}
          onLogged={(at) => setPeople((ps) => ps.map((p) => (p.id === open.id ? { ...p, lastTouch: at } : p)))}
          onError={fail}
        />
      )}

      {importing && (
        <ImportDialog
          group={activeGroup}
          onClose={() => setImporting(false)}
          onDone={async (n) => {
            setImporting(false);
            await reload();
            flash(`Imported ${n} ${n === 1 ? "person" : "people"}.`);
          }}
        />
      )}

      <div className="toast" role="status" aria-live="polite" hidden={!toast}>{toast}</div>
    </div>
  );
}

/* ---------- sidebar ---------- */

function Sidebar(props: {
  people: Person[];
  groups: Group[];
  view: View;
  dueCount: number;
  onView: (v: View) => void;
  onCreateGroup: (name: string) => void;
}) {
  const { people, groups, view, dueCount, onView, onCreateGroup } = props;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const isActive = (v: View) => v.type === view.type && (v.type !== "group" || (view.type === "group" && view.id === v.id));

  return (
    <nav className="sidebar" aria-label="Lists">
      <div className="brand">
        <span className="mark" aria-hidden="true" />
        People
      </div>
      <div className="nav-section">
        <button className={`nav-item ${isActive({ type: "all" }) ? "active" : ""}`} onClick={() => onView({ type: "all" })}>
          <span>Everyone</span><span className="n">{people.length}</span>
        </button>
        <button className={`nav-item ${isActive({ type: "followups" }) ? "active" : ""}`} onClick={() => onView({ type: "followups" })}>
          <span>Follow-ups</span>
          <span className={`n ${dueCount ? "n-due" : ""}`}>{dueCount}</span>
        </button>
      </div>

      <div className="nav-label">Groups</div>
      <div className="nav-section">
        {groups.map((g) => (
          <button key={g.id} className={`nav-item ${isActive({ type: "group", id: g.id }) ? "active" : ""}`} onClick={() => onView({ type: "group", id: g.id })}>
            <span className="dot-name"><span className="dot" style={{ "--h": g.hue } as React.CSSProperties} />{g.name}</span>
            <span className="n">{people.filter((p) => p.groupIds.includes(g.id)).length}</span>
          </button>
        ))}
        {adding ? (
          <form
            className="nav-add"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) onCreateGroup(name.trim());
              setName("");
              setAdding(false);
            }}
          >
            <input
              id="new-group"
              autoFocus
              value={name}
              placeholder="Group name"
              onChange={(e) => setName(e.target.value)}
              onBlur={() => { if (!name.trim()) setAdding(false); }}
            />
          </form>
        ) : (
          <button className="nav-item add" onClick={() => setAdding(true)}>+ New group</button>
        )}
      </div>
    </nav>
  );
}

function GroupTitle({ group, onRename, onDelete }: { group: Group; onRename: (n: string) => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="group-title">
      <input
        id="group-name"
        className="h1-input"
        defaultValue={group.name}
        aria-label="Group name"
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== group.name) onRename(v);
          else e.target.value = group.name;
        }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      />
      {confirm ? (
        <span className="confirm">
          Delete group?
          <button className="btn danger sm" onClick={onDelete}>Delete</button>
          <button className="btn ghost sm" onClick={() => setConfirm(false)}>Keep</button>
        </span>
      ) : (
        <button className="btn ghost sm quiet" onClick={() => setConfirm(true)}>Delete group</button>
      )}
    </div>
  );
}

/* ---------- table ---------- */

function Table(props: {
  people: Person[];
  groups: Group[];
  sort: { key: SortKey; dir: 1 | -1 };
  sortLocked: boolean;
  onSort: (k: SortKey) => void;
  openId: string | null;
  onOpen: (id: string) => void;
  emptyText: string;
}) {
  const { people, groups, sort, sortLocked, onSort, openId, onOpen, emptyText } = props;
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const Th = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={className} aria-sort={!sortLocked && sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      <button disabled={sortLocked} onClick={() => onSort(k)}>
        {children}
        {!sortLocked && sort.key === k && <span className="arrow">{sort.dir === 1 ? "↑" : "↓"}</span>}
      </button>
    </th>
  );

  if (!people.length) return <p className="empty-line">{emptyText}</p>;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <Th k="name">Name</Th>
            <Th k="stage" className="col-stage">Stage</Th>
            <th className="col-groups"><span className="th-plain">Groups</span></th>
            <th className="col-email"><span className="th-plain">Email</span></th>
            <Th k="lastTouch" className="col-touch">Last touch</Th>
            <Th k="followUp">Follow up</Th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr
              key={p.id}
              className={p.id === openId ? "selected" : ""}
              onClick={() => onOpen(p.id)}
              onKeyDown={(e) => { if (e.key === "Enter") onOpen(p.id); }}
              tabIndex={0}
            >
              <td>
                <div className="who">
                  <Avatar name={p.name} />
                  <div className="who-text">
                    <span className="who-name">{p.name || <span className="muted">Unnamed</span>}</span>
                    {(p.role || p.company) && <span className="who-sub">{[p.role, p.company].filter(Boolean).join(" · ")}</span>}
                  </div>
                </div>
              </td>
              <td className="col-stage"><StageChip stage={p.stage} /></td>
              <td className="col-groups">
                <div className="chips">
                  {p.groupIds.map((id) => groupById.get(id)).filter(Boolean).map((g) => <GroupChip key={g!.id} group={g!} />)}
                </div>
              </td>
              <td className="col-email mono">{p.email || <span className="muted">—</span>}</td>
              <td className="col-touch mono">{relTime(p.lastTouch)}</td>
              <td><FollowUp date={p.followUp} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- board ---------- */

function Board({ people, groups, onOpen, onMove }: { people: Person[]; groups: Group[]; onOpen: (id: string) => void; onMove: (id: string, s: Stage) => void }) {
  const [over, setOver] = useState<Stage | null>(null);
  const groupById = new Map(groups.map((g) => [g.id, g]));
  return (
    <div className="board">
      {STAGES.map((s) => {
        const cards = people.filter((p) => p.stage === s.id);
        return (
          <section
            key={s.id}
            className={`column ${over === s.id ? "over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
            onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/plain");
              if (id) onMove(id, s.id);
            }}
          >
            <header className="column-head">
              <StageChip stage={s.id} />
              <span className="count">{cards.length}</span>
            </header>
            <div className="cards">
              {cards.map((p) => (
                <button
                  key={p.id}
                  className="card"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
                  onClick={() => onOpen(p.id)}
                >
                  <div className="who">
                    <Avatar name={p.name} size={24} />
                    <div className="who-text">
                      <span className="who-name">{p.name || "Unnamed"}</span>
                      {p.company && <span className="who-sub">{p.company}</span>}
                    </div>
                  </div>
                  {(p.followUp || p.groupIds.length > 0) && (
                    <div className="card-foot">
                      <div className="chips">
                        {p.groupIds.map((id) => groupById.get(id)).filter(Boolean).slice(0, 2).map((g) => <GroupChip key={g!.id} group={g!} />)}
                      </div>
                      {p.followUp && <FollowUp date={p.followUp} />}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---------- drawer ---------- */

const FIELDS: { key: "email" | "phone" | "company" | "role" | "link"; label: string; type: string; placeholder: string }[] = [
  { key: "company", label: "Company", type: "text", placeholder: "Where they work" },
  { key: "role", label: "Role", type: "text", placeholder: "What they do" },
  { key: "email", label: "Email", type: "email", placeholder: "name@company.com" },
  { key: "phone", label: "Phone", type: "tel", placeholder: "+1 555 0100" },
  { key: "link", label: "Link", type: "url", placeholder: "LinkedIn or website" },
];

function Drawer(props: {
  person: Person;
  groups: Group[];
  onClose: () => void;
  onPatch: (p: Partial<Person>) => void;
  onDelete: () => void;
  onLogged: (at: string | null) => void;
  onError: (e: unknown) => void;
}) {
  const { person: p, groups, onClose, onPatch, onDelete, onLogged, onError } = props;
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [kind, setKind] = useState<ActivityKind>("note");
  const [text, setText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<Activity[]>("GET", `/api/people/${p.id}/activities`).then(setActivities, onError);
    if (!p.name) nameRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);

  const save = (key: keyof Person, value: string) => {
    if ((p[key] ?? "") !== value) onPatch({ [key]: value } as Partial<Person>);
  };

  const log = async () => {
    const body = text.trim();
    if (!body) return;
    try {
      const a = await api<Activity>("POST", `/api/people/${p.id}/activities`, { kind, body });
      setActivities((as) => [a, ...(as ?? [])]);
      setText("");
      onLogged(a.at);
    } catch (e) {
      onError(e);
    }
  };

  const removeActivity = async (id: string) => {
    const rest = (activities ?? []).filter((a) => a.id !== id);
    setActivities(rest);
    onLogged(rest[0]?.at ?? null);
    try { await api("DELETE", `/api/people/${p.id}/activities?activity=${id}`); } catch (e) { onError(e); }
  };

  const toggleGroup = (id: string) =>
    onPatch({ groupIds: p.groupIds.includes(id) ? p.groupIds.filter((x) => x !== id) : [...p.groupIds, id] });

  const linkHref = p.link && (/^https?:\/\//.test(p.link) ? p.link : `https://${p.link}`);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" aria-label={`${p.name || "New person"} details`}>
        <div className="drawer-top">
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
          {confirmDelete ? (
            <span className="confirm">
              Delete {p.name || "this person"} and their history?
              <button className="btn danger sm" onClick={onDelete}>Delete</button>
              <button className="btn ghost sm" onClick={() => setConfirmDelete(false)}>Keep</button>
            </span>
          ) : (
            <button className="btn ghost sm quiet" onClick={() => setConfirmDelete(true)}>Delete</button>
          )}
        </div>

        <div className="drawer-head">
          <Avatar name={p.name} size={48} />
          <input
            id="person-name"
            ref={nameRef}
            className="name-input"
            defaultValue={p.name}
            placeholder="Full name"
            aria-label="Name"
            onBlur={(e) => save("name", e.target.value.trim())}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          />
        </div>

        <div className="stage-pick" role="radiogroup" aria-label="Stage">
          {STAGES.map((s) => (
            <button key={s.id} role="radio" aria-checked={p.stage === s.id} className={`stage stage-${s.id} ${p.stage === s.id ? "on" : ""}`} onClick={() => onPatch({ stage: s.id })}>
              {s.label}
            </button>
          ))}
        </div>

        <dl className="fields">
          {FIELDS.map((f) => (
            <div className="field" key={f.key}>
              <dt><label htmlFor={`f-${f.key}`}>{f.label}</label></dt>
              <dd>
                <input
                  id={`f-${f.key}`}
                  type={f.type}
                  defaultValue={p[f.key]}
                  placeholder={f.placeholder}
                  onBlur={(e) => save(f.key, e.target.value.trim())}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                />
                {f.key === "email" && p.email && <a className="field-act" href={`mailto:${p.email}`}>Write</a>}
                {f.key === "link" && linkHref && <a className="field-act" href={linkHref} target="_blank" rel="noreferrer">Open</a>}
              </dd>
            </div>
          ))}
          <div className="field">
            <dt>Groups</dt>
            <dd className="chips wrap">
              {groups.length === 0 && <span className="muted">Create a group in the sidebar first.</span>}
              {groups.map((g) => (
                <button
                  key={g.id}
                  className={`chip toggle ${p.groupIds.includes(g.id) ? "on" : ""}`}
                  style={{ "--h": g.hue } as React.CSSProperties}
                  aria-pressed={p.groupIds.includes(g.id)}
                  onClick={() => toggleGroup(g.id)}
                >
                  {g.name}
                </button>
              ))}
            </dd>
          </div>
          <div className="field">
            <dt><label htmlFor="f-follow">Follow up</label></dt>
            <dd className="follow">
              <input id="f-follow" type="date" value={p.followUp ?? ""} onChange={(e) => onPatch({ followUp: e.target.value || null })} />
              <div className="quick">
                <button onClick={() => onPatch({ followUp: addDays(1) })}>Tomorrow</button>
                <button onClick={() => onPatch({ followUp: addDays(7) })}>1 week</button>
                <button onClick={() => onPatch({ followUp: addDays(30) })}>1 month</button>
                {p.followUp && <button onClick={() => onPatch({ followUp: null })}>Clear</button>}
              </div>
            </dd>
          </div>
        </dl>

        <section className="log">
          <h2>History</h2>
          <form className="composer" onSubmit={(e) => { e.preventDefault(); log(); }}>
            <div className="kinds" role="radiogroup" aria-label="Kind">
              {ACTIVITY_KINDS.map((k) => (
                <button type="button" key={k} role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
                  {k[0].toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
            <textarea
              id="activity-text"
              rows={3}
              value={text}
              placeholder={kind === "note" ? "Write a note…" : `What happened on the ${kind}?`}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) log(); }}
            />
            <div className="composer-foot">
              <span className="hint">Logging updates “last touch”. <kbd>⌘</kbd><kbd>↵</kbd></span>
              <button className="btn primary sm" disabled={!text.trim()}>Log {kind}</button>
            </div>
          </form>

          {activities === null ? (
            <p className="muted">Loading…</p>
          ) : activities.length === 0 ? (
            <p className="muted">No history yet. Log a note, call, email or meeting above.</p>
          ) : (
            <ol className="timeline">
              {activities.map((a) => (
                <li key={a.id}>
                  <div className="tl-meta">
                    <span className={`kind kind-${a.kind}`}>{a.kind}</span>
                    <time dateTime={a.at} className="mono">
                      {new Date(a.at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                    </time>
                    <button className="tl-del" onClick={() => removeActivity(a.id)} aria-label="Delete entry">Remove</button>
                  </div>
                  <p>{a.body}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </>
  );
}

/* ---------- import ---------- */

function ImportDialog({ group, onClose, onDone }: { group?: Group; onClose: () => void; onDone: (n: number) => void }) {
  const [csv, setCsv] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ imported: number }>("POST", "/api/import", { csv, groupId: group?.id });
      onDone(r.imported);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
      setBusy(false);
    }
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="import-title">Import people</h2>
        <p className="muted">
          Paste CSV or choose a file. The first row is the header; columns named name (or first/last name), email, phone, company, role and linkedin are picked up.
          {group && <> Everyone imported is added to <strong>{group.name}</strong>.</>}
        </p>
        <input
          id="import-file"
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setCsv(await f.text());
          }}
        />
        <textarea
          id="import-text"
          rows={8}
          className="mono"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={"name,email,company\nAda Lovelace,ada@analytical.co,Analytical Engines"}
        />
        {error && <p className="error">{error}</p>}
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!csv.trim() || busy} onClick={submit}>{busy ? "Importing…" : "Import"}</button>
        </div>
      </div>
    </div>
  );
}

function Empty({ onNew, onImport }: { onNew: () => void; onImport: () => void }) {
  return (
    <div className="empty">
      <h2>Your people live here.</h2>
      <p className="muted">Add the people you work with, sort them into groups, and set a follow-up date so nobody slips.</p>
      <div className="empty-actions">
        <button className="btn primary" onClick={onNew}>Add a person</button>
        <button className="btn ghost" onClick={onImport}>Import a CSV</button>
      </div>
    </div>
  );
}
