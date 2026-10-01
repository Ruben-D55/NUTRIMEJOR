# Seguridad y operaciones

## Activos y límites de confianza

Los activos principales son credenciales, datos identificativos, historia clínica,
mediciones, planes, consentimientos, documentos y trazas de auditoría. El navegador no
es confiable; entra por el BFF. Las APIs validan firma, vencimiento, organización, rol y
derecho contratado. Cada servicio confía únicamente en su base y en contratos HTTP o
eventos versionados.

| Amenaza | Control requerido |
| --- | --- |
| Acceso entre organizaciones | `organizationId` derivado del token, filtros obligatorios y pruebas de aislamiento |
| Escalada de rol o plan | autorización en cada caso de uso; derechos consultados con identidad de servicio |
| Robo o repetición de sesión | JWT corto, refresh rotatorio, revocación y auditoría |
| Inyección y carga maliciosa | consultas parametrizadas, Zod, límites de tamaño y tipos permitidos |
| Alteración clínica | publicación inmutable, versiones, autor, fecha, motivo y hash de documentos |
| Suplantación entre servicios | red privada, secreto rotado; mTLS o identidad de carga en producción |
| Mensajes duplicados | outbox en productor e inbox idempotente en consumidor |
| Exposición de PDF | token temporal, autorización previa, vencimiento, hash y almacenamiento privado |
| Pérdida o cifrado de datos | respaldo cifrado, copia fuera de cuenta y simulacros de restauración |
| Abuso de fórmulas o generador | fórmula/version/entradas, restricciones duras y aprobación profesional |

## Secretos y criptografía

Guarda secretos en un KMS o gestor administrado y entrégalos al proceso en tiempo de
ejecución. Rota la clave entre servicios y las credenciales SQL; admite dos versiones
durante la transición. Las claves privadas de Identity no deben ser legibles por otras
APIs. Publica sólo las claves públicas JWKS. Cifra conexiones y almacenamiento, y
separa las claves de cifrado de las copias.

No registres JWT, contraseñas, tokens de descarga, secretos, cuerpos clínicos ni datos
completos del paciente. Usa identificadores técnicos y un correlation ID. Restringe el
acceso a logs y aplica el mismo nivel de retención y auditoría que a los datos sensibles.

## Observabilidad y alertas

Cada servicio debe emitir logs JSON con timestamp UTC, servicio, versión, ambiente,
correlation ID, organización anonimizada, ruta, estado y duración. Las métricas mínimas
son solicitudes, 4xx/5xx, p50/p95/p99, pool SQL, latencia SQL, eventos pendientes,
reintentos, dead-letter, trabajos PDF y espacio disponible.

Alertas mínimas:

- readiness fallando durante cinco minutos o 5xx por encima del umbral acordado;
- p95 sostenido fuera del objetivo de servicio;
- outbox o cola sin disminuir, mensajes en dead-letter y workers detenidos;
- respaldo ausente, checksum inválido o simulacro de restauración fallido;
- intentos de acceso cruzado, refresh reutilizado o cambios anómalos de rol;
- almacenamiento de documentos o bases cerca del límite.

## Respaldo, RPO y RTO

El negocio debe aprobar RPO y RTO antes de producción. Como base inicial, usa respaldo
completo diario, log transaccional cada 15 minutos cuando la edición SQL lo permita y
retención de 35 días, más una copia cifrada en otra cuenta. Ajusta estos valores a la
legislación y contrato aplicables.

El orden de recuperación es Identity, Subscriptions, Patients/Catalogs, dominios
clínicos, Scheduling, Documents, Notifications y Reporting. Reporting se reconstruye
desde eventos. Documents requiere recuperar tanto SQL como objetos y verificar SHA-256.
Después de restaurar, prueba autenticación, aislamiento, lectura clínica, creación de un
registro, publicación, consumo de eventos y descarga autorizada.

## Respuesta a incidentes

1. Declara responsable, severidad, alcance y hora UTC; conserva evidencia.
2. Contén el acceso: revoca sesiones o credenciales, aísla el componente y conserva una
   ruta clínica segura para el personal autorizado.
3. Determina organizaciones, personas, datos y ventanas afectadas mediante auditoría.
4. Corrige la causa, rota secretos, restaura desde una copia verificada y ejecuta las
   pruebas de aislamiento e integridad.
5. Notifica según la jurisdicción y acuerdos aplicables; no se fija aquí un plazo legal
   porque el país y el responsable de tratamiento todavía no están definidos.
6. Documenta cronología, impacto, acciones y controles preventivos.

## Decisiones previas a producción

Falta seleccionar la plataforma de despliegue, gestor de secretos, SQL administrado,
almacenamiento de objetos, observabilidad, proveedores de correo/SMS/WhatsApp, país y
política legal de retención. Estas decisiones cambian adaptadores y configuración, no
los límites de los dominios ni la propiedad de las bases.
