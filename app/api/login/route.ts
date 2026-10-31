import { COOKIE, sessionToken } from "@/lib/auth";

const back = (req: Request, path: string, cookie?: string) => {
  const headers = new Headers({ Location: new URL(path, req.url).toString() });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
};

export async function POST(req: Request) {
  const form = await req.formData();
  const password = process.env.CRM_PASSWORD;
  if (!password) return back(req, "/login?error=setup");
  if (form.get("password") !== password) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return back(req, "/login?error=wrong");
  }
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return back(req, "/", `${COOKIE}=${await sessionToken(password)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`);
}
