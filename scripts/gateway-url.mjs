const services = new Map([
  ["4001", "identity"], ["4002", "patients"], ["4003", "catalogs"], ["4004", "subscriptions"],
  ["4005", "clinical"], ["4006", "measurements"], ["4007", "nutrition"], ["4008", "planning"],
  ["4009", "scheduling"], ["4010", "notifications"], ["4011", "documents"], ["4012", "reporting"],
]);

export function gatewayUrl(rawUrl) {
  const source = new URL(rawUrl);
  const service = services.get(source.port);
  if (!service) return rawUrl;
  const gateway = process.env.GATEWAY_API_URL || "http://127.0.0.1:4080";
  if (["/health", "/health/ready"].includes(source.pathname)) {
    return `${gateway}/api/v1/${service}/_health/ready`;
  }
  let path = source.pathname.replace(/^\/v1/, "") || "/";
  if (["patients", "catalogs"].includes(service)
      && (path === `/${service}` || path.startsWith(`/${service}/`))) {
    path = path.slice(service.length + 1) || "";
  }
  return `${gateway}/api/v1/${service}${path}${source.search}`;
}
