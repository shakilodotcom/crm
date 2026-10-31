"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { List, Person } from "@/lib/types";

type Tab = "all" | List | "archive";
type Toast = { msg: string; undo?: () => void };
type MenuItem = { label: string; hint?: string; danger?: boolean; run: () => void } | null | false | undefined | "";

const LISTS: { id: Tab; label: string; one?: string }[] = [
  { id: "all", label: "All" },
  { id: "clients", label: "Clients", one: "Client" },
  { id: "team", label: "Team", one: "Team" },
  { id: "archive", label: "Archives" },
];
const KINDS = LISTS.filter((l) => l.one) as { id: List; label: string; one: string }[];

class SignedOut extends Error {}

async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new SignedOut();
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn't save. Check your connection and try again.");
  return (res.status === 204 ? null : res.json()) as T;
}

const readTab = (): Tab => {
  try {
    const t = localStorage.getItem("tab");
    return LISTS.some((l) => l.id === t) ? (t as Tab) : "all";
  } catch { return "all"; }
};

export default function Crm({ initialPeople }: { initialPeople: Person[] }) {
  const [people, setPeople] = useState(initialPeople);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setTab(readTab()), []);

  const flash = useCallback((msg: string, undo?: () => void) => {
    const t = { msg, undo };
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), undo ? 6000 : 3000);
  }, []);

  const reload = useCallback(async () => {
    try { setPeople(await api<Person[]>("GET", "/api/people")); }
    catch (e) { if (e instanceof SignedOut) location.href = "/login"; }
  }, []);

  const fail = useCallback((e: unknown) => {
    if (e instanceof SignedOut) { location.href = "/login"; return; }
    flash(e instanceof Error ? e.message : "Couldn't save. Check your connection and try again.");
    reload();
  }, [flash, reload]);

  // Pick up changes made on another device when you come back to this tab.
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [reload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.closest?.("input, textarea");
      if (e.key === "Escape") { if (typing) (el as HTMLInputElement).blur(); setOpenId(null); return; }
      if (!typing && !e.metaKey && !e.ctrlKey && (e.key === "/" || e.key === "n")) { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const patch = (id: string, data: Partial<Person>) => {
    setPeople((ps) => ps.map((p) => (p.id === id ? { ...p, ...data } : p)));
    api("PATCH", `/api/people/${id}`, data).catch(fail);
  };

  const put = (p: Person) => {
    setPeople((ps) => [...ps.filter((x) => x.id !== p.id), p]);
    return api("POST", "/api/people", p).catch(fail);
  };

  const remove = (id: string) => {
    const p = people.find((x) => x.id === id);
    if (!p) return;
    setOpenId(null);
    setPeople((ps) => ps.filter((x) => x.id !== id));
    api("DELETE", `/api/people/${id}`)
      .then(() => flash(`Deleted ${p.name || "person"}`, () => { setToast(null); put(p); }))
      .catch(fail);
  };

  const archive = (p: Person, on: boolean) => {
    if (openId === p.id) setOpenId(null);
    patch(p.id, { archived: on });
    flash(`${on ? "Archived" : "Restored"} ${p.name || "person"}`, () => { setToast(null); patch(p.id, { archived: !on }); });
  };

  const copyEmail = async (email: string) => {
    try { await navigator.clipboard.writeText(email); flash("Email copied"); }
    catch { flash(email); }
  };

  const add = () => {
    const name = q.trim();
    if (!name) return;
    const p: Person = {
      id: crypto.randomUUID(), name: name.slice(0, 120), about: "", notes: "",
      list: tab === "team" ? "team" : "clients", archived: false, createdAt: new Date().toISOString(),
    };
    put(p);
    setQ("");
    setOpenId(p.id);
  };

  const restoreBackup = async (file: File) => {
    try {
      const r = await api<{ added: number; total: number }>("POST", "/api/import", JSON.parse(await file.text()));
      await reload();
      flash(`Added ${r.added} ${r.added === 1 ? "person" : "people"}${r.added < r.total ? ` (${r.total - r.added} were already here)` : ""}.`);
    } catch (e) {
      if (e instanceof SyntaxError) flash("That file isn't a backup. Choose the .json file you were sent.");
      else fail(e);
    }
  };

  const term = q.trim().toLowerCase();
  const archiving = tab === "archive";
  const shown = useMemo(() => {
    const inTab = (p: Person) => (tab === "archive" ? p.archived : !p.archived && (tab === "all" || p.list === tab));
    // A search looks through everyone. Otherwise show the current tab, keeping the open person in view until it's closed.
    const list = term
      ? people.filter((p) => (p.name + " " + p.about + " " + p.notes).toLowerCase().includes(term))
      : people.filter((p) => inTab(p) || p.id === openId);
    return [...list].sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
  }, [people, term, tab, openId]);

  const pickTab = (id: Tab) => { setTab(id); setOpenId(null); try { localStorage.setItem("tab", id); } catch {} };
  const exactMatch = people.find((p) => p.name.toLowerCase() === term);
  const menuPerson = menu && people.find((p) => p.id === menu.id);

  return (
    <main className="wrap">
      <form className="find" onSubmit={(e) => { e.preventDefault(); if (exactMatch) setOpenId(exactMatch.id); else if (!archiving) add(); }}>
        <input
          id="find" ref={input} value={q} autoComplete="off"
          placeholder={archiving ? "Search archives" : tab === "team" ? "Find or add a team member" : tab === "clients" ? "Find or add a client" : "Find or add someone"}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Find or add someone"
        />
        {term && !exactMatch && !archiving && <button className="add-hint" type="submit">Add “{q.trim()}” <kbd>↵</kbd></button>}
      </form>

      <nav className="tabs" aria-label="Lists">
        {LISTS.map((l) => {
          const n = people.filter((p) => (l.id === "archive" ? p.archived : !p.archived && (l.id === "all" || p.list === l.id))).length;
          return (
            <button key={l.id} className={tab === l.id ? "on" : ""} aria-pressed={tab === l.id} onClick={() => pickTab(l.id)}>
              {l.label}<span className="n">{n}</span>
            </button>
          );
        })}
      </nav>

      {people.length === 0 ? (
        <div>
          <p className="empty">No one yet. Type a name above and press Enter.</p>
          <label className="restore">
            Restore from a backup file
            <input id="backup" type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restoreBackup(f); e.target.value = ""; }} />
          </label>
        </div>
      ) : shown.length === 0 && !term ? (
        <p className="empty">{archiving
          ? "Nothing archived. Right-click someone and choose Archive to tuck them away without deleting them."
          : `No ${tab === "team" ? "team members" : tab === "clients" ? "clients" : "one"} yet. Type a name above and press Enter.`}</p>
      ) : shown.length === 0 ? (
        <p className="empty">No one matches “{q.trim()}”.</p>
      ) : (
        <ul className="list">
          {shown.map((p) => (
            <Row
              key={p.id} p={p} open={openId === p.id} menuOpen={menu?.id === p.id}
              tag={p.archived && !archiving ? "Archived" : tab === "all" || archiving || p.list !== tab ? KINDS.find((l) => l.id === p.list)!.one : ""}
              onToggle={() => setOpenId(openId === p.id ? null : p.id)}
              onMenu={(e) => {
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setMenu({ id: p.id, x: e.clientX || r.left + 24, y: e.clientY || r.bottom });
              }}
              onPatch={(d) => patch(p.id, d)} onDelete={() => remove(p.id)} onArchive={() => archive(p, !p.archived)}
            />
          ))}
        </ul>
      )}

      {menu && menuPerson && (() => {
        const p = menuPerson;
        const email = (p.about + " " + p.notes).match(/[^\s@,;()<>]+@[^\s@,;()<>]+\.[a-z]{2,}/i)?.[0];
        const go = (fn: () => void) => () => { setMenu(null); fn(); };
        return (
          <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={[
            { label: openId === p.id ? "Close" : "Open", run: go(() => setOpenId(openId === p.id ? null : p.id)) },
            null,
            { label: p.list === "team" ? "Move to Clients" : "Move to Team", run: go(() => patch(p.id, { list: p.list === "team" ? "clients" : "team" })) },
            email && { label: "Copy email", hint: email, run: go(() => copyEmail(email)) },
            null,
            { label: p.archived ? "Restore from archive" : "Archive", run: go(() => archive(p, !p.archived)) },
            { label: "Delete", danger: true, run: go(() => remove(p.id)) },
          ]} />
        );
      })()}

      <div className="toast" role="status" aria-live="polite" hidden={!toast}>
        {toast?.msg}
        {toast?.undo && <button onClick={toast.undo}>Undo</button>}
      </div>
    </main>
  );
}

