import { proxyService } from "@/lib/server/service-client";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyService("identity", `/v1/organizations/${encodeURIComponent(id)}/invitations`, request);
}
