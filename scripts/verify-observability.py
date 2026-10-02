from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
STACK = {
    "prometheus",
    "alertmanager",
    "blackbox-exporter",
    "loki",
    "alloy",
    "tempo",
    "otel-collector",
    "grafana",
}
ALERTS = {
    "ApiGatewayDown",
    "ApiUnavailable",
    "DatabaseUnavailable",
    "HighApiLatency",
    "RepeatedServerErrors",
    "UpstreamCircuitOpen",
    "RabbitMqQueueBacklog",
    "RabbitMqUnacknowledgedMessages",
    "OpenTelemetryExportFailures",
}


def main() -> int:
    errors: list[str] = []
    compose = yaml.safe_load((ROOT / "docker-compose.yml").read_text(encoding="utf-8"))
    services = compose.get("services", {})
    for name in STACK:
        service = services.get(name)
        if not service:
            errors.append(f"Falta el servicio de observabilidad {name}")
            continue
        if "monitoring" not in service.get("profiles", []):
            errors.append(f"{name}: debe pertenecer al perfil monitoring")
        image = service.get("image", "")
        if not image or image.endswith(":latest"):
            errors.append(f"{name}: la imagen debe tener una versión fija")

    gateway = services.get("api-gateway", {})
    if gateway.get("environment", {}).get("OTEL_EXPORTER_OTLP_ENDPOINT") != "http://otel-collector:4318":
        errors.append("api-gateway: OTEL_EXPORTER_OTLP_ENDPOINT no apunta al collector")

    prometheus = yaml.safe_load((ROOT / "observability/prometheus/prometheus.yml").read_text(encoding="utf-8"))
    jobs = {item.get("job_name") for item in prometheus.get("scrape_configs", [])}
    for expected in {"api-gateway", "api-readiness", "database-connectivity", "rabbitmq", "otel-collector"}:
        if expected not in jobs:
            errors.append(f"Prometheus: falta el scrape job {expected}")

    rules = yaml.safe_load((ROOT / "observability/prometheus/alerts.yml").read_text(encoding="utf-8"))
    configured = {
        rule.get("alert")
        for group in rules.get("groups", [])
        for rule in group.get("rules", [])
        if rule.get("alert")
    }
    for missing in sorted(ALERTS - configured):
        errors.append(f"Prometheus: falta la alerta {missing}")

    collector = yaml.safe_load((ROOT / "observability/otel-collector/config.yml").read_text(encoding="utf-8"))
    traces = collector.get("service", {}).get("pipelines", {}).get("traces", {})
    if "otlp" not in traces.get("receivers", []) or "otlp/tempo" not in traces.get("exporters", []):
        errors.append("OpenTelemetry Collector: pipeline OTLP hacia Tempo incompleto")

    dashboard = json.loads((ROOT / "observability/grafana/dashboards/nutrimejor-overview.json").read_text(encoding="utf-8"))
    if len(dashboard.get("panels", [])) < 6:
        errors.append("Grafana: el dashboard operativo debe contener al menos seis paneles")

    if errors:
        for error in errors:
            print(f"ERROR {error}", file=sys.stderr)
        return 1
    print(f"Observability verified: {len(STACK)} services, {len(ALERTS)} alert rules, dashboard provisioned.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
