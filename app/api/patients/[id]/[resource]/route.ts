import { NextResponse } from "next/server";
import { proxyService } from "@/lib/server/service-client";

const allowed = new Set(["contacts", "emergency-contacts", "assignments", "tags", "consents"]);
type Context = { params: Promise<{ id: string; resource: string }> };

async function handle(request: Request, { params }: Context) {
  const { id, resource } = await params;
  if (!allowed.has(resource)) return NextResponse.json({ error: "Recurso no encontrado." }, { status: 404 });
  return proxyService("patients", `/v1/patients/${encodeURIComponent(id)}/${resource}`, request);
}

export const GET = handle;
export const POST = handle;
