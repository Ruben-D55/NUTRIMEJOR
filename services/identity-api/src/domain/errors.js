export class DomainError extends Error {
  constructor(message, status = 400, code = "DOMAIN_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const unauthorized = (message = "Sesión inválida o vencida.") =>
  new DomainError(message, 401, "UNAUTHORIZED");

export const forbidden = (message = "Acceso denegado.") =>
  new DomainError(message, 403, "FORBIDDEN");

export const notFound = (message) => new DomainError(message, 404, "NOT_FOUND");

export const conflict = (message) => new DomainError(message, 409, "CONFLICT");
