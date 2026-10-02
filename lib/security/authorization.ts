import type { NextRequest } from "next/server";
import { sessionClaims } from "./request-policy";

const clinicalServices = new Set(["clinical", "measurements", "nutrition", "planning", "reporting"]);

function patientOwnsRequest(request: NextRequest, patientId?: string) {
  if (!patientId) return false;
  const path = request.nextUrl.pathname;
  const requestedPatient = request.nextUrl.searchParams.get("patientId");
  return requestedPatient === patientId || path.split("/").some((part) => decodeURIComponent(part) === patientId);
}

export function authorizeRequest(request: NextRequest) {
  const { organizationRole: role, patientId } = sessionClaims(request);
  if (!role || ["OWNER", "ADMIN"].includes(role)) return true;
  const method = request.method.toUpperCase();
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/auth") || path.startsWith("/api/profile")) return true;
  if (role === "NUTRITIONIST") return true;
  if (role === "ASSISTANT") {
    if (path.startsWith("/api/patients") || path.includes("/scheduling/") || path.includes("/notifications/")) return true;
    if (path.startsWith("/api/catalogs/") && method === "GET") return true;
    return false;
  }
  if (role === "PATIENT") {
    if (method !== "GET" && !(path.includes("/scheduling/appointments") && method === "POST")) return false;
    if (path.startsWith("/api/patients/")) return patientOwnsRequest(request, patientId);
    const service = path.match(/^\/api\/platform\/([^/]+)/)?.[1];
    return Boolean(service && (clinicalServices.has(service) || ["scheduling", "documents", "notifications"].includes(service))
      && patientOwnsRequest(request, patientId));
  }
  return false;
}
