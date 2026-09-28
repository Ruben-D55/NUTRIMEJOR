import { NextResponse } from "next/server";
import { callService } from "@/lib/server/service-client";

export async function POST(request: Request) {
  try {
    const response = await callService("identity", "/v1/password-resets/confirm", {
      method: "POST",
      body: await request.text(),
    }, request);
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "El servicio no está disponible." }, { status: 503 });
  }
}
