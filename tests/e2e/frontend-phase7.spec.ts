import { expect, test } from "@playwright/test";

test("módulos operativos, navegación por teclado y diseño móvil", async ({ page }) => {
  const email = `frontend-${Date.now()}@example.test`;
  await page.goto("/login");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.locator('input[name="name"]').fill("Accesibilidad E2E");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("Password123!");
  await page.getByRole("button", { name: /^Crear cuenta/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/pacientes/nuevo");
  await page.getByLabel("Nombres").fill("María");
  await page.getByLabel("Apellidos").fill("Prueba Frontend");
  await page.getByLabel("Documento", { exact: true }).fill(`FE-${Date.now()}`);
  await page.getByLabel("Correo electrónico").fill(`paciente-${Date.now()}@example.test`);
  await page.getByRole("button", { name: "Registrar paciente" }).click();
  await expect(page).toHaveURL(/\/pacientes$/);
  await expect(page.getByText("María Prueba Frontend").first()).toBeVisible();

  await page.goto("/clinica");
  await page.getByRole("button", { name: "Nueva consulta" }).click();
  await page.getByLabel("Título *").fill("Consulta de control frontend");
  await page.getByLabel("Paciente *").selectOption({ label: "María Prueba Frontend" });
  await page.getByLabel("Detalles").fill("Registro creado desde la interfaz de fase 7.");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Consulta de control frontend").first()).toBeVisible();

  await page.goto("/mediciones");
  await page.getByRole("button", { name: "Nueva medición" }).click();
  await page.getByLabel("Paciente *").selectOption({ label: "María Prueba Frontend" });
  await page.getByLabel("Título *").fill("Medición inicial frontend");
  await page.getByLabel("Peso (kg)").fill("68.4");
  await page.getByLabel("Estatura (cm)").fill("165");
  await page.getByRole("button", { name: "Guardar medición" }).click();
  await expect(page.getByText("Medición inicial frontend").first()).toBeVisible();
  await page.getByLabel("Paciente para filtrar y graficar").selectOption({ label: "María Prueba Frontend" });
  await expect(page.getByRole("img", { name: /Peso e IMC/ })).toBeVisible();

  const modules: Array<[string, string]> = [
    ["/pacientes", "Mis pacientes"], ["/clinica", "Historia clínica"],
    ["/mediciones", "Mediciones"], ["/nutricion", "Evaluación nutricional"],
    ["/planes", "Planes nutricionales"], ["/agenda", "Agenda"],
    ["/notificaciones", "Notificaciones"], ["/documentos", "Documentos"],
    ["/reportes", "Reportes"], ["/membresia", "Membresía"],
  ];
  for (const [path, heading] of modules) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
  }

  await page.goto("/mediciones");
  await expect(page.getByRole("heading", { name: "Gráficas de evolución" })).toBeVisible();
  await page.getByRole("button", { name: "Nueva medición" }).focus();
  await expect(page.getByRole("button", { name: "Nueva medición" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Nueva sesión de medición" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pacientes");
  await expect(page.getByRole("heading", { name: "Mis pacientes" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Nuevo paciente" })).toBeVisible();
});
