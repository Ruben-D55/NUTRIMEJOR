# Seguridad de NUTRIMEJOR

## Roles y alcance

| Operación | Administrador | Nutricionista | Asistente | Paciente |
|---|---:|---:|---:|---:|
| Organización, miembros y suscripción | Sí | Lectura | No | No |
| Pacientes y datos administrativos | Sí | Sí | Sí | Solo su ficha, lectura |
| Historia clínica, mediciones y evaluaciones | Sí | Sí | No | Solo sus datos, lectura |
| Planes nutricionales y reportes | Sí | Sí | No | Solo sus datos, lectura |
| Agenda y citas | Sí | Sí | Sí | Sus citas, lectura |
| Catálogos | Sí | Sí | Lectura | Lectura |
| Notificaciones | Sí | Sí | Sí | Solo las propias |
| Plantillas y generación de documentos | Sí | Sí | No | Solo documentos propios terminados |
| Auditoría | Toda la organización | Sus accesos | Sus accesos | Sus accesos |

El rol `PATIENT` siempre incluye un `patientId` en su membresía y en el JWT. Las APIs y el gateway comparan ese identificador antes de permitir acceso a datos personales.

## Sesiones

- Token de acceso RS256: 10 minutos por defecto, configurable entre 5 y 30 minutos.
- Token de renovación: 7 días por defecto, configurable entre 1 y 30 días.
- Cada renovación reemplaza el token anterior. La reutilización de un token revocado invalida toda su familia.
- Cerrar sesión revoca el token de renovación actual; `POST /v1/sessions/revoke-all` revoca todas las sesiones de la organización.
- Cambiar o recuperar la contraseña revoca las sesiones existentes.

## Comunicación interna

Cada llamada entre la web y las APIs, o entre APIs, lleva una firma HMAC-SHA256 sobre la marca de tiempo, un nonce, el método y la ruta. Las firmas vencen en 60 segundos y un nonce no puede utilizarse dos veces. Los puertos de infraestructura y APIs se enlazan únicamente a `127.0.0.1` en desarrollo.

Ejecuta `npm run setup:env` antes de iniciar Docker. Este comando crea `.env`, ignorado por Git, con claves aleatorias. En producción los secretos deben inyectarse desde el gestor de secretos de la plataforma y `EXPOSE_DEVELOPMENT_TOKENS` debe ser `false`.

## Límites y auditoría

El gateway admite 600 solicitudes por IP y 300 por usuario cada minuto, para cubrir la carga de recursos y llamadas de un panel activo. Registro, inicio de sesión y recuperación admiten 12 intentos por IP cada 15 minutos. Una respuesta limitada usa HTTP 429 y `Retry-After`.

Los accesos de identidad se guardan con la IP cifrada mediante SHA-256. La base clínica registra lecturas, modificaciones, usuario, rol, paciente, entidad, resultado y fecha en `ClinicalAuditEvents`.

## Análisis automático

GitHub Actions ejecuta auditoría de npm, revisión de dependencias, Trivy para código, secretos, configuración y todas las imágenes construidas, además de CodeQL para TypeScript/JavaScript y C#.

