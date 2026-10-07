import { NextResponse, type NextRequest } from "next/server";

/**
 * First line of defence for the admin area: requests without a session cookie
 * are sent to the login page before any admin code runs. This is only an
 * optimistic check; every admin page, Server Action and API route verifies the
 * session against the database itself (see src/server/auth/dal.ts).
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const hasCookie = req.cookies.has("sh_admin") || req.cookies.has("__Host-sh_admin");
    if (!hasCookie) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
