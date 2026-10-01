import { proxyService } from "@/lib/server/service-client";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  return proxyService("patients", `/v1/patients/${encodeURIComponent(id)}`, request);
}

export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  return proxyService("patients", `/v1/patients/${encodeURIComponent(id)}`, request);
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  return proxyService("patients", `/v1/patients/${encodeURIComponent(id)}`, request);
}
