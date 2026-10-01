import assert from "node:assert/strict";

const serviceKey = process.env.SERVICE_API_KEY || "local-service-key-change-me-1234";

async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`http://localhost:4001${path}`, {
    method,
    headers: {
      "x-service-key": serviceKey,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

const stamp = Date.now();
const owner = await request("/v1/users", {
  method: "POST",
  body: { name: "Propietaria Clínica", email: `owner-${stamp}@example.test`, password: "Password123!" },
});
const memberEmail = `member-${stamp}@example.test`;
const member = await request("/v1/users", {
  method: "POST",
  body: { name: "Nutricionista Miembro", email: memberEmail, password: "Password123!" },
});

const organization = await request("/v1/organizations", {
  token: owner.accessToken,
  method: "POST",
  body: { name: "Clínica de Integración" },
});
const ownerSession = await request("/v1/sessions/organization", {
  token: owner.accessToken,
  method: "POST",
  body: { organizationId: organization.id },
});
assert.equal(ownerSession.user.organizationRole, "OWNER");

const invitation = await request(`/v1/organizations/${organization.id}/invitations`, {
  token: ownerSession.accessToken,
  method: "POST",
  body: { email: memberEmail, role: "NUTRITIONIST" },
});
const memberSession = await request("/v1/invitations/accept", {
  token: member.accessToken,
  method: "POST",
  body: { token: invitation.token },
});
assert.equal(memberSession.user.organizationId.toLowerCase(), organization.id.toLowerCase());
assert.equal(memberSession.user.organizationRole, "NUTRITIONIST");

const members = await request(`/v1/organizations/${organization.id}/members`, { token: ownerSession.accessToken });
assert.equal(members.length, 2);
assert.deepEqual(new Set(members.map((item) => item.role)), new Set(["OWNER", "NUTRITIONIST"]));

console.log(JSON.stringify({
  organizationId: organization.id,
  members: members.length,
  roles: members.map((item) => item.role).sort(),
  invitationAccepted: true,
}));
