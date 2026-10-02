const services = new Set([
  "identity", "patients", "catalogs", "subscriptions", "clinical", "measurements",
  "nutrition", "planning", "scheduling", "notifications", "documents", "reporting",
]);

const legacyCatalogs = new Set(["recetas", "alimentos", "dietas"]);

export function resolveRoute(pathname, search = "") {
  const match = pathname.match(/^\/api\/v1\/([^/]+)(\/.*)?$/);
  if (!match || !services.has(match[1])) return null;
  const service = match[1];
  const rest = match[2] || "";
  if (rest === "/_health/ready") return { service, upstreamPath: "/health/ready" };
  let upstreamPath;
  if (service === "patients") upstreamPath = `/v1/patients${rest}`;
  else if (service === "catalogs" && legacyCatalogs.has(rest.split("/")[1])) upstreamPath = `/v1/catalogs${rest}`;
  else upstreamPath = `/v1${rest || `/${service}`}`;
  return { service, upstreamPath: `${upstreamPath}${search}` };
}

export function gatewayPath(service, upstreamPath) {
  const url = new URL(upstreamPath, "http://gateway.local");
  let path = url.pathname.replace(/^\/v1/, "") || "/";
  if (["patients", "catalogs"].includes(service) && (path === `/${service}` || path.startsWith(`/${service}/`))) {
    path = path.slice(service.length + 1) || "";
  }
  return `/api/v1/${service}${path}${url.search}`;
}
