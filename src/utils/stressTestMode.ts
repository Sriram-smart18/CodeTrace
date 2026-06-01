import { saveQueue } from "./saveQueue";
import { featureFlags } from "./featureFlags";

class StressTestEngine {
  private activeTimers: NodeJS.Timeout[] = [];
  private isRunning = false;

  constructor() {
    if (typeof window !== 'undefined') {
      (window as any).__CODETRACE_STOP_STRESS_TESTS__ = this.stopAll.bind(this);
      (window as any).__CODETRACE_START_STRESS_TESTS__ = this.startAll.bind(this);
    }
  }

  public startAll() {
    if (!featureFlags.enableStressTests || this.isRunning) return;
    this.isRunning = true;
    console.warn('[STRESS TEST] STARTING ALL STRESS SIMULATIONS. RUN `window.__CODETRACE_STOP_STRESS_TESTS__()` TO ABORT.');
    
    this.simulateSaveSpam();
    this.simulateIframeReloadSpam();
  }

  public stopAll() {
    console.warn('[STRESS TEST] ABORTING ALL STRESS SIMULATIONS.');
    this.activeTimers.forEach(clearTimeout);
    this.activeTimers.forEach(clearInterval);
    this.activeTimers = [];
    this.isRunning = false;
  }

  private simulateSaveSpam() {
    // Fire 10 save tasks per second to verify deduping and deterministic version ordering
    const interval = setInterval(() => {
      saveQueue.enqueue({
        id: 'stress-test-local-file',
        version: Date.now(),
        payload: { content: 'Stress Test Data ' + Math.random() },
        persistFn: async (payload) => {
          // Local mock persist only
          await new Promise(res => setTimeout(res, 50));
        }
      });
    }, 100);
    this.activeTimers.push(interval);
  }

  private simulateIframeReloadSpam() {
    // Toggle the preview iframe rapidly but THROTTLED to once every 2 seconds
    // to avoid Chromium crashing.
    const interval = setInterval(() => {
      const el = document.getElementById('debug-force-preview-reload');
      if (el) el.click();
    }, 2000);
    this.activeTimers.push(interval);
  }
}

export const stressTestEngine = new StressTestEngine();
