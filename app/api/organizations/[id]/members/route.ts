import { proxyService } from "@/lib/server/service-client";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyService("identity", `/v1/organizations/${encodeURIComponent(id)}/members`, request);
}
