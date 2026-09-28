import { callService } from "@/lib/server/service-client";
import { NextResponse } from "next/server";

async function forward(request: Request, method: "GET" | "POST") {
  try {
    const body = method === "POST" ? await request.text() : undefined;
    const response = await callService("identity", "/v1/organizations", { method, body }, request);
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "El servicio no está disponible temporalmente." }, { status: 503 });
  }
}

export const GET = (request: Request) => forward(request, "GET");
export const POST = (request: Request) => forward(request, "POST");