function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const list = items.filter((it, i, a) => it !== undefined && it !== false && it !== ""
    && !(it === null && (i === 0 || a[i - 1] === null || i === a.length - 1)));

  // Keep the menu on screen.
  useLayoutEffect(() => {
    const el = ref.current!, m = 8;
    setPos({
      left: Math.max(m, Math.min(x, innerWidth - el.offsetWidth - m)),
      top: y + el.offsetHeight + m > innerHeight ? Math.max(m, y - el.offsetHeight) : y,
    });
    el.querySelector("button")?.focus();
  }, [x, y]);

  useEffect(() => {
    const away = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    addEventListener("pointerdown", away, true);
    addEventListener("resize", onClose);
    addEventListener("scroll", onClose, true);
    addEventListener("blur", onClose);
    return () => {
      removeEventListener("pointerdown", away, true);
      removeEventListener("resize", onClose);
      removeEventListener("scroll", onClose, true);
      removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const btns = [...ref.current!.querySelectorAll("button")];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
  };

  return (
    <div className="menu" role="menu" ref={ref} style={pos} onKeyDown={onKeyDown} onContextMenu={(e) => e.preventDefault()}>
      {list.map((it, i) => !it
        ? <div key={i} className="sep" role="separator" />
        : <button key={i} role="menuitem" className={it.danger ? "danger" : ""} onClick={it.run}>
            <span>{it.label}</span>{it.hint && <span className="hint">{it.hint}</span>}
          </button>)}
    </div>
  );
}

type MenuEvent = { preventDefault(): void; clientX: number; clientY: number; currentTarget: Element };

function Row({ p, open, tag, menuOpen, onMenu, onToggle, onPatch, onDelete, onArchive }: {
  p: Person; open: boolean; tag: string; menuOpen: boolean;
  onMenu: (e: MenuEvent) => void; onToggle: () => void;
  onPatch: (d: Partial<Person>) => void; onDelete: () => void; onArchive: () => void;
}) {
  const press = useRef<ReturnType<typeof setTimeout> | "fired" | null>(null); // long-press timer on touch screens
  const cancel = () => { if (press.current !== "fired" && press.current) clearTimeout(press.current); };
  return (
    <li className={`row ${open ? "open" : ""} ${menuOpen ? "menu-on" : ""}`}>
      <button
        className="line" aria-expanded={open}
        onClick={() => { if (press.current === "fired") { press.current = null; return; } onToggle(); }}
        onContextMenu={onMenu}
        onTouchStart={(e) => {
          const el = e.currentTarget, { clientX, clientY } = e.touches[0];
          press.current = setTimeout(() => {
            press.current = "fired";
            onMenu({ preventDefault() {}, clientX, clientY, currentTarget: el });
          }, 500);
        }}
        onTouchMove={cancel}
        onTouchEnd={cancel}
      >
        <span className="name">{p.name || "Unnamed"}</span>
        {tag && <span className="tag">{tag}</span>}
      </button>
      {open && <Detail p={p} onPatch={onPatch} onDelete={onDelete} onArchive={onArchive} onClose={onToggle} onMenu={onMenu} />}
    </li>
  );
}

function Detail({ p, onPatch, onDelete, onArchive, onClose, onMenu }: {
  p: Person; onPatch: (d: Partial<Person>) => void; onDelete: () => void; onArchive: () => void;
  onClose: () => void; onMenu: (e: MenuEvent) => void;
}) {
  const [notes, setNotes] = useState(p.notes);
  const [confirm, setConfirm] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Grow the notes box with its text.
  useEffect(() => { const a = area.current; if (a) { a.style.height = "auto"; a.style.height = a.scrollHeight + "px"; } }, [notes]);
  // Save notes after a pause in typing, and on close.
  const pending = useRef<string | null>(null); // notes typed but not saved yet
  const saveNotes = (v: string) => { clearTimeout(timer.current); pending.current = null; if (v !== p.notes) onPatch({ notes: v.slice(0, 20000) }); };
  const flush = useRef(() => {});
  flush.current = () => { if (pending.current !== null) saveNotes(pending.current); };
  useEffect(() => () => flush.current(), []);

  // A click on a blank part of the card closes it; fields and buttons keep working.
  const downOnBlank = useRef(false);
  const isBlank = (el: EventTarget) => !(el as HTMLElement).closest("input, textarea, button, label, a, .kind, .confirm");

  const field = (key: "name" | "about", label: string) => (
    <input
      id={`${key}-${p.id}`} className={key} defaultValue={p[key]} placeholder={label} aria-label={label}
      size={Math.max((p[key] || label).length, 4)}
      onInput={(e) => { e.currentTarget.size = Math.max((e.currentTarget.value || label).length, 4); }}
      onBlur={(e) => { const v = e.target.value.trim(); if (v !== p[key]) onPatch({ [key]: v.slice(0, 200) }); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );

  return (
    <div
      className="detail"
      onPointerDown={(e) => { downOnBlank.current = isBlank(e.target); }}
      onClick={(e) => { if (downOnBlank.current && isBlank(e.target)) onClose(); }}
      onContextMenu={(e) => { if (!(e.target as HTMLElement).closest("input, textarea")) onMenu(e); }}
    >
      {/* Same size and place as the closed row, so opening feels like the row unfolding. */}
      <div className="detail-top">
        {field("name", "Name")}
        <div className="kind" role="radiogroup" aria-label="List">
          {KINDS.map((l) => (
            <button key={l.id} role="radio" aria-checked={p.list === l.id} className={p.list === l.id ? "on" : ""} onClick={() => onPatch({ list: l.id })}>{l.one}</button>
          ))}
        </div>
      </div>
      <div className="detail-body">
      {field("about", "Role, company, email")}
      <textarea
        id={`notes-${p.id}`} ref={area} rows={2} value={notes} placeholder="Notes" aria-label="Notes"
        onChange={(e) => { const v = e.target.value; setNotes(v); pending.current = v; clearTimeout(timer.current); timer.current = setTimeout(() => saveNotes(v), 800); }}
        onBlur={(e) => saveNotes(e.target.value)}
      />
      <div className="actions">
        {confirm ? (
          <span className="confirm">Delete {p.name || "this person"}? <button className="danger" onClick={onDelete}>Delete</button><button onClick={() => setConfirm(false)}>Keep</button></span>
        ) : (
          <span className="card-actions">
            <button className="del" onClick={onArchive}>{p.archived ? "Restore" : "Archive"}</button>
            <button className="del danger-hover" onClick={() => setConfirm(true)}>Delete</button>
          </span>
        )}
      </div>
      </div>
    </div>
  );
}
