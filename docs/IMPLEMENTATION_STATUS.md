# Estado de implementación

## Fase 2 — pruebas integrales

- PostgreSQL 17 real con doce bases aisladas para contratos de persistencia.
- Verificación de transacciones, rollback, JSONB, versión optimista y aislamiento entre dominios.
- Playwright con Chromium para autenticación, recuperación, pacientes y recorridos clínicos completos.
- Evidencias automáticas en `playwright-report` y `test-results` cuando una prueba falla.
- Trabajos separados de GitHub Actions para validación estática, PostgreSQL y E2E.
- El runtime operativo conserva temporalmente SQL Server; la migración de adaptadores y datos a PostgreSQL queda explícita como trabajo posterior.

Fecha de referencia: 25 de septiembre de 2026.

Esta tabla distingue infraestructura operativa de funciones clínicas terminadas. Que un
servicio arranque no significa que su dominio completo ya esté implementado.

| Fase | Estado | Implementado | Pendiente principal |
| --- | --- | --- | --- |
| 0. Base técnica | En progreso avanzado | Docker Compose, 12 APIs, bases separadas, health checks, migraciones ejecutables como job, 12 contratos OpenAPI validados en CI, pruebas y BFF | Completar la transición de APIs existentes a TypeScript |
| 1. Identidad | Completa | Organizaciones, miembros, invitaciones, roles, selector, aislamiento, RSA/JWKS, validación local, renovación rotatoria, recuperación de contraseña y auditoría de acceso | Endurecimiento adicional dentro de la fase de producción |
| 2. Membresías | Completa | Planes Básica/Pro/Sport, prueba automática, derechos, cuotas, consumo atómico, cambio, cancelación, reactivación, historial y eventos; derechos aplicados por API en Nutrición, Planificación, Mediciones, Notificaciones y Documentos | Integrar cobro y precios cuando se elija proveedor comercial |
| 3. Pacientes | Completa | Ficha administrativa, contactos, emergencia, foto, etiquetas, consentimientos, asignaciones, búsqueda, filtros, cursor, duplicados, historial, eventos y borrado lógico | Extensiones futuras de producto; los datos clínicos ya fueron retirados de Patients DB |
| 4. Clínica | Completa | Historia normalizada, tipos de consulta, antecedentes, problemas, síntomas, cirugías, medicamentos, suplementos, diagnósticos, objetivos, seguimientos, publicación inmutable, correcciones, migración heredada y línea de tiempo | Integraciones de mediciones/nutrición se amplían en sus fases propietarias |
| 5. Mediciones | Completa | Sesiones inmutables, antropometría básica y avanzada, composición corporal con método/equipo/fórmula, signos vitales, laboratorios, IMC, índice cintura/cadera, derecho PRO, importación heredada y comparación inicial/actual | Las nuevas fórmulas deben agregarse con fuente, versión y validación profesional |
| 6. Catálogos | En progreso avanzado | Nutrientes, alimentos, porciones, medidas caseras, recetas calculadas con snapshots versionados, etiquetas, copias profesionales, recomendaciones, educación y migración heredada | Seleccionar, licenciar e importar la fuente del catálogo global de alimentos |
| 7. Nutrición | Completa | Estilo de vida, evaluación dietética, recordatorio 24 h, frecuencia PRO, análisis de energía/macros/fibra/micronutrientes, snapshots versionados, publicación y derecho aplicado por API | Indicadores nuevos se añaden de forma versionada |
| 8. Planificación | Completa | Fórmula Mifflin-St Jeor versionada, GET y efecto térmico, macros, objetivos nutricionales, distribución por comidas, restricciones duras, menús con snapshots de alimentos/recetas, adecuación diaria, publicación inmutable, eventos y aislamiento | Nuevas fórmulas y automatizaciones se incorporarán en Pro/Sport |
| 9. Reporting | Completa | Consumidor RabbitMQ, inbox idempotente, métricas diarias para gráficos, línea de tiempo y estado por dominio del paciente, aislamiento y reconstrucción de proyecciones | Nuevos indicadores se agregan junto con cada módulo funcional |
| 10. Agenda/notificaciones | Completa | Disponibilidad semanal y excepciones, conflictos, agenda, transiciones e historial; ocho tipos de reglas configurables, preferencias multicanal, consumidor de citas, despachador, reintentos, intentos auditados y cola de fallos | Integrar credenciales de proveedores externos en producción |
| 11. Documentos | Completa | Plantillas por organización, generación PDF asíncrona, almacenamiento aislado, SHA-256, tamaño/tipo, autorización y URLs temporales; render visual verificado | Integrar almacenamiento de objetos administrado para producción |
| 12. Pro | Completa | Derecho y cuota aplicados, generador seguro, adecuación, sustituciones por similitud, lista de compras, ejecución auditada y revisión profesional obligatoria antes de publicar | Ampliar la biblioteca conforme se licencien nuevas fuentes |
| 13. Sport | En progreso avanzado | Derecho Sport, ISAK 1/2, evaluador/acreditación, pliegues, diámetros, longitudes, perímetros, equipo/lado, composición corporal, tasa de sudoración, comparación y generador pre/intra/post | Definir ISAK 3 y aprobar casos de referencia con un profesional acreditado |
| 14. Producción | En progreso avanzado | Imágenes Docker, CI, validación de contratos, prueba concurrente de salud, respaldo con checksum, simulacro de restauración y runbook de seguridad | Ejecutar en infraestructura elegida TLS, gestor de secretos, observabilidad y una prueba de carga autenticada |

