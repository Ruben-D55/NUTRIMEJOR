import { proxyService } from "@/lib/server/service-client";

export async function GET(request: Request) {
  return proxyService("identity", "/v1/sessions/me", request);
}
