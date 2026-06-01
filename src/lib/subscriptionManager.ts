// File: src/lib/subscriptionManager.ts
import { realtimeManager } from "./realtimeManager";

interface SubscriptionInstance {
  id: string;
  channelName: string;
  table: string;
  event: "INSERT" | "UPDATE" | "DELETE" | "*";
  filter?: string;
  callback: (payload: any) => void;
}

class SubscriptionManager {
  private desiredSubscriptions = new Set<SubscriptionInstance>();
  private isPageVisible = true;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      this.isPageVisible = !document.hidden;
      document.addEventListener("visibilitychange", () => {
        this.handleVisibilityChange();
      });
      
      // Start heartbeat check every 30 seconds
      this.heartbeatInterval = setInterval(() => {
        this.validateHeartbeats();
      }, 30000);
    }
  }

  private handleVisibilityChange() {
    const visible = !document.hidden;
    if (visible === this.isPageVisible) return;
    this.isPageVisible = visible;
    console.log(`[SubscriptionManager] Visibility changed: ${visible ? "visible" : "hidden"}`);

    if (visible) {
      this.resumeDesiredSubscriptions();
    } else {
      this.suspendActiveSubscriptions();
    }
  }

  private suspendActiveSubscriptions() {
    console.log(`[SubscriptionManager] Suspending ${this.desiredSubscriptions.size} active subscriptions due to page inactivity.`);
    this.desiredSubscriptions.forEach((sub) => {
      try {
        realtimeManager.unsubscribeChannel(sub.id);
      } catch (e) {
        console.error("[SubscriptionManager] Error removing subscription on suspend:", e);
      }
    });
  }

  private resumeDesiredSubscriptions() {
    console.log(`[SubscriptionManager] Resuming ${this.desiredSubscriptions.size} desired subscriptions.`);
    this.desiredSubscriptions.forEach((sub) => {
      this.establishSubscription(sub);
    });
  }

  private validateHeartbeats() {
    if (!this.isPageVisible) return;
    console.log(`[SubscriptionManager] Heartbeat validation: ${this.desiredSubscriptions.size} desired subscriptions.`);
  }

  private establishSubscription(sub: SubscriptionInstance) {
    if (!this.isPageVisible) return;

    try {
      realtimeManager.subscribeToChannel({
        key: sub.id,
        channelName: sub.channelName,
        config: {
          event: sub.event,
          schema: "public",
          table: sub.table,
          filter: sub.filter,
        },
        callback: sub.callback
      });
    } catch (e) {
      console.error("[SubscriptionManager] Error establishing subscription:", e);
    }
  }

  /**
   * Subscribe to a PostgreSQL change channel with visibility-awareness, backoffs, and heartbeat.
   */
  public subscribe(
    channelName: string,
    table: string,
    event: "INSERT" | "UPDATE" | "DELETE" | "*",
    filter: string | undefined,
    callback: (payload: any) => void
  ): () => void {
    const sub: SubscriptionInstance = {
      id: crypto.randomUUID(),
      channelName,
      table,
      event,
      filter,
      callback,
    };

    this.desiredSubscriptions.add(sub);
    this.establishSubscription(sub);

    return () => {
      this.desiredSubscriptions.delete(sub);
      try {
        realtimeManager.unsubscribeChannel(sub.id);
      } catch (e) {
        console.error("[SubscriptionManager] Error unsubscribing instance:", e);
      }
    };
  }

  /**
   * Clear all active subscriptions on logout or unmount
   */
  public clearAll(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.desiredSubscriptions.clear();
    try {
      realtimeManager.cleanupAllChannels();
    } catch (e) {
      console.error("[SubscriptionManager] Error cleaning up realtimeManager channels:", e);
    }
  }
}

export const subscriptionManager = new SubscriptionManager();
