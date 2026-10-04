import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

test("el BFF conserva los bytes y el contenido del PDF generado", async ({ page }) => {
  const stamp = Date.now();
  const patientName = `PDF Prueba ${stamp}`;
  const title = `Plan nutricional PDF ${stamp}`;

  await page.goto("/login");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.locator('input[name="name"]').fill("Documentos E2E");
  await page.locator('input[name="email"]').fill(`pdf-${stamp}@example.test`);
  await page.locator('input[name="password"]').fill("Password123!");
  await page.getByRole("button", { name: /^Crear cuenta/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/pacientes/nuevo");
  await page.getByLabel("Nombres *").fill("PDF");
  await page.getByLabel("Apellidos *").fill(`Prueba ${stamp}`);
  await page.getByRole("button", { name: "Registrar paciente" }).click();

  await page.goto("/documentos");
  await page.getByRole("button", { name: "Generar PDF" }).click();
  await page.getByLabel("Paciente *").selectOption({ label: patientName });
  await page.getByLabel("Título *").fill(title);
  await page.getByLabel("Contenido principal").fill("Contenido visible de prueba para comprobar que el documento no quede vacío.");
  await page.getByRole("button", { name: "Generar documento" }).click();
  const cookie = (await page.context().cookies()).map((item) => `${item.name}=${item.value}`).join("; ");

  let document: Record<string, unknown> | undefined;
  await expect.poll(async () => {
    const response = await page.request.get("/api/platform/documents/generated-documents", { headers: { cookie } });
    expect(response.ok()).toBeTruthy();
    const rows = await response.json() as Array<Record<string, unknown>>;
    document = rows.find((row) => row.title === title);
    return document?.status;
  }, { timeout: 30_000 }).toBe("completed");

  const accessResponse = await page.request.post(`/api/platform/documents/generated-documents/${document?.id}/access-url`, {
    headers: { cookie },
    data: { expiresInMinutes: 15 },
  });
  expect(accessResponse.ok()).toBeTruthy();
  const access = await accessResponse.json() as { url: string };
  const token = access.url.split("/").pop();
  expect(token).toBeTruthy();

  const download = await page.request.get(`/api/platform/documents/download/${token}`, { headers: { cookie } });
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toContain("application/pdf");
  expect(download.headers()["content-disposition"]).toContain(`${title}.pdf`);
  const bytes = Buffer.from(await download.body());
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(1_000);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(download.headers()["x-content-sha256"]);
});
