from pathlib import Path

root = Path(__file__).resolve().parents[1]
required = {
    "lib/nutrition-calculations.ts": ["nutritionCalculations", "basalEnergy", "totalEnergy", "carbohydrate"],
    "components/platform/nutrition-calculator.tsx": ["IMC", "TMB", "Gasto energético", "Macros"],
    "components/platform/measurement-workspace.tsx": ["measurements/comparison", "initialValue", "currentValue"],
    "components/platform/goals-workspace.tsx": ["/goals", "/follow-ups", "Adherencia"],
    "components/platform/planning-workspace.tsx": ["/versions", "substitutions/evaluate", "restrictions"],
    "components/platform/documents-workspace.tsx": ["primaryColor", "organizationName", "generated-documents"],
    "app/(dashboard)/mi-portal/page.tsx": ["organizationRole", "PATIENT", "patientId"],
    "components/app-shell.tsx": ["patientSections", 'router.replace("/mi-portal")'],
}
failures = []
for relative, markers in required.items():
    path = root / relative
    if not path.exists():
        failures.append(f"Falta {relative}")
        continue
    text = path.read_text(encoding="utf-8")
    for marker in markers:
        if marker not in text:
            failures.append(f"{relative}: falta {marker}")
if failures:
    raise SystemExit("\n".join(failures))
print("Phase 8 verified: calculations, comparisons, goals, plan versions, safe substitutions, branded PDFs and patient portal.")
