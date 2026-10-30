export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === "\t") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","))
    .join("\n");
}

const ALIASES: Record<string, string[]> = {
  name: ["name", "full name", "fullname", "contact", "person"],
  first: ["first name", "firstname", "given name"],
  last: ["last name", "lastname", "surname", "family name"],
  email: ["email", "e-mail", "email address", "work email"],
  phone: ["phone", "phone number", "mobile", "tel"],
  company: ["company", "organization", "organisation", "org", "account"],
  role: ["role", "title", "job title", "position"],
  link: ["link", "linkedin", "url", "website", "profile"],
};

/** Map a CSV with a header row onto person fields. Unknown columns are ignored. */
export function csvToPeople(text: string) {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    for (const [field, names] of Object.entries(ALIASES)) if (names.includes(key) && !(field in idx)) idx[field] = i;
  });
  const get = (r: string[], f: string) => (f in idx ? (r[idx[f]] ?? "").trim() : "");
  return body
    .map((r) => ({
      name: get(r, "name") || [get(r, "first"), get(r, "last")].filter(Boolean).join(" "),
      email: get(r, "email"),
      phone: get(r, "phone"),
      company: get(r, "company"),
      role: get(r, "role"),
      link: get(r, "link"),
    }))
    .filter((p) => p.name || p.email);
}
