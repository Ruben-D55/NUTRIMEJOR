import assert from "node:assert/strict";
import test from "node:test";
import { MetricsRegistry } from "../src/infrastructure/observability/metrics.js";
import { Telemetry } from "../src/infrastructure/observability/telemetry.js";

test("renders Prometheus counters and cumulative latency buckets", () => {
  const metrics = new MetricsRegistry();
  metrics.observeRequest("GET", "patients", 200, 0.2);
  metrics.observeRequest("GET", "patients", 503, 0.7);
  metrics.recordUpstreamFailure("patients", "timeout");
  metrics.recordCircuitOpen("patients");
  const output = metrics.render();
  assert.match(output, /nutrimejor_gateway_http_requests_total\{method="GET",service="patients",status="200"\} 1/);
  assert.match(output, /le="0.25"\} 1/);
  assert.match(output, /le="1"\} 2/);
  assert.match(output, /nutrimejor_gateway_upstream_failures_total\{service="patients",reason="timeout"\} 1/);
  assert.match(output, /nutrimejor_gateway_circuit_open_total\{service="patients"\} 1/);
});

test("creates W3C trace context and exports an OTLP span", async () => {
  const requests = [];
  const telemetry = new Telemetry({
    endpoint: "http://collector:4318",
    fetchImpl: async (url, options) => { requests.push({ url, options }); return { ok: true }; },
  });
  const root = telemetry.startSpan("GET /patients");
  const child = telemetry.child("patients-api", root);
  assert.match(telemetry.traceparent(child), /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  assert.equal(child.traceId, root.traceId);
  assert.equal(child.parentSpanId, root.spanId);
  telemetry.endSpan(child, 200, { "http.response.status_code": 200 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests[0].url, "http://collector:4318/v1/traces");
  const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.resourceSpans[0].scopeSpans[0].spans[0].traceId, root.traceId);
});
