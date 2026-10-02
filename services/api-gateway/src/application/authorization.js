const clinical = new Set(["clinical", "measurements", "nutrition", "planning", "reporting"]);

function ownsPatient(actor, url, body) {
  if (!actor.patientId) return false;
  const expected = String(actor.patientId).toLowerCase();
  const queryPatient = url.searchParams.get("patientId")?.toLowerCase();
  const bodyPatient = typeof body?.patientId === "string" ? body.patientId.toLowerCase() : null;
  return queryPatient === expected || bodyPatient === expected
    || url.pathname.split("/").some((part) => decodeURIComponent(part).toLowerCase() === expected);
}

export function authorize(actor, service, method, url, body = null) {
  const role = actor.organizationRole;
  if (["OWNER", "ADMIN"].includes(role)) return true;
  if (role === "NUTRITIONIST") {
    if (service === "identity" && method !== "GET"
        && !url.pathname.includes("/sessions/organization")
        && !url.pathname.startsWith("/v1/profile")) return false;
    if (service === "subscriptions" && method !== "GET") return false;
    return true;
  }
  if (role === "ASSISTANT") {
    if (["patients", "scheduling", "notifications"].includes(service)) return true;
    if (service === "catalogs") return method === "GET";
    return service === "identity" && (url.pathname.endsWith("/sessions/me")
      || url.pathname.includes("/sessions/organization")
      || url.pathname.startsWith("/v1/profile"));
  }
  if (role === "PATIENT") {
    if (service === "identity") return url.pathname.endsWith("/sessions/me");
    if (method !== "GET" && !(service === "scheduling" && method === "POST")) return false;
    return (service === "patients" || clinical.has(service)
      || ["scheduling", "documents", "notifications"].includes(service)) && ownsPatient(actor, url, body);
  }
  return false;
}
