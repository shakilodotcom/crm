import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, isSignedIn } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  if (await isSignedIn(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return Response.json({ error: "Sign in again to keep working." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  // Everything except the sign-in page, its form handler, build assets and icons.
  matcher: ["/((?!login|api/login|_next/|icon|apple-icon|favicon).*)"],
};
