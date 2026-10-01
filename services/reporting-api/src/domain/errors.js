export class DomainError extends Error {
  constructor(message, status = 400, code = "DOMAIN_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (message = "Recurso no encontrado.") =>
  new DomainError(message, 404, "NOT_FOUND");
export const unauthorized = (message = "No autorizado.") =>
  new DomainError(message, 401, "UNAUTHORIZED");
export const forbidden = (message = "No tiene permisos para acceder a reportes clínicos.") =>
  new DomainError(message, 403, "FORBIDDEN");
export const unavailable = (message = "Dependencia no disponible.") =>
  new DomainError(message, 503, "DEPENDENCY_UNAVAILABLE");
