import { config } from "./config.js";
import { CircuitBreaker } from "./application/circuit-breaker.js";
import { RateLimiter } from "./application/rate-limiter.js";
import { JwtVerifier } from "./infrastructure/security/jwt-verifier.js";
import { createServer } from "./interfaces/http/server.js";

const verifier = new JwtVerifier(config.serviceUrls.identity, config.jwtIssuer, config.jwtAudience);
const limiter = new RateLimiter();
const breaker = new CircuitBreaker({ threshold: config.circuitFailures, openMs: config.circuitOpenMs });

createServer(config, verifier, limiter, breaker).listen(config.port, "0.0.0.0", () => {
  console.log(JSON.stringify({ service: "api-gateway", port: config.port, status: "started" }));
});
