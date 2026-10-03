# Fase 8: funciones nutricionales avanzadas

La fase usa los servicios existentes como fuente única de reglas clínicas. El frontend calcula una vista previa con las mismas fórmulas y las APIs vuelven a validar y guardar los resultados trazables.

## Funciones entregadas

- **Cálculos:** IMC, TMB por Mifflin–St Jeor, actividad, efecto térmico, gasto total y gramos de carbohidratos, proteína y grasa.
- **Comparación:** primer y último valor, cambio absoluto y porcentual para antropometría, fórmulas y composición corporal.
- **Objetivos:** metas con valor, unidad y fecha; seguimientos con adherencia, dificultades y próximos pasos.
- **Planes:** generación con varios alimentos candidatos, restricciones, distribución energética y consulta de versiones publicadas inmutables.
- **Sustituciones:** ranking por similitud nutricional que descarta alimentos o recetas incompatibles con alergias, intolerancias, exclusiones y contraindicaciones.
- **PDF:** plantillas con nombre, color institucional y pie de página; generación asíncrona, hash SHA-256 y enlace temporal.
- **Portal del paciente:** ruta `/mi-portal`, menú propio y consultas limitadas al `patientId` vinculado a la sesión.

## Contratos principales

| Función | API |
| --- | --- |
| Comparación | `GET /api/v1/measurements/patients/{id}/measurements/comparison` |
| Objetivos | `GET/POST /api/v1/clinical/consultations/{id}/goals` |
| Seguimientos | `GET/POST /api/v1/clinical/consultations/{id}/follow-ups` |
| Generar plan | `POST /api/v1/planning/meal-plans/generate` |
| Versiones | `GET /api/v1/planning/meal-plans/{id}/versions` |
| Sustituciones | `POST /api/v1/planning/substitutions/evaluate` |
| Plantillas PDF | `GET/POST /api/v1/documents/templates` |
| Generar PDF | `POST /api/v1/documents/generated-documents` |

## Validación

`npm run verify:advanced-nutrition` comprueba que cada capacidad tenga interfaz y conexión con su contrato. La CI también ejecuta TypeScript, compilación de producción y pruebas de servicios. Las pruebas de planificación verifican la exclusión por alergias; las de documentos verifican que un paciente no pueda crear un enlace para un PDF ajeno.
