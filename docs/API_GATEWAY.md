# API Gateway

El gateway de NUTRIMEJOR es el único punto de entrada HTTP para las doce APIs. Se
publica en `http://localhost:4080`; los contenedores de dominio permanecen en la red
interna de Docker sin puertos publicados en el host.

## Rutas

Todas las rutas públicas de dominio usan el prefijo `/api/v1/{modulo}`. El gateway
traduce ese prefijo al contrato interno existente:

| Ruta pública | Destino interno |
| --- | --- |
| `/api/v1/identity/sessions` | `identity-api:4001/v1/sessions` |
| `/api/v1/patients` | `patients-api:4002/v1/patients` |
| `/api/v1/catalogs/foods` | `catalogs-api:4003/v1/foods` |
| `/api/v1/clinical/consultations` | `clinical-api:4005/v1/consultations` |

`GET /health` comprueba el proceso del gateway. `GET /health/ready` consulta los doce
servicios y devuelve `200` solamente cuando todos están listos. Para diagnóstico de un
módulo se usa `GET /api/v1/{modulo}/_health/ready`.

## Controles centralizados

- Valida JWT RS256 mediante el JWKS de Identity y aplica la matriz de permisos por rol.
- Aplica CORS con una lista explícita de orígenes.
- Limita intentos sensibles por IP y tráfico general por IP y usuario.
- Firma cada llamada interna con HMAC y conserva la validación propia de cada API.
- Reintenta solamente lecturas idempotentes ante `502`, `503`, `504` o errores de red.
- Interrumpe cada intento al superar el tiempo configurado y abre el circuito después
  de fallos consecutivos.
- Acepta o genera `x-correlation-id`, lo propaga a la API y lo devuelve al cliente.

Los parámetros se configuran con `GATEWAY_TIMEOUT_MS`, `GATEWAY_RETRIES`,
`CIRCUIT_FAILURE_THRESHOLD`, `CIRCUIT_OPEN_MS` y `CORS_ALLOWED_ORIGINS`. La clave HMAC
se carga desde `.env` y no está escrita en `docker-compose.yml`.

## Comportamiento ante fallos

El gateway responde con códigos estables: `401` para una sesión inválida, `403` para
un rol sin permiso, `429` por límite excedido, `502` si no puede conectar, `503` si el
circuito está abierto y `504` cuando vence el tiempo máximo. El cuerpo incluye un
`code` legible por máquina y la respuesta siempre contiene el identificador de
correlación.
