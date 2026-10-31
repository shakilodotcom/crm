import { COOKIE, sessionToken } from "@/lib/auth";

// A relative Location always points back to the address the visitor is on.
const back = (path: string, cookie?: string) => {
  const headers = new Headers({ Location: path });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
};

export async function POST(req: Request) {
  const form = await req.formData();
  const password = process.env.CRM_PASSWORD;
  if (!password) return back("/login?error=setup");
  if (form.get("password") !== password) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return back("/login?error=wrong");
  }
  const secure = req.headers.get("x-forwarded-proto") === "https" || new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return back("/", `${COOKIE}=${await sessionToken(password)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`);
}
