import { proxyService } from "@/lib/server/service-client";

export async function GET(request: Request) {
  return proxyService("patients", `/v1/patients${new URL(request.url).search}`, request);
}

export async function POST(request: Request) {
  return proxyService("patients", "/v1/patients", request);
}
