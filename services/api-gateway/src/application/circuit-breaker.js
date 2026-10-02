export class CircuitBreaker {
  constructor({ threshold = 5, openMs = 30000, now = () => Date.now() } = {}) {
    this.threshold = threshold;
    this.openMs = openMs;
    this.now = now;
    this.states = new Map();
  }

  canRequest(service) {
    const state = this.states.get(service);
    if (!state || state.failures < this.threshold) return true;
    if (state.openUntil > this.now()) return false;
    if (state.probe) return false;
    state.probe = true;
    return true;
  }

  success(service) {
    this.states.delete(service);
  }

  failure(service) {
    const state = this.states.get(service) || { failures: 0, openUntil: 0, probe: false };
    state.failures += 1;
    state.probe = false;
    if (state.failures >= this.threshold) state.openUntil = this.now() + this.openMs;
    this.states.set(service, state);
  }
}
