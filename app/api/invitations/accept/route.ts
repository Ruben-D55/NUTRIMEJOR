import { callService, refreshCookie, sessionCookie } from "@/lib/server/service-client";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const response = await callService("identity", "/v1/invitations/accept", {
      method: "POST",
      body: await request.text(),
    }, request);
    const payload = await response.json();
    const result = NextResponse.json(payload, { status: response.status });
    if (response.ok && payload.accessToken) result.cookies.set("nm_session", payload.accessToken, sessionCookie);
    if (response.ok && payload.refreshToken) result.cookies.set("nm_refresh", payload.refreshToken, refreshCookie);
    return result;
  } catch {
    return NextResponse.json({ error: "El servicio no está disponible temporalmente." }, { status: 503 });
  }
}
