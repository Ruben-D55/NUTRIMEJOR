using Nutrimejor.Web.Models;

namespace Nutrimejor.Web.Services;

public sealed class ModuleRegistry
{
    public IReadOnlyList<ModuleDefinition> All { get; } = new List<ModuleDefinition>
    {
        new("organizations", "Organización y equipo", "Organización", "Administra sedes, miembros, invitaciones y permisos.", "bi-building", "identity", "/v1/organizations", "/v1/organizations", null, null, "{\n  \"name\": \"Nueva organización\"\n}"),
        new("patients", "Pacientes", "Pacientes", "Ficha administrativa, contactos, etiquetas y consentimientos.", "bi-people", "patients", "/v1/patients?limit=100", "/v1/patients", "/v1/patients/{id}", "/v1/patients/{id}", "{\n  \"names\": \"Ana\",\n  \"lastNames\": \"Pérez\",\n  \"documentType\": \"CI\",\n  \"document\": \"123456\",\n  \"birthDate\": \"1990-01-01\",\n  \"sex\": \"Femenino\",\n  \"status\": \"Activo\"\n}"),
        new("catalogs", "Alimentos y recetas", "Catálogos", "Gestiona alimentos, nutrientes, porciones y recetas.", "bi-journal-medical", "catalogs", "/v1/foods", "/v1/foods", "/v1/foods/{id}", null, "{\n  \"name\": \"Alimento personalizado\",\n  \"description\": \"Descripción\",\n  \"source\": \"PROFESSIONAL\"\n}"),
        new("clinical", "Historia clínica", "Clínica", "Consultas, antecedentes, diagnósticos, objetivos y seguimiento.", "bi-clipboard2-pulse", "clinical", "/v1/consultations", "/v1/consultations", "/v1/consultations/{id}", null, "{\n  \"patientId\": \"00000000-0000-0000-0000-000000000000\",\n  \"title\": \"Consulta inicial\",\n  \"data\": {}\n}"),
        new("measurements", "Mediciones", "Mediciones", "Antropometría, signos vitales, laboratorios y composición corporal.", "bi-rulers", "measurements", "/v1/measurement-sessions", "/v1/measurement-sessions", null, null, "{\n  \"patientId\": \"00000000-0000-0000-0000-000000000000\",\n  \"measuredAt\": \"2026-09-25T12:00:00Z\",\n  \"measurements\": []\n}", true),
        new("nutrition", "Evaluación nutricional", "Nutrición", "Hábitos, recordatorio de 24 horas y análisis nutricional.", "bi-apple", "nutrition", "/v1/nutrition-assessments", "/v1/nutrition-assessments", null, null, "{\n  \"patientId\": \"00000000-0000-0000-0000-000000000000\",\n  \"title\": \"Evaluación inicial\",\n  \"lifestyle\": {},\n  \"recall24h\": []\n}", true),
        new("planning", "Planes alimentarios", "Planes", "Calcula requerimientos y genera planes con restricciones.", "bi-calendar2-week", "planning", "/v1/meal-plans", "/v1/meal-plans/generate", null, null, "{\n  \"patientId\": \"00000000-0000-0000-0000-000000000000\",\n  \"targetCalories\": 2000,\n  \"macroPercentages\": { \"protein\": 25, \"carbohydrates\": 50, \"fat\": 25 },\n  \"days\": 7\n}", true),
        new("scheduling", "Agenda", "Agenda", "Disponibilidad, citas, estados y control de conflictos.", "bi-calendar-check", "scheduling", "/v1/appointments", "/v1/appointments", null, null, "{\n  \"patientId\": \"00000000-0000-0000-0000-000000000000\",\n  \"startsAt\": \"2026-09-26T14:00:00Z\",\n  \"endsAt\": \"2026-09-26T15:00:00Z\",\n  \"type\": \"Consulta\"\n}"),
        new("notifications", "Notificaciones", "Notificaciones", "Preferencias, reglas, entregas y reintentos multicanal.", "bi-bell", "notifications", "/v1/notifications", "/v1/notifications", "/v1/notifications/{id}", null, "{\n  \"patientId\": \"00000000-0000-0000-0000-000000000000\",\n  \"channel\": \"EMAIL\",\n  \"subject\": \"Recordatorio\",\n  \"message\": \"Tiene una cita programada\"\n}"),
        new("documents", "Documentos", "Documentos", "Plantillas, generación PDF y acceso temporal seguro.", "bi-file-earmark-pdf", "documents", "/v1/documents", "/v1/documents", "/v1/documents/{id}", null, "{\n  \"patientId\": \"00000000-0000-0000-0000-000000000000\",\n  \"title\": \"Plan nutricional\",\n  \"type\": \"PLAN\",\n  \"data\": {}\n}"),
        new("reporting", "Reportes", "Reportes", "Indicadores, evolución y proyecciones consolidadas.", "bi-bar-chart-line", "reporting", "/v1/report-snapshots", "/v1/report-snapshots", "/v1/report-snapshots/{id}", null, "{\n  \"patientId\": \"00000000-0000-0000-0000-000000000000\",\n  \"type\": \"EVOLUTION\",\n  \"title\": \"Evolución mensual\",\n  \"data\": {}\n}"),
        new("subscriptions", "Membresía", "Membresía", "Planes, derechos, cuotas y ciclo de suscripción.", "bi-stars", "subscriptions", "/v1/plans", null, "/v1/subscriptions/current", null, "{\n  \"planCode\": \"PRO\"\n}")
    };

    public ModuleDefinition? Find(string key) => All.FirstOrDefault(x => x.Key.Equals(key, StringComparison.OrdinalIgnoreCase));
}
