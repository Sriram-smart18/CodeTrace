type MetricType = 'timer' | 'counter';

interface MetricEvent {
  name: string;
  type: MetricType;
  value: number;
  timestamp: number;
}

class RuntimeMetrics {
  private metrics: MetricEvent[] = [];
  private isEnabled = false;
  private sampleRate = 0.1; // Log 10% of metrics locally
  private flushTimeout?: NodeJS.Timeout;

  constructor() {
    this.isEnabled = import.meta.env.DEV; // Only enabled in dev mode
  }

  public recordTime(name: string, durationMs: number) {
    if (!this.isEnabled) return;
    this.metrics.push({ name, type: 'timer', value: durationMs, timestamp: Date.now() });
    this.scheduleFlush();
  }

  public recordCount(name: string, count: number = 1) {
    if (!this.isEnabled) return;
    this.metrics.push({ name, type: 'counter', value: count, timestamp: Date.now() });
    this.scheduleFlush();
  }

  public timeFunction<T>(name: string, fn: () => T): T {
    if (!this.isEnabled) return fn();
    const start = performance.now();
    const result = fn();
    this.recordTime(name, performance.now() - start);
    return result;
  }

  public async timeAsyncFunction<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!this.isEnabled) return fn();
    const start = performance.now();
    const result = await fn();
    this.recordTime(name, performance.now() - start);
    return result;
  }

  private scheduleFlush() {
    if (this.flushTimeout) return;
    this.flushTimeout = setTimeout(() => this.flush(), 5000); // Flush every 5 seconds
  }

  private flush() {
    this.flushTimeout = undefined;
    if (this.metrics.length === 0) return;

    const batch = [...this.metrics];
    this.metrics = [];

    // Apply sampling to reduce console spam
    const sampled = batch.filter(() => Math.random() < this.sampleRate);

    if (sampled.length > 0) {
      console.groupCollapsed(`[METRICS] Flushed ${batch.length} events (${sampled.length} sampled)`);
      sampled.forEach(m => {
        if (m.type === 'timer') {
          console.log(`${m.name}: ${m.value.toFixed(2)}ms`);
        } else {
          console.log(`${m.name}: ${m.value}`);
        }
      });
      console.groupEnd();
    }
  }
}

export const metrics = new RuntimeMetrics();
