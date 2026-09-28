import { z } from "zod";

export const recordId = z.string().uuid();

const anthropometricUnits = Object.freeze({
  weight: "kg",
  height: "cm",
  waist: "cm",
  hip: "cm",
  arm_circumference: "cm",
});

const vitalUnits = Object.freeze({
  blood_pressure_systolic: "mmHg",
  blood_pressure_diastolic: "mmHg",
  heart_rate: "bpm",
  temperature: "°C",
  oxygen_saturation: "%",
});

const anthropometricSchema = z.object({
  type: z.enum(Object.keys(anthropometricUnits)),
  value: z.number().finite().positive().max(1000),
  unit: z.string().trim().min(1).max(30),
  side: z.enum(["left", "right", "midline"]).nullable().optional().default(null),
  method: z.string().trim().max(160).nullable().optional().default(null),
  equipment: z.string().trim().max(160).nullable().optional().default(null),
}).superRefine((value, context) => {
  const expected = anthropometricUnits[value.type];
  if (value.unit !== expected) {
    context.addIssue({
      code: "custom",
      path: ["unit"],
      message: `${value.type} debe registrarse en ${expected}.`,
    });
  }
});

const vitalSignSchema = z.object({
  type: z.enum([...Object.keys(vitalUnits), "custom"]),
  name: z.string().trim().min(2).max(120).nullable().optional().default(null),
  value: z.number().finite(),
  unit: z.string().trim().min(1).max(30),
  method: z.string().trim().max(160).nullable().optional().default(null),
  equipment: z.string().trim().max(160).nullable().optional().default(null),
}).superRefine((value, context) => {
  if (value.type === "custom" && !value.name) {
    context.addIssue({ code: "custom", path: ["name"], message: "El signo configurable requiere nombre." });
  }
  const expected = vitalUnits[value.type];
  if (expected && value.unit !== expected) {
    context.addIssue({
      code: "custom",
      path: ["unit"],
      message: `${value.type} debe registrarse en ${expected}.`,
    });
  }
});

const labResultSchema = z.object({
  parameter: z.string().trim().min(1).max(160),
  result: z.number().finite(),
  unit: z.string().trim().min(1).max(40),
  referenceLow: z.number().finite().nullable().optional().default(null),
  referenceHigh: z.number().finite().nullable().optional().default(null),
  notes: z.string().trim().max(500).nullable().optional().default(null),
}).superRefine((value, context) => {
  if (value.referenceLow !== null && value.referenceHigh !== null && value.referenceLow > value.referenceHigh) {
    context.addIssue({ code: "custom", path: ["referenceLow"], message: "El límite inferior no puede superar al superior." });
  }
});

const labPanelSchema = z.object({
  name: z.string().trim().min(2).max(200),
  laboratory: z.string().trim().max(200).nullable().optional().default(null),
  sampleDate: z.iso.datetime(),
  notes: z.string().trim().max(1000).nullable().optional().default(null),
  results: z.array(labResultSchema).min(1).max(300),
});

const advancedMeasurementSchema = z.object({
  category: z.enum(["circumference", "skinfold", "diameter", "length", "segment"]),
  code: z.string().trim().regex(/^[a-z][a-z0-9_]{1,79}$/),
  value: z.number().finite().positive().max(1000),
  unit: z.enum(["mm", "cm"]),
  side: z.enum(["left", "right", "midline"]).nullable().optional().default(null),
  method: z.string().trim().max(160).nullable().optional().default(null),
  equipment: z.string().trim().max(160).nullable().optional().default(null),
}).superRefine((value, context) => {
  const expected = value.category === "skinfold" ? "mm" : "cm";
  if (value.unit !== expected) {
    context.addIssue({ code: "custom", path: ["unit"], message: `${value.category} debe registrarse en ${expected}.` });
  }
});

const bodyCompositionSchema = z.object({
  indicator: z.enum([
    "body_fat_percent", "fat_mass_kg", "fat_free_mass_kg", "muscle_mass_kg",
    "body_water_percent", "bone_mass_kg", "custom",
  ]),
  name: z.string().trim().min(2).max(160).nullable().optional().default(null),
  value: z.number().finite(),
  unit: z.string().trim().min(1).max(20),
  method: z.string().trim().min(2).max(160),
  equipment: z.string().trim().max(160).nullable().optional().default(null),
  formulaCode: z.string().trim().max(80).nullable().optional().default(null),
  formulaVersion: z.string().trim().max(30).nullable().optional().default(null),
  formulaSource: z.string().trim().max(500).nullable().optional().default(null),
  inputs: z.record(z.string(), z.unknown()).nullable().optional().default(null),
  notes: z.string().trim().max(500).nullable().optional().default(null),
}).superRefine((value, context) => {
  if (value.indicator === "custom" && !value.name) {
    context.addIssue({ code: "custom", path: ["name"], message: "El indicador personalizado requiere nombre." });
  }
  if ((value.formulaCode || value.formulaVersion) && !(value.formulaCode && value.formulaVersion && value.formulaSource && value.inputs)) {
    context.addIssue({ code: "custom", path: ["formulaCode"], message: "Una fórmula requiere código, versión, fuente e inputs." });
  }
});

