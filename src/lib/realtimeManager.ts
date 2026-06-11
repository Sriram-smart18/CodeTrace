import { supabase } from "@/integrations/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";
import { telemetry } from "@/utils/runtimeTelemetry";
import { stabilityScorecard } from "@/utils/stabilityScorecard";

export interface SubscriptionConfig {
  event: string;
  schema: string;
  table: string;
  filter?: string;
}

export interface SubscribeParams {
  key: string;
  channelName: string;
  config: SubscriptionConfig;
  callback: (payload: any) => void;
}

export type ChannelEntry = {
  channel: RealtimeChannel;
  refCount: number;
  subscribers: Map<string, (payload: any) => void>;
  unsubscribeTimeout?: NodeJS.Timeout;
};

class RealtimeManager {
  private channels = new Map<string, ChannelEntry>();
  // Maps individual client keys to their respective deterministic channel keys
  private keyToChannelKeyMap = new Map<string, string>();
  constructor() {}


  public getActiveChannelCount(): number {
    return this.channels.size;
  }

  /**
   * Generates a deterministic channel key based on config properties to avoid duplicates
   */
  private getDeterministicKey(channelName: string, config: SubscriptionConfig): string {
    const schema = config.schema || "public";
    const table = config.table || "*";
    const event = config.event || "*";
    const filter = config.filter || "";
    return `${channelName}:${schema}:${table}:${event}:${filter}`;
  }

  public subscribeToChannel(params: SubscribeParams): void {
    const { key, channelName, config, callback } = params;


    try {
      const channelKey = this.getDeterministicKey(channelName, config);

      // Prevent duplicate subscription for the exact same client key
      if (this.keyToChannelKeyMap.has(key)) {
        const existingChannelKey = this.keyToChannelKeyMap.get(key);
        if (existingChannelKey === channelKey) {
          console.log(`[Realtime] duplicate prevented: ${key}`);
          // Just update the callback in case it changed
          const entry = this.channels.get(channelKey);
          if (entry) {
            entry.subscribers.set(key, callback);
          }
          return;
        }
        // If it's a different channel key, unsubscribe first
        this.unsubscribeChannel(key);
      }

      this.keyToChannelKeyMap.set(key, channelKey);

      let entry = this.channels.get(channelKey);

      if (!entry) {
        console.log(`[Realtime] subscribing: ${channelName}`);
        
        const channel = supabase.channel(channelKey);

        entry = {
          channel,
          refCount: 1,
          subscribers: new Map()
        };

        this.channels.set(channelKey, entry);
        entry.subscribers.set(key, callback);

        // Bind the postgres_changes listener to the channel BEFORE subscribing
        channel.on(
          "postgres_changes",
          {
            event: config.event as any,
            schema: config.schema || "public",
            table: config.table,
            ...(config.filter ? { filter: config.filter } : {})
          },
          (payload) => {
            // Multiplex and notify all active subscribers for this channel configuration
            const activeEntry = this.channels.get(channelKey);
            if (activeEntry) {
              activeEntry.subscribers.forEach((subCallback) => {
                try {
                  subCallback(payload);
                } catch (err) {
                  console.error(`[Realtime] Error invoking subscriber callback for key ${key}:`, err);
                }
              });
            }
          }
        );

        // Subscribe to connection events
        channel.subscribe((status, err) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(`[Realtime] WebSocket status error for ${channelKey}:`, err || status);
          }
        });

        if (entry.subscribers.size > 20) {
          telemetry.logEvent({
            type: 'performance',
            name: 'RealtimeHighListenerCount',
            payload: { channel: channelKey, listeners: entry.subscribers.size }
          });
        }
      } else {
        // If there was a pending unsubscribe timeout, cancel it (cooldown cancellation)
        if (entry.unsubscribeTimeout) {
          clearTimeout(entry.unsubscribeTimeout);
          entry.unsubscribeTimeout = undefined;
          console.log(`[Realtime] cooldown cancelled: ${channelKey}`);
        }

        console.log(`[Realtime] reusing existing channel: ${channelName}`);
        entry.refCount++;
        entry.subscribers.set(key, callback);
      }
    } catch (error) {
      console.error(`[Realtime] Error subscribing to channel ${channelName}:`, error);
    }
  }

  public unsubscribeChannel(key: string): void {
    try {
      const channelKey = this.keyToChannelKeyMap.get(key);
      if (!channelKey) return;

      this.keyToChannelKeyMap.delete(key);

      const entry = this.channels.get(channelKey);
      if (!entry) return;

      console.log(`[Realtime] unsubscribing: ${channelKey}`);
      entry.subscribers.delete(key);
      entry.refCount--;

      // If no more subscribers, schedule channel removal with a 100ms cooldown (for StrictMode safety)
      if (entry.refCount <= 0) {
        if (entry.unsubscribeTimeout) {
          clearTimeout(entry.unsubscribeTimeout);
        }

        entry.unsubscribeTimeout = setTimeout(() => {
          try {
            const finalEntry = this.channels.get(channelKey);
            // Verify refCount is still 0 before actually cleaning up
            if (finalEntry && finalEntry.refCount <= 0) {
              this.channels.delete(channelKey);
              supabase.removeChannel(finalEntry.channel);
              console.log(`[Realtime] cleanup complete: ${channelKey}`);
              stabilityScorecard.recordSuccess('websocketStability');
            }
          } catch (err) {
            console.error(`[Realtime] Error during channel unsubscription cleanup for ${channelKey}:`, err);
          }
        }, 100);
      }
    } catch (error) {
      console.error(`[Realtime] Error unsubscribing key ${key}:`, error);
    }
  }

  public cleanupAllChannels(): void {
    try {
      console.log(`[Realtime] cleaning up all channels`);
      this.channels.forEach((entry, channelKey) => {
        if (entry.unsubscribeTimeout) {
          clearTimeout(entry.unsubscribeTimeout);
        }
        try {
          supabase.removeChannel(entry.channel);
        } catch (err) {
          console.error(`[Realtime] Error removing channel ${channelKey}:`, err);
        }
      });
      this.channels.clear();
      this.keyToChannelKeyMap.clear();
      console.log(`[Realtime] cleanup complete: all channels`);
    } catch (error) {
      console.error(`[Realtime] Error in cleanupAllChannels:`, error);
    }
  }
}

export const realtimeManager = new RealtimeManager();
