from pathlib import Path

root = Path(__file__).resolve().parents[1]
required = {
    "components/ui/crud-ui.tsx": [
        "CrudPageHeader", "MetricCards", "DataToolbar", "PageSizeSelect",
        "ColumnChooser", "ExportButton", "BulkActionBar", 'role="dialog"',
    ],
    "app/(dashboard)/pacientes/page.tsx": [
        "Fichas incompletas", "ColumnChooser", "ExportButton", "PatientActions",
        "PatientDetail", "md:hidden",
    ],
    "components/patients/patient-form.tsx": [
        "Identificación", "Contacto", "Objetivo y seguimiento", "beforeunload",
        "Hay cambios sin guardar",
    ],
    "components/platform/module-crud.tsx": ["CrudPageHeader", "MetricCards", "Drawer"],
    "components/platform/membership-workspace.tsx": [
        "Beneficios de cada plan", "benefitLimit", "Uso del plan actual", "feature.used",
    ],
    "app/globals.css": [".crud-hero", ".metric-card", ".drawer-panel", ".data-table"],
}

module_files = [
    "components/platform/measurement-workspace.tsx",
    "components/platform/planning-workspace.tsx",
    "components/platform/scheduling-workspace.tsx",
    "components/platform/notifications-workspace.tsx",
    "components/platform/documents-workspace.tsx",
    "components/platform/membership-workspace.tsx",
    "components/catalog/catalog-page.tsx",
    "app/(dashboard)/configuracion/page.tsx",
]

failures = []
for relative, markers in required.items():
    path = root / relative
    if not path.exists():
        failures.append(f"Falta {relative}")
        continue
    contents = path.read_text(encoding="utf-8")
    for marker in markers:
        if marker not in contents:
            failures.append(f"{relative}: falta {marker}")

for relative in module_files:
    contents = (root / relative).read_text(encoding="utf-8")
    if "CrudPageHeader" not in contents:
        failures.append(f"{relative}: no usa el encabezado CRUD común")

if failures:
    raise SystemExit("\n".join(failures))

print("Phase 11 verified: common CRUD layout, responsive patients, accessible drawers and protected forms.")