export const recordInput = z.object({
  patientId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  recordedAt: z.iso.datetime().optional(),
  method: z.string().trim().max(160).nullable().optional().default(null),
  equipment: z.string().trim().max(160).nullable().optional().default(null),
  protocol: z.string().trim().max(160).nullable().optional().default(null),
  notes: z.string().trim().max(1000).nullable().optional().default(null),
  measurements: z.array(anthropometricSchema).max(100).optional().default([]),
  advancedMeasurements: z.array(advancedMeasurementSchema).max(150).optional().default([]),
  bodyComposition: z.array(bodyCompositionSchema).max(50).optional().default([]),
  vitalSigns: z.array(vitalSignSchema).max(100).optional().default([]),
  labPanels: z.array(labPanelSchema).max(30).optional().default([]),
}).superRefine((value, context) => {
  if (!value.measurements.length && !value.advancedMeasurements.length
      && !value.bodyComposition.length && !value.vitalSigns.length && !value.labPanels.length) {
    context.addIssue({ code: "custom", message: "La sesión debe contener al menos una medición." });
  }
  const duplicate = value.measurements.find((item, index, all) =>
    all.findIndex((candidate) => candidate.type === item.type && candidate.side === item.side) !== index);
  if (duplicate) {
    context.addIssue({ code: "custom", path: ["measurements"], message: `La medición ${duplicate.type} está duplicada.` });
  }
  const advancedDuplicate = value.advancedMeasurements.find((item, index, all) =>
    all.findIndex((candidate) => candidate.category === item.category
      && candidate.code === item.code && candidate.side === item.side) !== index);
  if (advancedDuplicate) {
    context.addIssue({ code: "custom", path: ["advancedMeasurements"], message: "La medición avanzada está duplicada." });
  }
});

export const legacyMeasurementInput = z.object({
  patientId: z.string().uuid(),
  legacyKey: z.string().trim().min(1).max(160),
  weightKg: z.number().positive().max(1000).nullable().optional().default(null),
  heightCm: z.number().positive().max(300).nullable().optional().default(null),
  recordedAt: z.iso.datetime().nullable().optional().default(null),
  source: z.string().trim().min(2).max(120).optional().default("patients-db"),
}).refine((value) => value.weightKg !== null || value.heightCm !== null, {
  message: "Se requiere peso o altura.",
});

export function calculateDerivedMeasurements(measurements) {
  const byType = Object.fromEntries(measurements.map((item) => [item.type, item.value]));
  const calculations = [];
  if (byType.weight && byType.height) {
    const result = byType.weight / ((byType.height / 100) ** 2);
    calculations.push({
      formulaCode: "BMI",
      formulaVersion: "1.0.0",
      inputs: { weightKg: byType.weight, heightCm: byType.height },
      result: Number(result.toFixed(2)),
      unit: "kg/m2",
      rounding: 2,
    });
  }
  if (byType.waist && byType.hip) {
    const result = byType.waist / byType.hip;
    calculations.push({
      formulaCode: "WAIST_HIP_RATIO",
      formulaVersion: "1.0.0",
      inputs: { waistCm: byType.waist, hipCm: byType.hip },
      result: Number(result.toFixed(3)),
      unit: "ratio",
      rounding: 3,
    });
  }
  return calculations;
}

export function compareValues(rows) {
  return rows.map((row) => {
    const absoluteChange = Number((row.currentValue - row.initialValue).toFixed(6));
    const percentageChange = row.initialValue === 0
      ? null
      : Number(((absoluteChange / row.initialValue) * 100).toFixed(2));
    return {
      metric: row.metric,
      unit: row.unit,
      initial: { value: row.initialValue, recordedAt: row.initialAt, sessionId: row.initialSessionId },
      current: { value: row.currentValue, recordedAt: row.currentAt, sessionId: row.currentSessionId },
      absoluteChange,
      percentageChange,
      direction: absoluteChange > 0 ? "increase" : absoluteChange < 0 ? "decrease" : "unchanged",
    };
  });
}

