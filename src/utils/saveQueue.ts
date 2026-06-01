export interface SaveTask<T = any> {
  id: string; // Unique identifier for the entity (e.g., fileId, assignmentId)
  version: number;
  payload: T;
  persistFn: (payload: T) => Promise<void> | void;
  queuedAt?: number;
  processedAt?: number;
}

import { stabilityScorecard } from "./stabilityScorecard";

class SaveQueueManager {
  private queue: Map<string, SaveTask> = new Map();
  private processing: Set<string> = new Set();
  private lastProcessedVersion: Map<string, number> = new Map();
  private flushTimeout: NodeJS.Timeout | null = null;
  private isOffline: boolean = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.isOffline = !navigator.onLine;
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
    }
  }

  private handleOnline = () => {
    this.isOffline = false;
    this.scheduleFlush(0); // Immediately try to flush when online
  };

  private handleOffline = () => {
    this.isOffline = true;
  };

  /**
   * Enqueue a save task. Deduplicates by ID and drops stale versions.
   */
  // Metrics API for Diagnostics Panel
  public getQueueDepth(): number {
    return this.queue.size;
  }

  public getOfflineQueueDepth(): number {
    let count = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('codetrace:v2:')) {
          count++;
        }
      }
    } catch {
      // ignore
    }
    return count;
  }

  public enqueue(task: SaveTask) {
    task.queuedAt = Date.now();
    const existing = this.queue.get(task.id);
    
    // Stale cancellation: Ignore if we already have a strictly newer version queued
    if (existing && existing.version > task.version) {
      console.warn(`[SAVE QUEUE] Dropping stale write for ${task.id} (v${task.version} < v${existing.version})`);
      return;
    }
    
    this.queue.set(task.id, task);
    this.scheduleFlush(800);
  }

  private scheduleFlush(delayMs: number) {
    if (this.flushTimeout) clearTimeout(this.flushTimeout);
    this.flushTimeout = setTimeout(() => this.flush(), delayMs);
  }

  private async flush() {
    this.flushTimeout = null;
    
    // Offline recovery deferral - don't process async queue if offline
    // (Note: synchronous localStorage tasks could bypass this, but for simplicity we hold)
    if (this.isOffline) {
      console.log('[SAVE QUEUE] Offline mode active. Deferring sync.');
      return;
    }

    if (this.queue.size === 0) return;

    const tasks = Array.from(this.queue.values());
    this.queue.clear();

    for (const task of tasks) {
      if (this.processing.has(task.id)) {
        // Re-queue to preserve sequential execution per ID
        this.queue.set(task.id, task);
        continue;
      }

      this.processing.add(task.id);

      try {
        const lastVersion = this.lastProcessedVersion.get(task.id) || 0;
        if (task.version < lastVersion) {
          console.error(`[SAVE QUEUE] Ordering violation detected for ${task.id}. v${task.version} is older than processed v${lastVersion}. Discarding.`);
          continue;
        }

        task.processedAt = Date.now();
        await Promise.resolve(task.persistFn(task.payload));
        
        this.lastProcessedVersion.set(task.id, task.version);
        stabilityScorecard.recordSuccess('saveIntegrity');
      } catch (err) {
        console.error(`[SAVE QUEUE] Failed to persist ${task.id}`, err);
        // Could integrate specific OfflineRecovery logic here if a network error is thrown
      } finally {
        this.processing.delete(task.id);
      }
    }
    
    // If items were requeued, schedule another flush
    if (this.queue.size > 0) {
      this.scheduleFlush(800);
    }
  }
}

// Global Singleton
export const saveQueue = new SaveQueueManager();
