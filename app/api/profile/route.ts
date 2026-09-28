import { proxyService } from "@/lib/server/service-client";

export async function GET(request: Request) {
  return proxyService("identity", "/v1/profile", request);
}

export async function PUT(request: Request) {
  return proxyService("identity", "/v1/profile", request);
}
