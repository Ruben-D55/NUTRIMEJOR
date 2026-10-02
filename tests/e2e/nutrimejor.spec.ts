import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";

const serviceKey = process.env.SERVICE_API_KEY;
if (!serviceKey || serviceKey.length < 32) throw new Error("SERVICE_API_KEY is required for E2E tests");
const password = "Password123!";

async function service<T>(
  request: APIRequestContext,
  port: number,
  path: string,
  options: { method?: string; token?: string; data?: unknown; status?: number } = {},
) {
  const method = options.method || "GET";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  const signature = createHmac("sha256", serviceKey)
    .update(`${timestamp}.${nonce}.${method}.${path}`)
    .digest("hex");
  const response = await request.fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      "x-service-timestamp": timestamp,
      "x-service-nonce": nonce,
      "x-service-signature": signature,
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    data: options.data,
  });
  expect(response.status(), await response.text()).toBe(options.status || 200);
  return response.status() === 204 ? undefined as T : await response.json() as T;
}

async function registerFromLogin(page: Page, email: string, name = "Nutricionista E2E") {
  await page.goto("/login");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^Crear cuenta/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Panel principal" })).toBeVisible();
}

async function login(page: Page, email: string, currentPassword = password) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(currentPassword);
  await page.getByRole("button", { name: /^Ingresar/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("registro, cierre de sesión, recuperación e inicio de sesión", async ({ page }) => {
  const email = `auth-e2e-${Date.now()}@example.test`;
  const newPassword = "NewPassword123!";

  await registerFromLogin(page, email);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await login(page, email);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
  await expect(page).toHaveURL(/\/recuperar$/);
  await expect(page.getByRole("heading", { name: "Recuperar contraseña" })).toBeVisible();
  await page.locator('input[name="email"]').fill(email);
  await page.getByRole("button", { name: "Solicitar recuperación" }).click();
  const token = page.locator('input[name="token"]');
  await expect(token).toHaveValue(/[a-f0-9]{64}/);
  await page.locator('input[name="newPassword"]').fill(newPassword);
  await page.locator('input[name="confirmation"]').fill(newPassword);
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(page.getByText("Contraseña actualizada. Ya puedes iniciar sesión.")).toBeVisible();

  await page.getByRole("link", { name: "Volver a iniciar sesión" }).click();
  await login(page, email, newPassword);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("creación y edición de pacientes desde la interfaz", async ({ page }) => {
  const stamp = Date.now();
  const email = `patients-e2e-${stamp}@example.test`;
  await registerFromLogin(page, email, "Pacientes E2E");

  await page.getByRole("link", { name: "Nuevo paciente" }).first().click();
  await page.getByLabel("Nombres", { exact: true }).fill("Elena");
  await page.getByLabel("Apellidos", { exact: true }).fill(`Integral ${stamp}`);
  await page.getByLabel("Documento", { exact: true }).fill(`E2E-${stamp}`);
  await page.getByLabel("Fecha de nacimiento").fill("1990-04-12");
  await page.getByLabel("Correo electrónico").fill(`patient-${stamp}@example.test`);
  await page.getByLabel("Ciudad").fill("La Paz");
  await page.getByLabel("Objetivo general").fill("Mejorar composición corporal");
  await page.getByRole("button", { name: "Registrar paciente" }).click();
  await expect(page).toHaveURL(/\/pacientes$/);
  const row = page.getByRole("row").filter({ hasText: `Elena Integral ${stamp}` });
  await expect(row).toBeVisible();

  await row.getByTitle("Editar").click();
  await page.getByLabel("Nombres", { exact: true }).fill("Elena María");
  await page.getByLabel("Objetivo general").fill("Seguimiento nutricional integral");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page).toHaveURL(/\/pacientes$/);
  await expect(page.getByRole("row").filter({ hasText: `Elena María Integral ${stamp}` })).toBeVisible();
});

test("flujo integral clínico, mediciones, plan, agenda, reporte y documento", async ({ page, request }) => {
  const stamp = Date.now();
  const email = `workflow-e2e-${stamp}@example.test`;
  const registration = await service<{ accessToken: string }>(request, 4001, "/v1/users", {
    method: "POST",
    status: 201,
    data: { name: "Flujo Integral E2E", email, password },
  });
  const token = registration.accessToken;
  const patient = await service<{ id: string }>(request, 4002, "/v1/patients", {
    method: "POST",
    status: 201,
    token,
    data: {
      names: "Camila",
      lastNames: `Flujo ${stamp}`,
      documentType: "CI",
      document: `FLOW-${stamp}`,
      birthDate: "1991-08-20",
      sex: "Femenino",
      status: "Activo",
    },
  });

  const consultation = await service<{ id: string; status: string }>(request, 4005, "/v1/consultations", {
    method: "POST",
    status: 201,
    token,
    data: {
      patientId: patient.id,
      title: "Consulta integral E2E",
      consultationType: "initial",
      data: { reason: "Evaluación nutricional integral" },
    },
  });
  expect(consultation.status).toBe("draft");

  const measurement = await service<{ id: string; calculations: Array<{ formulaCode: string }> }>(
    request,
    4006,
    "/v1/measurement-sessions",
    {
      method: "POST",
      status: 201,
      token,
      data: {
        patientId: patient.id,
        title: "Evaluación antropométrica E2E",
        recordedAt: "2030-01-07T14:00:00.000Z",
        method: "Protocolo básico",
        measurements: [
          { type: "weight", value: 68, unit: "kg" },
          { type: "height", value: 165, unit: "cm" },
          { type: "waist", value: 78, unit: "cm" },
        ],
      },
    },
  );
  expect(measurement.calculations.some((item) => item.formulaCode === "BMI")).toBeTruthy();

  const food = await service<{ id: string }>(request, 4003, "/v1/foods", {
    method: "POST",
    status: 201,
    token,
    data: {
      name: `Avena E2E ${stamp}`,
      category: "Cereales",
      nutrients: [
        { nutrientCode: "energy_kcal", amountPer100g: 389 },
        { nutrientCode: "carbohydrate_g", amountPer100g: 66 },
        { nutrientCode: "protein_g", amountPer100g: 17 },
        { nutrientCode: "fat_g", amountPer100g: 7 },
      ],
    },
  });
  const plan = await service<{ id: string; status: string }>(request, 4008, "/v1/meal-plans", {
    method: "POST",
    status: 201,
    token,
    data: {
      patientId: patient.id,
      title: "Plan nutricional E2E",
      validFrom: "2030-01-07",
      validTo: "2030-01-13",
      requirement: {
        weightKg: 68,
        heightCm: 165,
        ageYears: 38,
        sex: "female",
        activityFactor: 1.4,
        thermicEffectPercent: 10,
        macroPercentages: { carbohydrate: 50, protein: 20, fat: 30 },
      },
      mealDistribution: [
        { mealType: "Desayuno", percentEnergy: 30 },
        { mealType: "Almuerzo", percentEnergy: 40 },
        { mealType: "Cena", percentEnergy: 30 },
      ],
      days: [{
        date: "2030-01-07",
        label: "Día 1",
        meals: [{
          mealType: "Desayuno",
          time: "08:00",
          items: [{ catalogType: "food", catalogId: food.id, amount: 60, amountUnit: "g" }],
        }],
      }],
    },
  });
  expect(plan.status).toBe("draft");

  await service(request, 4009, "/v1/availability/rules", {
    method: "POST",
    status: 201,
    token,
    data: { weekday: 1, startTime: "09:00", endTime: "17:00", timeZone: "America/La_Paz", slotMinutes: 30 },
  });
  const appointment = await service<{ id: string; status: string }>(request, 4009, "/v1/appointments", {
    method: "POST",
    status: 201,
    token,
    data: {
      patientId: patient.id,
      title: "Control E2E",
      type: "control",
      startsAt: "2030-01-07T14:00:00.000Z",
      endsAt: "2030-01-07T15:00:00.000Z",
      timeZone: "America/La_Paz",
      location: "Consultorio principal",
    },
  });
  expect(appointment.status).toBe("scheduled");

  const report = await service<{ id: string }>(request, 4012, "/v1/report-snapshots", {
    method: "POST",
    status: 201,
    token,
    data: {
      patientId: patient.id,
      title: "Reporte integral E2E",
      status: "ready",
      data: { consultationId: consultation.id, measurementId: measurement.id, planId: plan.id },
    },
  });
  expect(report.id).toBeTruthy();

  const template = await service<{ id: string }>(request, 4011, "/v1/templates", {
    method: "POST",
    status: 201,
    token,
    data: {
      name: "Plantilla E2E",
      documentType: "progress_report",
      definition: { organizationName: "NUTRIMEJOR E2E", primaryColor: "#166534" },
    },
  });
  const queuedDocument = await service<{ id: string; status: string }>(request, 4011, "/v1/generated-documents", {
    method: "POST",
    status: 202,
    token,
    data: {
      patientId: patient.id,
      title: "Documento de progreso E2E",
      documentType: "progress_report",
      templateId: template.id,
      patientDisplayName: `Camila Flujo ${stamp}`,
      sections: [
        { type: "heading", text: "Resumen del seguimiento" },
        { type: "paragraph", text: "Documento generado por la prueba integral automatizada." },
      ],
    },
  });
  expect(queuedDocument.status).toBe("queued");
  let generatedStatus = queuedDocument.status;
  for (let attempt = 0; attempt < 60 && ["queued", "processing"].includes(generatedStatus); attempt += 1) {
    await page.waitForTimeout(500);
    const generated = await service<{ status: string }>(
      request,
      4011,
      `/v1/generated-documents/${queuedDocument.id}`,
      { token },
    );
    generatedStatus = generated.status;
  }
  expect(generatedStatus).toBe("completed");

  await login(page, email);
  for (const [path, heading] of [
    ["/clinica", "Historia clínica"],
    ["/mediciones", "Mediciones"],
    ["/planes", "Planes nutricionales"],
    ["/agenda", "Agenda"],
    ["/reportes", "Reportes"],
    ["/documentos", "Documentos"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
});
