import { expect, test } from "@playwright/test";

test("patrón CRUD común, ficha rápida, teclado y vista móvil", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/login");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.locator('input[name="name"]').fill("Diseño CRUD E2E");
  await page.locator('input[name="email"]').fill(`crud-${stamp}@example.test`);
  await page.locator('input[name="password"]').fill("Password123!");
  await page.getByRole("button", { name: /^Crear cuenta/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/pacientes/nuevo");
  await expect(page.getByRole("group", { name: "Identificación" })).toBeVisible();
  await page.getByLabel("Nombres *").fill("María");
  await page.getByLabel("Apellidos *").fill(`Diseño ${stamp}`);
  await page.getByLabel("Documento", { exact: true }).fill(`CRUD-${stamp}`);
  await page.getByLabel("Objetivo general").fill("Seguimiento ejecutivo");
  await page.getByRole("button", { name: "Registrar paciente" }).click();

  await expect(page.getByRole("heading", { name: "Mis pacientes" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Resumen" })).toBeVisible();
  await expect(page.getByLabel("Registros por página")).toHaveValue("10");
  await expect(page.getByRole("button", { name: "CSV" })).toBeEnabled();

  const name = `María Diseño ${stamp}`;
  const row = page.getByRole("row").filter({ hasText: name });
  await row.getByLabel(`Acciones de ${name}`).click();
  await row.getByRole("button", { name: "Ver ficha" }).click();
  const drawer = page.getByRole("dialog", { name });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Seguimiento ejecutivo")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar panel" }).click();
  await expect(drawer).toHaveCount(0);

  await page.goto("/clinica");
  await expect(page.getByRole("region", { name: "Resumen" })).toBeVisible();
  await page.getByRole("button", { name: "Nueva consulta" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Nueva consulta" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pacientes");
  await expect(page.getByRole("heading", { name: "Mis pacientes" })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: name })).toBeVisible();
  await expect(page.locator("table.data-table")).toBeHidden();
});
