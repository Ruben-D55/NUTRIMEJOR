import { proxyService } from "@/lib/server/service-client";

export function GET(request: Request) {
  const incoming = new URL(request.url);
  return proxyService("identity", `/v1/audit/access${incoming.search}`, request);
}
