# WeBuild Studio CRM

A deliberately small CRM: one list of people, split into Clients, Team and Archives.
Each person has a name, one line about who they are, and notes.

- Type in the box at the top to find someone. Press Enter on a new name to add them.
- Click a name to open it. Click a blank part of the card to close it.
- Right-click (or press and hold on a phone) for Move, Copy email, Archive and Delete. Deletes can be undone.

## Deploy on Vercel

1. In Vercel, **Add New → Project**, and import this GitHub repository.
2. Before deploying, open **Environment Variables** and add `CRM_PASSWORD` with the password you want to sign in with.
3. Click **Deploy**.
4. In the project, open **Storage → Create Database → Neon (Postgres)**, and connect it to the project. This adds `DATABASE_URL` automatically.
5. Go to **Deployments**, open the latest one's **⋯** menu and choose **Redeploy**, so it picks up the database.

The table is created on first use. To bring people over from a backup, sign in while the list is empty and choose **Restore from a backup file**.

## Run locally

```bash
npm install
DATABASE_URL=postgres://… CRM_PASSWORD=… npm run dev
```

## How it's built

Next.js (App Router). `proxy.ts` asks for the password before anything else loads; `lib/db.ts` talks to Postgres;
`app/api/*` are the small JSON routes the page calls; `components/Crm.tsx` is the whole interface.
Data lives only in the database, never in this repository.
