import { performance } from "node:perf_hooks";
import { gatewayUrl } from "./gateway-url.mjs";

const base = process.env.API_HOST ?? "127.0.0.1";
const concurrency = Number(process.env.CONCURRENCY ?? 12);
const requestsPerService = Number(process.env.REQUESTS_PER_SERVICE ?? 25);
const ports = Array.from({ length: 12 }, (_, index) => 4001 + index);

if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100) throw new Error("CONCURRENCY debe estar entre 1 y 100.");
if (!Number.isInteger(requestsPerService) || requestsPerService < 1 || requestsPerService > 1000) throw new Error("REQUESTS_PER_SERVICE debe estar entre 1 y 1000.");

const jobs = ports.flatMap((port) => Array.from({ length: requestsPerService }, () => ({ port })));
const results = [];
let cursor = 0;

async function worker() {
  while (cursor < jobs.length) {
    const job = jobs[cursor++];
    const started = performance.now();
    try {
      const response = await fetch(gatewayUrl(`http://${base}:${job.port}/health/ready`), { signal: AbortSignal.timeout(5000) });
      results.push({ port: job.port, ok: response.ok, status: response.status, ms: performance.now() - started });
    } catch (error) {
      results.push({ port: job.port, ok: false, status: 0, ms: performance.now() - started, error: error.message });
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
const sorted = results.map((item) => item.ms).sort((a, b) => a - b);
const percentile = (value) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)];
const failures = results.filter((item) => !item.ok);
const summary = {
  services: ports.length,
  requests: results.length,
  concurrency,
  failures: failures.length,
  latencyMs: {
    p50: Number(percentile(0.5).toFixed(1)),
    p95: Number(percentile(0.95).toFixed(1)),
    max: Number(sorted.at(-1).toFixed(1)),
  },
};

console.log(JSON.stringify(summary));
if (failures.length) {
  console.error(JSON.stringify(failures.slice(0, 10), null, 2));
  process.exitCode = 1;
}
