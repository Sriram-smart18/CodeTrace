export type TelemetryEvent = {
  type: 'error' | 'performance' | 'lifecycle';
  name: string;
  payload: any;
  timestamp: number;
  userId?: string;
  assignmentId?: string;
  workspaceType?: string;
};

class RuntimeTelemetry {
  private queue: TelemetryEvent[] = [];
  private isProcessing = false;

  public logEvent(event: Omit<TelemetryEvent, 'timestamp'>) {
    this.queue.push({ ...event, timestamp: Date.now() });
    this.scheduleFlush();
  }

  public logError(name: string, error: unknown, context?: any) {
    this.logEvent({
      type: 'error',
      name,
      payload: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        ...context
      }
    });
  }

  private scheduleFlush() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => this.flush());
    } else {
      setTimeout(() => this.flush(), 2000);
    }
  }

  private async flush() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    const events = [...this.queue];
    this.queue = [];

    // In a real system, send this to an observability pipeline (Datadog/Sentry).
    // For now, we simulate async flush to console safely.
    try {
      events.forEach(e => {
        if (e.type === 'error') {
          console.error(`[TELEMETRY ERROR] ${e.name}`, e.payload);
        }
      });
    } finally {
      this.isProcessing = false;
      if (this.queue.length > 0) {
        this.scheduleFlush();
      }
    }
  }
}

export const telemetry = new RuntimeTelemetry();
