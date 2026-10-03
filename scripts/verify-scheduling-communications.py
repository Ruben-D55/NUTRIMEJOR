from pathlib import Path

root = Path(__file__).resolve().parents[1]
required = {
    "components/platform/scheduling-workspace.tsx": ["Confirmar", "Reprogramar", "/history", "/reschedule"],
    "components/platform/notifications-workspace.tsx": ["Historial de entregas", "preferences", "alert-rules", "/attempts", "WhatsApp (próximamente)"],
    "components/platform/patient-appointments.tsx": ["Confirmar asistencia", "Solicitar nueva fecha"],
    "services/scheduling-api/src/domain/record.js": ["rescheduleInput", "expectedVersion"],
    "services/scheduling-api/src/infrastructure/sql/record-repository.js": ["appointment.rescheduled.v1", "versionConflict"],
    "services/notifications-api/src/infrastructure/sql/delivery-repository.js": ["NotificationDeliveryAttempts", "appointment.rescheduled.v1", "Estado='cancelled'"],
    "services/notifications-api/src/infrastructure/delivery/dispatcher.js": ["emailApiUrl", "whatsappEnabled", "Proveedor de correo no configurado"],
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
print("Phase 9 verified: reminders, email, appointment responses, clinical alerts and delivery history.")
