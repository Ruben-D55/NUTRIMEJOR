import { proxyService } from "@/lib/server/service-client";

export async function PATCH(request: Request) {
  return proxyService("identity", "/v1/profile/password", request);
}