## Verificación local

```powershell
docker compose --profile full up -d --build
./scripts/migrate-databases.ps1
python scripts/validate-openapi.py
node scripts/test-services.mjs
node scripts/smoke-health-load.mjs
node scripts/smoke-platform.mjs
node scripts/smoke-organizations.mjs
node scripts/smoke-subscriptions.mjs
node scripts/smoke-patients.mjs
node scripts/smoke-clinical.mjs
node scripts/smoke-measurements.mjs
node scripts/smoke-catalogs.mjs
node scripts/smoke-nutrition.mjs
node scripts/smoke-planning.mjs
node scripts/smoke-reporting.mjs
node scripts/smoke-scheduling.mjs
node scripts/smoke-notifications.mjs
node scripts/smoke-documents.mjs
node scripts/smoke-pro.mjs
node scripts/smoke-sport.mjs
node scripts/smoke-identity-outage.mjs
./scripts/backup-databases.ps1
./scripts/restore-drill.ps1 -BackupDirectory ./backups/AAAAMMDD-HHMMSS
```

Las pruebas de humo comprueban los doce servicios, aislamiento entre organizaciones,
invitaciones y roles, cuotas de membresía, ficha administrativa, dominios clínicos,
evaluación nutricional, planificación reproducible y autorización durante una caída de
Identity. La cobertura del documento funcional está trazada en
[`REQUIREMENTS_TRACEABILITY.md`](./REQUIREMENTS_TRACEABILITY.md).

La web incluye navegación para todos los dominios, indicadores operativos en el
dashboard y una vista de atención integral por paciente. Las operaciones clínicas
especializadas continúan disponibles por el BFF versionado mientras se amplían sus
formularios dedicados.

# Fase 3: seguridad

- Matriz RBAC para administrador, nutricionista, asistente y paciente con alcance por `patientId`.
- Límites de solicitudes por IP y usuario en el gateway.
- Firma HMAC, caducidad y protección contra repetición para comunicaciones internas.
- Secretos locales generados fuera de Docker Compose y puertos internos ligados a localhost.
- Auditoría de accesos de identidad y de lecturas/modificaciones clínicas.
- Expiración configurable, revocación, rotación y detección de reutilización de sesiones.
- Auditoría de dependencias, Trivy y CodeQL en GitHub Actions.

# Fase 4: API Gateway

- Punto de entrada único en el puerto 4080 para las doce APIs internas.
- Rutas públicas versionadas bajo `/api/v1/{modulo}`.
- Autenticación, autorización por rol, CORS y límites de solicitudes centralizados.
- Reintentos de lecturas, tiempos máximos y circuit breaker por servicio.
- Identificadores de correlación propagados de extremo a extremo.
- Frontends, Playwright y pruebas de humo conectados exclusivamente al gateway.

# Fase 5: monitoreo

- Trazas OpenTelemetry con propagación W3C desde el gateway y almacenamiento en Tempo.
- Registros JSON centralizados en Loki mediante descubrimiento de contenedores con Grafana Alloy.
- Métricas de tráfico, errores, latencia, disponibilidad, bases y RabbitMQ en Prometheus.
- Dashboard operativo provisionado automáticamente en Grafana.
- Alertmanager y reglas para APIs, bases, latencia, errores, circuitos y colas pendientes.

# Fase 6: protección de datos

- Respaldo completo automatizado de las doce bases con checksum.
- Cifrado autenticado AES-256-GCM, hashes SHA-256 y manifiesto firmado con HMAC-SHA256.
- Simulacro semanal que descifra, ejecuta `RESTORE VERIFYONLY`, restaura y valida con `DBCC CHECKDB`.
- Retención GFS configurable: 14 días, 8 semanas y 12 meses de forma predeterminada.
- Índices orientados a las consultas habituales de cada dominio.
- Migraciones `up/down` transaccionales y reversión centralizada para los doce servicios.
