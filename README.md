# People

A small, self-hosted CRM for the people you work with. Inspired by folk, cut down to the essentials:

- **People**: name, company, role, email, phone and one link
- **Groups**: put people into lists such as Investors, Customers or Hiring. One person can be in several.
- **Stages**: New → Reached out → In talks → Won / Parked, shown as a table or a drag-and-drop board
- **History**: log notes, calls, emails and meetings. Logging updates "last touch".
- **Follow-ups**: set a date per person. The Follow-ups view lists everyone due today or overdue.
- **CSV import and export**: header names like `name`, `first name`/`last name`, `email`, `company`, `title` and `linkedin` are recognized

Everything is stored in one SQLite file (`data/crm.db`).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

To add example people (with the app running):

```bash
npm run seed
```

Production:

```bash
npm run build && npm start
```

Set `CRM_DB=/path/to/crm.db` to store the database somewhere else. Back up that file to back up everything.

## Keyboard

| Key | Action |
| --- | --- |
| `N` | New person |
| `/` | Search |
| `Esc` | Close panel |
| `⌘/Ctrl + Enter` | Log the entry you're writing |

## Stack

Next.js (App Router) with a small JSON API under `app/api`, `better-sqlite3` for storage (`lib/db.ts`), and one client component for the UI (`components/Crm.tsx`).

There is no login. Run it locally or behind your own auth, for example a VPN, Cloudflare Access or basic auth on your reverse proxy.
