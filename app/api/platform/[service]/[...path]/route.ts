import { NextResponse } from "next/server";
import { proxyService, type ServiceName } from "@/lib/server/service-client";

const allowedServices = new Set<ServiceName>([
  "subscriptions",
  "clinical",
  "measurements",
  "nutrition",
  "planning",
  "scheduling",
  "notifications",
  "documents",
  "reporting",
]);

type RouteContext = {
  params: Promise<{ service: string; path: string[] }>;
};

async function handle(request: Request, context: RouteContext) {
  const { service, path } = await context.params;
  if (!allowedServices.has(service as ServiceName)) {
    return NextResponse.json({ error: "Servicio no encontrado." }, { status: 404 });
  }
  const incoming = new URL(request.url);
  const targetPath = `/v1/${path.map(encodeURIComponent).join("/")}${incoming.search}`;
  return proxyService(service as ServiceName, targetPath, request);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
