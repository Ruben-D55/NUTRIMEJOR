export class RateLimiter {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.buckets = new Map();
  }

  consume(key, limit, windowMs) {
    const now = this.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfter: 0 };
    }
    current.count += 1;
    return { allowed: current.count <= limit, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }

  check(ip, userId, sensitive = false) {
    if (this.buckets.size > 10000) {
      const now = this.now();
      for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    const ipResult = this.consume(`ip:${ip}:${sensitive ? "auth" : "all"}`, sensitive ? 12 : 600, sensitive ? 900000 : 60000);
    if (!ipResult.allowed) return ipResult;
    return userId ? this.consume(`user:${userId}`, 300, 60000) : ipResult;
  }
}
