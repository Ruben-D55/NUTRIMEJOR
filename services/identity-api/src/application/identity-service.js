import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { DomainError, conflict, forbidden, notFound, unauthorized } from "../domain/errors.js";

const credentials = z.object({
  email: z.string().email().max(180).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(100),
});

const registration = credentials.extend({
  name: z.string().trim().min(3).max(120),
});

const profile = z.object({
  name: z.string().trim().min(3).max(120),
  license: z.string().trim().max(80),
  specialty: z.string().trim().max(120),
  appearance: z.enum(["light", "dark", "system"]),
});

const passwordChange = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100),
  confirmation: z.string(),
}).refine((value) => value.newPassword === value.confirmation, {
  message: "Las contraseñas no coinciden.",
});

const organization = z.object({ name: z.string().trim().min(3).max(150) });
const organizationSelection = z.object({ organizationId: z.string().uuid() });
const invitation = z.object({
  email: z.string().email().max(180).transform((value) => value.toLowerCase()),
  role: z.enum(["ADMIN", "NUTRITIONIST", "ASSISTANT", "PATIENT"]),
  patientId: z.string().uuid().optional(),
}).superRefine((value, context) => {
  if (value.role === "PATIENT" && !value.patientId) {
    context.addIssue({ code: "custom", message: "El rol paciente requiere patientId." });
  }
  if (value.role !== "PATIENT" && value.patientId) {
    context.addIssue({ code: "custom", message: "patientId solo se permite para el rol paciente." });
  }
});
const invitationToken = z.object({ token: z.string().length(64) });
const refreshRequest = z.object({ refreshToken: z.string().length(96) });
const passwordResetRequest = z.object({
  email: z.string().email().max(180).transform((value) => value.toLowerCase()),
});
const passwordResetConfirmation = z.object({
  token: z.string().length(64),
  newPassword: z.string().min(8).max(100),
  confirmation: z.string(),
}).refine((value) => value.newPassword === value.confirmation, {
  message: "Las contraseñas no coinciden.",
});

const refreshHash = (token) => createHash("sha256").update(token).digest("hex");

export class IdentityService {
  constructor(users, passwords, tokens, options = {}) {
    this.users = users;
    this.passwords = passwords;
    this.tokens = tokens;
    this.exposeDevelopmentTokens = Boolean(options.exposeDevelopmentTokens);
    this.refreshTokenDays = options.refreshTokenDays || 7;
  }

  async register(input, context) {
    const data = registration.parse(input);
    if (await this.users.findByEmail(data.email)) {
      await this.audit("registration", false, null, context, { reason: "email_conflict" });
      throw conflict("El correo ya está registrado.");
    }
    const user = await this.users.create({
      name: data.name,
      email: data.email,
      passwordHash: await this.passwords.hash(data.password),
    });
    const session = await this.issueSession(user);
    await this.audit("registration", true, user, context);
    return session;
  }

