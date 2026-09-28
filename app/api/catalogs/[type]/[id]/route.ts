import { proxyService } from "@/lib/server/service-client";

type Context = { params: Promise<{ type: string; id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const { type, id } = await params;
  return proxyService(
    "catalogs",
    `/v1/catalogs/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
    request,
  );
}

export async function DELETE(request: Request, { params }: Context) {
  const { type, id } = await params;
  return proxyService(
    "catalogs",
    `/v1/catalogs/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
    request,
  );
}
