import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

export function OfflineOverlay() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 animate-fade-in pointer-events-none">
      <div className="bg-amber-600/90 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-amber-500/30 backdrop-blur-md select-none font-sans max-w-sm pointer-events-auto">
        <WifiOff className="h-4.5 w-4.5 text-amber-200 shrink-0" />
        <div>
          <span className="font-bold block">Offline Mode Active</span>
          <span className="text-[10px] text-amber-100/90 block mt-0.5 leading-normal">
            Realtime syncing, code execution, and AI evaluations are suspended until connection is restored.
          </span>
        </div>
      </div>
    </div>
  );
}
