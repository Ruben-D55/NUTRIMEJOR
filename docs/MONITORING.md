# Monitoreo y observabilidad

NUTRIMEJOR incorpora un entorno local de observabilidad basado en estándares abiertos:

- OpenTelemetry Collector recibe trazas OTLP del API Gateway y las exporta a Tempo.
- Prometheus obtiene métricas del gateway, RabbitMQ y sondas de disponibilidad.
- Blackbox Exporter comprueba las doce APIs y la conectividad TCP de las bases.
- Grafana Alloy descubre los contenedores del proyecto y envía sus registros a Loki.
- Grafana presenta métricas, registros y trazas en el panel `NUTRIMEJOR — Operaciones`.
- Alertmanager agrupa y expone las alertas activas generadas por Prometheus.

## Inicio

La primera ejecución genera una contraseña aleatoria de Grafana en `.env`:

```powershell
node scripts/setup-local-env.mjs
docker compose --profile full up -d --build --wait
```

Servicios de operación:

| Servicio | Dirección local |
| --- | --- |
| Grafana | `http://localhost:3001` |
| Prometheus | `http://localhost:9090` |
| Alertmanager | `http://localhost:9093` |
| Métricas del gateway | `http://localhost:4080/metrics` |

El usuario de Grafana es `admin`; la contraseña se encuentra en la variable
`GRAFANA_ADMIN_PASSWORD` del archivo local `.env`. No debe copiarse al repositorio.

## Señales recopiladas

El gateway publica contadores HTTP, histogramas de latencia, fallos de comunicación y
aperturas del circuit breaker. Cada operación crea una traza W3C con spans para los
intentos hacia APIs internas. El `traceId` se incluye también en el registro JSON para
navegar entre Loki y Tempo desde Grafana.

Las sondas `health/ready` incluyen la conexión real a la base propietaria de cada API.
Blackbox Exporter comprueba además las cuatro instancias SQL para distinguir una API
caída de una base sin conexión. RabbitMQ publica la profundidad de sus colas mediante
su plugin oficial de Prometheus.

## Alertas

Las reglas se encuentran en `observability/prometheus/alerts.yml`:

- `ApiGatewayDown` y `ApiUnavailable`: punto de entrada o API interna caída.
- `DatabaseUnavailable`: instancia SQL sin conexión.
- `HighApiLatency`: latencia p95 superior a dos segundos durante cinco minutos.
- `RepeatedServerErrors`: diez o más errores 5xx en cinco minutos.
- `UpstreamCircuitOpen`: el gateway abrió un circuito por fallos consecutivos.
- `RabbitMqQueueBacklog`: más de cien eventos pendientes durante cinco minutos.
- `RabbitMqUnacknowledgedMessages`: más de cincuenta eventos sin confirmar.
- `OpenTelemetryExportFailures`: trazas que no pudieron llegar a Tempo.

Alertmanager conserva y agrupa las alertas. Para producción se debe añadir al receptor
`nutrimejor-operations` el canal elegido por el equipo, como correo, Slack, Teams o un
gestor de incidentes.

## Retención

Prometheus conserva quince días de métricas. Loki y Tempo conservan siete días de
registros y trazas. Los volúmenes `prometheus_data`, `loki_data`, `tempo_data` y
`grafana_data` mantienen los datos entre reinicios de los contenedores.