export const evaluatorInput = z.object({
  displayName: z.string().trim().min(2).max(200),
  isakLevel: z.union([z.literal(1), z.literal(2)]),
  accreditationCode: z.string().trim().min(2).max(100),
});

export const sportAssessmentInput = z.object({
  patientId: z.string().uuid(),
  evaluatorId: z.string().uuid(),
  protocolCode: z.enum(["ISAK_1", "ISAK_2"]),
  sport: z.string().trim().min(2).max(120),
  trainingPhase: z.string().trim().max(120).nullable().optional().default(null),
  assessedAt: z.iso.datetime({ offset: true }),
  notes: z.string().trim().max(1000).nullable().optional().default(null),
  ageYears: z.number().int().min(15).max(100),
  sex: z.enum(["male", "female"]),
  measurements: z.array(z.object({
    category: z.enum(["skinfold", "diameter", "length", "circumference"]),
    code: z.string().trim().min(2).max(80),
    value: z.number().positive().max(1000),
    unit: z.enum(["mm", "cm"]),
    side: z.enum(["left", "right", "midline"]),
    equipment: z.string().trim().min(2).max(160),
  })).min(1).max(100),
  hydration: z.object({
    preWeightKg: z.number().positive(),
    postWeightKg: z.number().positive(),
    fluidIntakeLiters: z.number().min(0),
    urineLiters: z.number().min(0).default(0),
    durationMinutes: z.number().positive().max(1440),
  }).nullable().optional().default(null),
}).superRefine((value, context) => {
  const duplicate = value.measurements.find((item, index, all) =>
    all.findIndex((candidate) => candidate.category === item.category
      && candidate.code === item.code && candidate.side === item.side) !== index);
  if (duplicate) context.addIssue({ code: "custom", path: ["measurements"], message: "La medición deportiva está duplicada." });
  for (const measurement of value.measurements) {
    const expected = measurement.category === "skinfold" ? "mm" : "cm";
    if (measurement.unit !== expected) {
      context.addIssue({ code: "custom", path: ["measurements"], message: `${measurement.category} debe expresarse en ${expected}.` });
    }
  }
});

export function calculateSport(input) {
  const calculations = [];
  const skinfolds = Object.fromEntries(input.measurements
    .filter((item) => item.category === "skinfold")
    .map((item) => [item.code, item.value]));
  const required = input.sex === "male" ? ["chest", "abdomen", "thigh"] : ["triceps", "suprailiac", "thigh"];
  if (required.every((code) => skinfolds[code])) {
    const sum = required.reduce((total, code) => total + skinfolds[code], 0);
    const density = input.sex === "male"
      ? 1.10938 - 0.0008267 * sum + 0.0000016 * sum ** 2 - 0.0002574 * input.ageYears
      : 1.0994921 - 0.0009929 * sum + 0.0000023 * sum ** 2 - 0.0001392 * input.ageYears;
    calculations.push({
      formulaCode: input.sex === "male" ? "JACKSON_POLLOCK_3_MALE" : "JACKSON_POLLOCK_3_FEMALE",
      formulaVersion: "1.0.0",
      source: "Jackson AS, Pollock ML; Siri WE body density conversion.",
      inputs: { ageYears: input.ageYears, sex: input.sex, sites: required, sumSkinfoldsMm: sum },
      result: Number((495 / density - 450).toFixed(2)),
      unit: "%",
      rounding: 2,
      validationStatus: "reference_implementation",
    });
  }
  if (input.hydration) {
    const weightLoss = input.hydration.preWeightKg - input.hydration.postWeightKg;
    const sweatLoss = Math.max(0, weightLoss + input.hydration.fluidIntakeLiters - input.hydration.urineLiters);
    const sweatRate = sweatLoss / (input.hydration.durationMinutes / 60);
    calculations.push({
      formulaCode: "SWEAT_RATE",
      formulaVersion: "1.0.0",
      source: "ACSM exercise hydration assessment by body-mass change and fluid balance.",
      inputs: input.hydration,
      result: Number(sweatRate.toFixed(3)),
      unit: "L/h",
      rounding: 3,
      validationStatus: "reference_implementation",
    });
  }
  return calculations;
}

export const resource = Object.freeze({
  label: "sesión de medición",
  path: "/v1/measurement-sessions",
  eventPrefix: "measurements",
});
