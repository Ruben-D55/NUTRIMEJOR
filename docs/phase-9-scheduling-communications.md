# Fase 9: agenda y comunicaciones

## Capacidades

- Las citas generan recordatorios automáticos usando las preferencias activas del paciente.
- La reprogramación valida disponibilidad, conflictos y versión; vuelve la cita a pendiente y reemplaza los recordatorios anteriores.
- La cancelación elimina de la cola los recordatorios todavía pendientes.
- El paciente puede confirmar asistencia o solicitar otra fecha desde `/mi-portal`.
- El correo usa un proveedor HTTP configurable. Si no está configurado, el intento falla de forma visible y entra en la política de reintentos.
- WhatsApp aparece como canal futuro y permanece deshabilitado hasta configurar proveedor y `WHATSAPP_ENABLED=true`.
- Las alertas clínicas permiten definir tipo, condiciones, anticipación y canales.
- Cada notificación muestra estado, número de intentos, mensaje de error e identificador del proveedor.

## Configuración de correo

El servicio `notifications-api` acepta estas variables fuera del repositorio:

- `EMAIL_API_URL`: endpoint HTTP del proveedor.
- `EMAIL_API_KEY`: secreto de autenticación.
- `EMAIL_FROM`: remitente verificado.

El adaptador envía `{ from, to, subject, text }`. La respuesta puede incluir `id` o `messageId`.

## WhatsApp

La interfaz no permite seleccionarlo todavía. Para una integración futura se reservaron `WHATSAPP_API_URL`, `WHATSAPP_API_KEY` y `WHATSAPP_ENABLED`. Activarlo requiere un proveedor aprobado y plantillas transaccionales registradas.

## Validación

`npm run verify:scheduling-communications` comprueba la presencia de los contratos y flujos. Las pruebas de servicios cubren reprogramación por el paciente, estados finales e historial de intentos.
