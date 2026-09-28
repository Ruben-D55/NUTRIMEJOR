import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { callService } from "@/lib/server/service-client";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("nm_refresh")?.value;
  if (refreshToken) {
    try {
      await callService("identity", "/v1/sessions/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      }, request);
    } catch (error) {
      console.error("No se pudo revocar la sesión:", error);
    }
  }
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set("nm_session", "", { maxAge: 0, path: "/" });
  response.cookies.set("nm_refresh", "", { maxAge: 0, path: "/" });
  return response;
}
