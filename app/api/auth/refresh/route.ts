import { NextResponse } from "next/server";
import { renewSession } from "@/lib/server/service-client";

export async function GET(request: Request) {
  try {
    const renewed = await renewSession(request);
    const requested = new URL(request.url).searchParams.get("next") || "/dashboard";
    const destination = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";
    return NextResponse.redirect(new URL(renewed ? destination : "/login", request.url));
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export async function POST(request: Request) {
  try {
    const renewed = await renewSession(request);
    return renewed
      ? NextResponse.json({ user: renewed.user })
      : NextResponse.json({ error: "La sesión no se puede renovar." }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "La sesión no se puede renovar." }, { status: 401 });
  }
}
