import { randomBytes } from "node:crypto";

const traceparentPattern = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;
const hex = (bytes) => randomBytes(bytes).toString("hex");
const nanos = () => (BigInt(Date.now()) * 1_000_000n).toString();

function otlpAttributes(attributes) {
  return Object.entries(attributes).map(([key, value]) => ({
    key,
    value: typeof value === "number" ? { doubleValue: value } : { stringValue: String(value) },
  }));
}

export class Telemetry {
  constructor({ endpoint = "", serviceName = "nutrimejor-api-gateway", fetchImpl = fetch } = {}) {
    this.endpoint = endpoint.replace(/\/$/, "");
    this.serviceName = serviceName;
    this.fetch = fetchImpl;
  }

  startSpan(name, parent = null, attributes = {}) {
    const parsed = typeof parent === "string" ? parent.match(traceparentPattern) : null;
    return {
      name,
      traceId: parsed?.[1].toLowerCase() || hex(16),
      spanId: hex(8),
      parentSpanId: parsed?.[2].toLowerCase() || "",
      startTimeUnixNano: nanos(),
      attributes,
    };
  }

  child(name, parent, attributes = {}) {
    return { ...this.startSpan(name, null, attributes), traceId: parent.traceId, parentSpanId: parent.spanId };
  }

  traceparent(span) {
    return `00-${span.traceId}-${span.spanId}-01`;
  }

  endSpan(span, statusCode, attributes = {}) {
    if (!this.endpoint) return;
    const payload = {
      resourceSpans: [{
        resource: { attributes: otlpAttributes({ "service.name": this.serviceName, "service.namespace": "nutrimejor" }) },
        scopeSpans: [{
          scope: { name: "nutrimejor.gateway", version: "1.0.0" },
          spans: [{
            traceId: span.traceId,
            spanId: span.spanId,
            ...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
            name: span.name,
            kind: 2,
            startTimeUnixNano: span.startTimeUnixNano,
            endTimeUnixNano: nanos(),
            attributes: otlpAttributes({ ...span.attributes, ...attributes }),
            status: { code: statusCode >= 500 ? 2 : 1 },
          }],
        }],
      }],
    };
    this.fetch(`${this.endpoint}/v1/traces`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch((error) => console.error(JSON.stringify({
      service: this.serviceName,
      event: "otel_export_failed",
      error: error.message,
    })));
  }
}
