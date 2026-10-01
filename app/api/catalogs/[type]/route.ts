import { proxyService } from "@/lib/server/service-client";

type Context = { params: Promise<{ type: string }> };

export async function GET(request: Request, { params }: Context) {
  const { type } = await params;
  return proxyService("catalogs", `/v1/catalogs/${encodeURIComponent(type)}`, request);
}

export async function POST(request: Request, { params }: Context) {
  const { type } = await params;
  return proxyService("catalogs", `/v1/catalogs/${encodeURIComponent(type)}`, request);
}
