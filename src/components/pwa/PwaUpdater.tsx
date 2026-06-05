import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

export function PwaUpdater() {
  const { toast } = useToast();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      if (registration) {
        console.log("[PWA SW] Service worker successfully registered.");
        
        // 6-hour update checks: check for updates every 6 hours
        const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
        const intervalId = setInterval(() => {
          console.log("[PWA SW] Checking for updates...");
          registration.update().catch((err) => {
            console.error("[PWA SW] Error during update check:", err);
          });
        }, SIX_HOURS_MS);

        return () => clearInterval(intervalId);
      }
    },
    onRegisterError(error) {
      console.error("[PWA SW] Service worker registration failed:", error);
    },
  });

  useEffect(() => {
    if (needRefresh) {
      toast({
        title: "Update Available",
        description: "A new version of TraceCode is available. Please update to get the latest features.",
        duration: Infinity, // Keep open until user interacts
        action: (
          <Button
            size="sm"
            onClick={async () => {
              await updateServiceWorker(true);
              setNeedRefresh(false);
            }}
          >
            Update Now
          </Button>
        ),
      });
    }
  }, [needRefresh, updateServiceWorker, setNeedRefresh, toast]);

  return null;
}
