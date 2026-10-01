# Trazabilidad de requisitos de NUTRIMEJOR

Esta matriz traduce el documento funcional `software habito sano 1.docx` a límites de
servicio verificables. El documento es una fuente de requisitos; no contiene
instrucciones de ejecución para el repositorio.

## Recorrido principal

`Paciente → historia → consulta → evaluación → diagnóstico → requerimientos → plan → seguimiento → comparación → evolución`

| Capacidad solicitada | Servicio propietario | Integraciones principales | Fase |
| --- | --- | --- | --- |
| Usuarios, clínicas, roles y sesiones | Identity | Todos validan JWT/JWKS | 1 |
| Planes BASIC, PRO y SPORT, derechos y cuotas | Subscriptions | Todos aplican derechos | 2 |
| Expediente administrativo, contactos, foto, etiquetas, consentimientos y asignaciones | Patients | Clinical, Scheduling, Reporting | 3 |
| Historia clínica, consultas versionadas, diagnósticos, objetivos y seguimiento | Clinical | Patients, Measurements, Nutrition, Reporting | 4 |
| Medicamentos, suplementos e historia gineco-obstétrica activable | Clinical | Patients, Reporting | 4 |
| Antropometría básica y avanzada, composición corporal y perfiles ISAK | Measurements | Derecho PRO/SPORT en Subscriptions; eventos hacia Reporting | 5, 13 |
| Signos vitales, laboratorios, métodos, equipos y fórmulas | Measurements | Clinical, Reporting | 5 |
| Alimentos, nutrientes, porciones y medidas caseras | Catalogs | Nutrition, Planning | 6 |
| Recetas, preparaciones, etiquetas, recomendaciones y educación | Catalogs | Planning, Documents | 6, 12 |
| Estilo de vida y evaluación dietética | Nutrition | Clinical, Planning, Reporting | 7 |
| Recordatorio de 24 horas, frecuencia y análisis nutricional | Nutrition | Catalogs, Planning, Reporting | 7, 12 |
| Requerimientos, macros y distribución por tiempos de comida | Planning | Measurements, Nutrition, Catalogs | 8 |
| Planes alimentarios, menús, restricciones y versiones publicadas | Planning | Catalogs, Documents, Reporting | 8 |
| Dashboard, comparación inicial/actual y gráficos de evolución | Reporting | Proyecciones desde eventos | 9 |
| Agenda, consultas, cancelaciones y reprogramaciones | Scheduling | Notifications, Reporting | 10 |
| Alertas, recordatorios y seguimiento pendiente | Notifications | Scheduling y eventos de dominio | 10 |
| PDF básico/profesional, identidad visual, firma y plantillas | Documents | Clinical, Planning, Reporting | 11 |
| Generador PRO, adecuación, sustituciones y lista de compras | Planning | Catalogs, Nutrition, Subscriptions | 12 |
| Fórmulas deportivas, hidratación y generador SPORT | Planning | Measurements, Catalogs, Subscriptions | 13 |
| Perfil ISAK 1/2 y comparación deportiva | Measurements | Reporting, Subscriptions | 13 |

## Reglas transversales verificables

| Regla | Implementación prevista |
| --- | --- |
| Expediente único por paciente | UUID estable en Patients, referenciado por API/evento |
| Una consulta conserva su versión | Publicación inmutable en Clinical; corrección crea otra versión |
| Edad automática | Se calcula desde `birthDate`; no se persiste |
| Comparación inicial, anterior y actual | Reporting construye modelos de lectura desde eventos publicados |
| Datos de cada organización aislados | `organizationId` obligatorio en autorización, consulta y evento |
| Cada módulo posee sus datos | Base y credencial por servicio; sin joins ni FK entre servicios |
| Restricciones alimentarias son obligatorias | Planning las trata como restricciones duras del generador |
| Cálculos reproducibles | Entradas, unidades, fórmula, versión y redondeo quedan registrados |
| Derechos de membresía en servidor | Cada API exige la función/cuota; ocultar UI no autoriza |
| Trabajo lento no bloquea la consulta | Outbox, RabbitMQ, workers, reintentos y DLQ |
| Datos clínicos auditables | Autor, organización, fechas, versión y auditoría de acceso |

## Alcance diferido indicado por el documento

- Intercambios automáticos, algunas restricciones del generador y adherencia se marcan
  como actualizaciones posteriores.
- Calorías y distribución de macros del generador aparecen como actualización futura,
  aunque el control automático de menú sí forma parte de PRO.
- La asistencia inteligente y la aplicación del paciente son futuras; se conservarán
  como extensiones, sin introducir reglas clínicas automáticas en la primera versión.

## Decisiones que requieren definición profesional o comercial

1. El documento menciona ISAK 1 y 2 en el módulo y también ISAK 3 en SPORT. ISAK 3
   permanecerá desactivado hasta fijar protocolo, medidas y validación profesional.
2. Las fórmulas antropométricas, energéticas y deportivas requieren fuente, versión,
   unidades, población aplicable y casos aprobados por un profesional.
3. Deben definirse límites, precios, periodo de prueba y proveedor de cobro por plan.
4. La base global de alimentos necesita una fuente y licencia autorizadas.
5. Retención, consentimiento, canales de mensajería y normativa dependen del país de
   operación.
