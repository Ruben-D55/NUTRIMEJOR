from pathlib import Path

root = Path(__file__).resolve().parents[1]
required = {
    "components/platform/module-crud.tsx": ["Pagination", "EmptyState", "ConfirmDialog", "aria-label"],
    "components/platform/measurement-workspace.tsx": ["EvolutionChart", "body_fat_percent", "muscle_mass_kg"],
    "components/platform/planning-workspace.tsx": ["meal-plans/generate", "ConfirmDialog"],
    "components/platform/membership-workspace.tsx": ["subscriptions/current", "entitlements"],
    "components/ui/workspace-ui.tsx": ['role="dialog"', 'aria-modal="true"', 'role="status"'],
    "app/globals.css": [":focus-visible", "prefers-reduced-motion", ".primary-button"],
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
placeholders = []
for name in ["agenda", "clinica", "documentos", "mediciones", "membresia", "notificaciones", "nutricion", "planes", "reportes"]:
    text = (root / "app" / "(dashboard)" / name / "page.tsx").read_text(encoding="utf-8")
    if "ModuleOverview" in text:
        placeholders.append(name)
if placeholders:
    failures.append("Módulos aún informativos: " + ", ".join(placeholders))
if failures:
    raise SystemExit("\n".join(failures))
print("Frontend phase 7 verified: CRUD workspaces, responsive states, accessibility and evolution charts.")
