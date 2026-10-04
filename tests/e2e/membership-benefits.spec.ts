import { expect, test } from "@playwright/test";

test("muestra beneficios, cuotas y cambio de plan", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/login");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.locator('input[name="name"]').fill("Membresías E2E");
  await page.locator('input[name="email"]').fill(`membership-ui-${stamp}@example.test`);
  await page.locator('input[name="password"]').fill("Password123!");
  await page.getByRole("button", { name: /^Crear cuenta/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/membresia");
  await expect(page.getByRole("heading", { name: "Beneficios de cada plan" })).toBeVisible();

  const basic = page.locator("article").filter({ has: page.getByRole("heading", { name: "Básica", exact: true }) });
  await expect(basic.getByText("Pacientes activos")).toBeVisible();
  await expect(basic.getByText("Hasta 50 pacientes")).toBeVisible();
  await expect(basic.getByText("Antropometría deportiva")).toBeVisible();
  await expect(basic.getByText("No incluido").first()).toBeVisible();

  const pro = page.locator("article").filter({ has: page.getByRole("heading", { name: "Pro", exact: true }) });
  await expect(pro.getByText("Hasta 500 pacientes")).toBeVisible();
  await pro.getByRole("button", { name: "Seleccionar plan" }).click();
  await page.getByRole("button", { name: "Confirmar cambio" }).click();
  await expect(pro.getByRole("button", { name: "Plan actual" })).toBeDisabled();

  const usage = page.locator("section.card").filter({ has: page.getByRole("heading", { name: "Uso del plan actual" }) });
  await expect(usage.getByText("0 usados · 500 disponibles")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Historial de membresía" })).toBeVisible();
});
