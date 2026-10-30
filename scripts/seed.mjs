// Adds a handful of example people through the API. Start the app first (npm run dev), then: npm run seed
const base = process.env.CRM_URL ?? "http://localhost:3000";

async function post(path, body) {
  const res = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const investors = await post("/api/groups", { name: "Investors" });
const customers = await post("/api/groups", { name: "Customers" });
const hiring = await post("/api/groups", { name: "Hiring" });

const people = [
  { name: "Maya Okafor", company: "Northwind Capital", role: "Partner", email: "maya@northwind.example", stage: "talking", followUp: day(-2), groupIds: [investors.id],
    log: [["meeting", "Intro call. Interested in the seed round, wants the updated deck."], ["email", "Sent deck v3 and the metrics sheet."]] },
  { name: "Jonas Weber", company: "Lumen Labs", role: "Head of Ops", email: "jonas@lumen.example", stage: "won", followUp: day(21), groupIds: [customers.id],
    log: [["call", "Signed the annual plan. Kick-off next Tuesday."]] },
  { name: "Priya Raman", company: "Fieldstone", role: "Founder", email: "priya@fieldstone.example", stage: "reached_out", followUp: day(0), groupIds: [customers.id],
    log: [["email", "Cold intro via Jonas. Waiting to hear back."]] },
  { name: "Tomás Herrera", company: "Arcadia Ventures", role: "Principal", email: "tomas@arcadia.example", stage: "new", followUp: day(5), groupIds: [investors.id], log: [] },
  { name: "Lena Sørensen", company: "", role: "Product designer", email: "lena@studio.example", stage: "talking", followUp: day(1), groupIds: [hiring.id],
    log: [["note", "Strong portfolio. Second interview with the team."]] },
  { name: "Daniel Kim", company: "Brightpath", role: "CTO", email: "daniel@brightpath.example", stage: "parked", followUp: null, groupIds: [customers.id],
    log: [["call", "Not a fit this year. Revisit in Q2."]] },
];

for (const { log, ...p } of people) {
  const created = await post("/api/people", p);
  for (const [kind, body] of log) await post(`/api/people/${created.id}/activities`, { kind, body });
}

console.log(`Seeded ${people.length} example people into ${base}`);