  async login(input, context) {
    const data = credentials.parse(input);
    const user = await this.users.findByEmail(data.email);
    if (!user?.active || !(await this.passwords.verify(data.password, user.passwordHash))) {
      await this.audit("login", false, user, context, { reason: "invalid_credentials" });
      throw unauthorized("Correo o contraseña incorrectos.");
    }
    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationRole: user.organizationRole,
      patientId: user.patientId,
    };
    const session = await this.issueSession(safeUser);
    await this.audit("login", true, safeUser, context);
    return session;
  }

  async authenticate(token) {
    try {
      const claims = await this.tokens.verify(token);
      const user = await this.users.findActiveById(claims.id, claims.organizationId);
      if (!user) throw unauthorized();
      return {
        id: user.id,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        organizationRole: user.organizationRole,
        patientId: user.patientId,
      };
    } catch (error) {
      if (error?.status === 401) throw error;
      throw unauthorized();
    }
  }

  listOrganizations(actor) {
    return this.users.listOrganizations(actor.id);
  }

  createOrganization(actor, input) {
    if (!["OWNER", "ADMIN"].includes(actor.organizationRole)) {
      throw forbidden("No puedes crear organizaciones.");
    }
    return this.users.createOrganization(actor, organization.parse(input).name);
  }

  listMembers(actor, organizationId) {
    const id = z.string().uuid().parse(organizationId);
    if (actor.organizationId.toLowerCase() !== id.toLowerCase()) {
      throw forbidden("Selecciona esta organización para consultar sus miembros.");
    }
    if (!["OWNER", "ADMIN", "NUTRITIONIST"].includes(actor.organizationRole)) {
      throw forbidden("Tu rol no permite consultar los miembros.");
    }
    return this.users.listMembers(id);
  }

  async invite(actor, organizationId, input) {
    const id = z.string().uuid().parse(organizationId);
    if (actor.organizationId.toLowerCase() !== id.toLowerCase()
      || !["OWNER", "ADMIN"].includes(actor.organizationRole)) {
      throw forbidden("No puedes invitar miembros a esta organización.");
    }
    const data = invitation.parse(input);
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const result = await this.users.createInvitation(actor, {
      ...data,
      tokenHash,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });
    return { ...result, token };
  }

  async acceptInvitation(actor, input) {
    const { token } = invitationToken.parse(input);
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const accepted = await this.users.acceptInvitation(actor, tokenHash);
    if (!accepted) throw notFound("La invitación no existe, venció o pertenece a otro correo.");
    return this.issueOrganizationSession(actor.id, accepted.organizationId);
  }

  async switchOrganization(actor, input, context) {
    const { organizationId } = organizationSelection.parse(input);
    const session = await this.issueOrganizationSession(actor.id, organizationId);
    await this.audit("organization_switch", true, session.user, context);
    return session;
  }

  async issueOrganizationSession(userId, organizationId) {
    const user = await this.users.findActiveById(userId, organizationId);
    if (!user) throw forbidden("No perteneces a esta organización.");
    const safeUser = {
      id: user.id, name: user.name, email: user.email, role: user.role,
      organizationId: user.organizationId, organizationRole: user.organizationRole,
      patientId: user.patientId,
    };
    return this.issueSession(safeUser);
  }

  async issueSession(user) {
    const refreshToken = randomBytes(48).toString("hex");
    await this.users.createRefreshSession({
      userId: user.id,
      organizationId: user.organizationId,
      tokenHash: refreshHash(refreshToken),
      expiresAt: new Date(Date.now() + this.refreshTokenDays * 24 * 60 * 60 * 1000),
    });
    return { user, accessToken: await this.tokens.sign(user), refreshToken };
  }

  async refresh(input, context) {
    const { refreshToken } = refreshRequest.parse(input);
    const replacementToken = randomBytes(48).toString("hex");
    const session = await this.users.rotateRefreshSession({
      tokenHash: refreshHash(refreshToken),
      replacementHash: refreshHash(replacementToken),
      replacementExpiresAt: new Date(Date.now() + this.refreshTokenDays * 24 * 60 * 60 * 1000),
    });
    if (!session) {
      await this.audit("refresh", false, null, context, { reason: "invalid_or_reused" });
      throw unauthorized("La sesión de renovación no es válida.");
    }
    const user = await this.users.findActiveById(session.userId, session.organizationId);
    if (!user) throw unauthorized();
    const safeUser = {
      id: user.id, name: user.name, email: user.email, role: user.role,
      organizationId: user.organizationId, organizationRole: user.organizationRole,
      patientId: user.patientId,
    };
    const result = { user: safeUser, accessToken: await this.tokens.sign(safeUser), refreshToken: replacementToken };
    await this.audit("refresh", true, safeUser, context);
    return result;
  }

  async logout(input, context) {
    const { refreshToken } = refreshRequest.parse(input);
    await this.users.revokeRefreshSession(refreshHash(refreshToken));
    await this.audit("logout", true, null, context);
    return { ok: true };
  }

  async logoutAll(actor, context) {
    await this.users.revokeAllRefreshSessions(actor.id, actor.organizationId);
    await this.audit("logout_all", true, actor, context);
    return { ok: true };
  }

  async requestPasswordReset(input, context) {
    const { email } = passwordResetRequest.parse(input);
    const user = await this.users.findByEmail(email);
    let token;
    if (user?.active) {
      token = randomBytes(32).toString("hex");
      await this.users.createPasswordReset({
        userId: user.id,
        tokenHash: refreshHash(token),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });
      await this.audit("password_reset_requested", true, user, context);
    } else {
      await this.audit("password_reset_requested", false, null, context, { reason: "account_not_found" });
    }
    return {
      accepted: true,
      ...(this.exposeDevelopmentTokens && token ? { resetToken: token } : {}),
    };
  }

  async resetPassword(input, context) {
    const data = passwordResetConfirmation.parse(input);
    const reset = await this.users.consumePasswordReset(
      refreshHash(data.token),
      await this.passwords.hash(data.newPassword),
    );
    if (!reset) {
      await this.audit("password_reset_completed", false, null, context, { reason: "invalid_or_expired" });
      throw new DomainError("El enlace de recuperación no es válido o venció.", 400, "PASSWORD_RESET_INVALID");
    }
    await this.audit("password_reset_completed", true, {
      id: reset.userId,
      organizationId: reset.organizationId,
    }, context);
    return { ok: true };
  }

  listAccessAudit(actor, limit) {
    const parsedLimit = z.coerce.number().int().min(1).max(200).default(100).parse(limit || undefined);
    return this.users.listAccessAudit(actor, parsedLimit);
  }

  async audit(eventType, success, actor, context, details = {}) {
    if (!this.users.auditAccess) return;
    try {
      await this.users.auditAccess({
        eventType,
        success,
        userId: actor?.id,
        organizationId: actor?.organizationId,
        requestId: context?.requestId,
        ipHash: context?.ipAddress
          ? createHash("sha256").update(context.ipAddress).digest("hex")
          : null,
        userAgent: context?.userAgent,
        details,
      });
    } catch (error) {
      console.error(JSON.stringify({ message: "access audit failed", error: error?.message || String(error) }));
    }
  }

  jwks() {
    return this.tokens.jwks();
  }

  async getProfile(actor) {
    const user = await this.users.findActiveById(actor.id);
    if (!user) throw notFound("Usuario no encontrado.");
    return user;
  }

  async updateProfile(actor, input) {
    const data = profile.parse(input);
    if (!(await this.users.updateProfile(actor.id, data))) {
      throw notFound("Usuario no encontrado.");
    }
    return { ok: true };
  }

  async changePassword(actor, input, context) {
    const data = passwordChange.parse(input);
    const user = await this.users.findByEmail((await this.getProfile(actor)).email);
    if (!user || !(await this.passwords.verify(data.currentPassword, user.passwordHash))) {
      throw new DomainError(
        "La contraseña actual es incorrecta.",
        400,
        "INVALID_PASSWORD",
      );
    }
    if (data.currentPassword === data.newPassword) {
      throw new DomainError(
        "La nueva contraseña debe ser diferente.",
        400,
        "SAME_PASSWORD",
      );
    }
    await this.users.updatePassword(actor.id, await this.passwords.hash(data.newPassword));
    await this.users.revokeAllRefreshSessions(actor.id, actor.organizationId);
    await this.audit("password_changed", true, actor, context);
    return { ok: true };
  }
}
