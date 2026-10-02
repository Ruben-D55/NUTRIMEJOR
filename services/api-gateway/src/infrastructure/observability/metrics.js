const buckets = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

function labels(values) {
  return Object.entries(values)
    .map(([key, value]) => `${key}="${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`)
    .join(",");
}

export class MetricsRegistry {
  constructor() {
    this.startedAt = Date.now();
    this.requests = new Map();
    this.durations = new Map();
    this.upstreamFailures = new Map();
    this.circuitOpen = new Map();
  }

  observeRequest(method, service, status, seconds) {
    const key = JSON.stringify([method, service, String(status)]);
    this.requests.set(key, (this.requests.get(key) || 0) + 1);
    const durationKey = JSON.stringify([method, service]);
    const current = this.durations.get(durationKey) || { count: 0, sum: 0, buckets: buckets.map(() => 0) };
    current.count += 1;
    current.sum += seconds;
    buckets.forEach((limit, index) => { if (seconds <= limit) current.buckets[index] += 1; });
    this.durations.set(durationKey, current);
  }

  recordUpstreamFailure(service, reason) {
    const key = JSON.stringify([service, reason]);
    this.upstreamFailures.set(key, (this.upstreamFailures.get(key) || 0) + 1);
  }

  recordCircuitOpen(service) {
    this.circuitOpen.set(service, (this.circuitOpen.get(service) || 0) + 1);
  }

  render() {
    const lines = [
      "# HELP nutrimejor_gateway_uptime_seconds Tiempo activo del API Gateway.",
      "# TYPE nutrimejor_gateway_uptime_seconds gauge",
      `nutrimejor_gateway_uptime_seconds ${((Date.now() - this.startedAt) / 1000).toFixed(3)}`,
      "# HELP nutrimejor_gateway_http_requests_total Solicitudes procesadas por el gateway.",
      "# TYPE nutrimejor_gateway_http_requests_total counter",
    ];
    for (const [key, count] of this.requests) {
      const [method, service, status] = JSON.parse(key);
      lines.push(`nutrimejor_gateway_http_requests_total{${labels({ method, service, status })}} ${count}`);
    }
    lines.push(
      "# HELP nutrimejor_gateway_http_request_duration_seconds Duración de solicitudes del gateway.",
      "# TYPE nutrimejor_gateway_http_request_duration_seconds histogram",
    );
    for (const [key, value] of this.durations) {
      const [method, service] = JSON.parse(key);
      buckets.forEach((limit, index) => lines.push(
        `nutrimejor_gateway_http_request_duration_seconds_bucket{${labels({ method, service, le: limit })}} ${value.buckets[index]}`,
      ));
      lines.push(`nutrimejor_gateway_http_request_duration_seconds_bucket{${labels({ method, service, le: "+Inf" })}} ${value.count}`);
      lines.push(`nutrimejor_gateway_http_request_duration_seconds_sum{${labels({ method, service })}} ${value.sum}`);
      lines.push(`nutrimejor_gateway_http_request_duration_seconds_count{${labels({ method, service })}} ${value.count}`);
    }
    lines.push(
      "# HELP nutrimejor_gateway_upstream_failures_total Fallos al comunicarse con APIs internas.",
      "# TYPE nutrimejor_gateway_upstream_failures_total counter",
    );
    for (const [key, count] of this.upstreamFailures) {
      const [service, reason] = JSON.parse(key);
      lines.push(`nutrimejor_gateway_upstream_failures_total{${labels({ service, reason })}} ${count}`);
    }
    lines.push(
      "# HELP nutrimejor_gateway_circuit_open_total Solicitudes rechazadas por circuitos abiertos.",
      "# TYPE nutrimejor_gateway_circuit_open_total counter",
    );
    for (const [service, count] of this.circuitOpen) {
      lines.push(`nutrimejor_gateway_circuit_open_total{${labels({ service })}} ${count}`);
    }
    return `${lines.join("\n")}\n`;
  }
}
