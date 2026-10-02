import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authorizeRequest } from "@/lib/security/authorization";
import { requestPolicy } from "@/lib/security/request-policy";

export function proxy(request: NextRequest) {
  const publicPage = request.nextUrl.pathname.startsWith("/login")
    || request.nextUrl.pathname.startsWith("/recuperar")
    || request.nextUrl.pathname.startsWith("/api/auth");
  if (!publicPage && !request.cookies.has("nm_session") && !request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const limit = requestPolicy(request);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta nuevamente más tarde." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }
  if (request.nextUrl.pathname.startsWith("/api/") && !publicPage && !authorizeRequest(request)) {
    return NextResponse.json({ error: "No tienes permisos para esta operación." }, { status: 403 });
  }
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
