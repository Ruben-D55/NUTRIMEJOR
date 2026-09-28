import test from "node:test";
import assert from "node:assert/strict";
import { IdentityService } from "../src/application/identity-service.js";

function fixture(existingUser = null) {
  const users = {
    findByEmail: async () => existingUser,
    findActiveById: async () => existingUser,
    create: async (data) => ({
      id: 7,
      name: data.name,
      email: data.email,
      role: "NUTRICIONISTA",
      organizationId: "eb7ee0b4-3fff-414b-a2c9-d815bd30e310",
      organizationRole: "OWNER",
    }),
    updateProfile: async () => true,
    updatePassword: async () => undefined,
    createRefreshSession: async () => undefined,
  };
  const passwords = {
    hash: async () => "hashed",
    verify: async (value) => value === "correct-password",
  };
  const tokens = {
    sign: async () => "signed-token",
    verify: async () => ({
      id: 7,
      name: "Ana",
      role: "NUTRICIONISTA",
      organizationId: "eb7ee0b4-3fff-414b-a2c9-d815bd30e310",
      organizationRole: "OWNER",
    }),
  };
  return new IdentityService(users, passwords, tokens);
}

test("register normalizes email and returns a token", async () => {
  const result = await fixture().register({
    name: "Ana Morales",
    email: "ANA@EXAMPLE.COM",
    password: "secure-password",
  });
  assert.equal(result.user.email, "ana@example.com");
  assert.equal(result.accessToken, "signed-token");
});

test("login rejects an invalid password without revealing the cause", async () => {
  const service = fixture({
    id: 7,
    name: "Ana",
    email: "ana@example.com",
    role: "NUTRICIONISTA",
    passwordHash: "hashed",
    active: true,
  });
  await assert.rejects(
    () => service.login({ email: "ana@example.com", password: "wrong-password" }),
    (error) => error.status === 401 && error.message === "Correo o contraseña incorrectos.",
  );
});

test("assistants cannot invite organization members", async () => {
  const service = fixture();
  await assert.rejects(
    () => service.invite(
      {
        id: 7,
        organizationId: "eb7ee0b4-3fff-414b-a2c9-d815bd30e310",
        organizationRole: "ASSISTANT",
      },
      "eb7ee0b4-3fff-414b-a2c9-d815bd30e310",
      { email: "member@example.com", role: "NUTRITIONIST" },
    ),
    (error) => error.status === 403,
  );
});

test("switching organization issues a token for an active membership", async () => {
  const organizationId = "7b774def-07e7-40cc-a57e-73431273bf6f";
  const users = {
    findActiveById: async (id, requestedOrganizationId) => ({
      id,
      name: "Ana",
      email: "ana@example.com",
      role: "NUTRICIONISTA",
      organizationId: requestedOrganizationId,
      organizationRole: "ADMIN",
    }),
    createRefreshSession: async () => undefined,
  };
  const service = new IdentityService(users, {}, { sign: async () => "organization-token" });
  const result = await service.switchOrganization({ id: 7 }, { organizationId });
  assert.equal(result.user.organizationId, organizationId);
  assert.equal(result.accessToken, "organization-token");
});

test("refresh rotates the token and rejects reuse through the repository", async () => {
  let replacementHash;
  const users = {
    rotateRefreshSession: async (input) => {
      replacementHash = input.replacementHash;
      return { userId: 7, organizationId: "eb7ee0b4-3fff-414b-a2c9-d815bd30e310" };
    },
    findActiveById: async () => ({
      id: 7, name: "Ana", email: "ana@example.com", role: "NUTRICIONISTA",
      organizationId: "eb7ee0b4-3fff-414b-a2c9-d815bd30e310", organizationRole: "OWNER",
    }),
  };
  const service = new IdentityService(users, {}, { sign: async () => "new-access-token" });
  const result = await service.refresh({ refreshToken: "a".repeat(96) });
  assert.equal(result.accessToken, "new-access-token");
  assert.equal(result.refreshToken.length, 96);
  assert.equal(replacementHash.length, 64);
});

test("password recovery does not reveal missing accounts", async () => {
  const service = new IdentityService(
    { findByEmail: async () => null, auditAccess: async () => undefined },
    {},
    {},
    { exposeDevelopmentTokens: true },
  );
  assert.deepEqual(
    await service.requestPasswordReset({ email: "missing@example.com" }),
    { accepted: true },
  );
});

test("password recovery exposes a one-time token only in development", async () => {
  let reset;
  const service = new IdentityService(
    {
      findByEmail: async () => ({
        id: 7, active: true, organizationId: "eb7ee0b4-3fff-414b-a2c9-d815bd30e310",
      }),
      createPasswordReset: async (value) => { reset = value; },
      auditAccess: async () => undefined,
    },
    {},
    {},
    { exposeDevelopmentTokens: true },
  );
  const result = await service.requestPasswordReset({ email: "ana@example.com" });
  assert.equal(result.resetToken.length, 64);
  assert.equal(reset.tokenHash.length, 64);
});

test("resetting a password rejects an expired token", async () => {
  const service = new IdentityService(
    { consumePasswordReset: async () => null, auditAccess: async () => undefined },
    { hash: async () => "new-hash" },
    {},
  );
  await assert.rejects(
    () => service.resetPassword({
      token: "a".repeat(64), newPassword: "new-password", confirmation: "new-password",
    }),
    (error) => error.code === "PASSWORD_RESET_INVALID",
  );
});
