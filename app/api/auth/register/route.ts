import { NextResponse } from "next/server";
import { callService, refreshCookie, sessionCookie } from "@/lib/server/service-client";

export async function POST(request: Request) {
  try {
    const response = await callService(
      "identity",
      "/v1/users",
      { method: "POST", body: await request.text() },
      request,
    );
    const data = await response.json();
    if (!response.ok) return NextResponse.json(data, { status: response.status });

    const result = NextResponse.json({ user: data.user }, { status: 201 });
    result.cookies.set("nm_session", data.accessToken, sessionCookie);
    result.cookies.set("nm_refresh", data.refreshToken, refreshCookie);
    return result;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "El servicio de identidad no está disponible." }, { status: 503 });
  }
}
