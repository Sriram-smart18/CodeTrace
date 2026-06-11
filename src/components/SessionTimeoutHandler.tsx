import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useIdeStore } from "@/components/ide/store/ideStore";

export function SessionTimeoutHandler() {
  const { session, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const isLoggingOutRef = useRef(false);
  const hasShownWarningRef = useRef(false);

  useEffect(() => {
    if (!session) {
      isLoggingOutRef.current = false;
      hasShownWarningRef.current = false;
      return;
    }

    const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutes
    const WARNING_THRESHOLD = 4 * 60 * 1000; // 4 minutes
    let lastActivityTime = Date.now();
    let awaySinceTime: number | null = null;

    // Load initial values to keep tracking consistent across page reloads
    const storedLastActivity = localStorage.getItem("tracecode_last_activity");
    if (storedLastActivity) {
      lastActivityTime = parseInt(storedLastActivity, 10);
    } else {
      localStorage.setItem("tracecode_last_activity", lastActivityTime.toString());
    }

    const storedAwaySince = localStorage.getItem("tracecode_away_since");
    if (storedAwaySince) {
      awaySinceTime = parseInt(storedAwaySince, 10);
    }

    const handleLogout = async () => {
      if (isLoggingOutRef.current) return;

      // SAFETY CHECKS: Never logout during active code execution, submission, or critical save operations
      const storeState = useIdeStore.getState();
      const isExecuting = storeState.execState === "running" || storeState.execState === "waiting";
      const isSaving = storeState.saving || storeState.savingStatus === "saving";
      
      if (isExecuting || isSaving) {
        console.log("[Timeout] Logout postponed due to active execution or saving state.");
        // Delay logout check by 15 seconds
        lastActivityTime = Date.now() - WARNING_THRESHOLD;
        localStorage.setItem("tracecode_last_activity", lastActivityTime.toString());
        return;
      }

      isLoggingOutRef.current = true;

      // 1. Save unsaved editor content locally before logout
      try {
        const forceLocalSave = useIdeStore.getState().forceLocalSave;
        if (forceLocalSave) {
          await forceLocalSave();
        }
      } catch (err) {
        console.error("Failed to auto-save editor contents on timeout logout:", err);
      }

      // 2. Clear activity markers
      localStorage.removeItem("tracecode_last_activity");
      localStorage.removeItem("tracecode_away_since");

      const role = profile?.role || "student";

      // 3. Perform logout
      await signOut();

      // 4. Show session expired toast
      toast({
        title: "Session Expired",
        description: "Session expired due to inactivity.",
        variant: "destructive",
      });

      // 5. Redirect to login
      navigate(`/${role}/login`, { replace: true });
    };

    const updateActivity = () => {
      const now = Date.now();
      lastActivityTime = now;
      localStorage.setItem("tracecode_last_activity", now.toString());
      
      // If user became active, reset the warning trigger flag
      if (hasShownWarningRef.current) {
        hasShownWarningRef.current = false;
        toast({
          title: "Session Renewed",
          description: "Your session has been renewed.",
        });
      }
    };

    // Throttle helper to avoid performance overhead on mousemove/scroll
    let throttleTimeout: NodeJS.Timeout | null = null;
    const throttledUpdateActivity = () => {
      if (throttleTimeout) return;
      updateActivity();
      throttleTimeout = setTimeout(() => {
        throttleTimeout = null;
      }, 2000); // 2s throttle
    };

    const activityEvents = ["mousemove", "keypress", "click", "scroll"];
    activityEvents.forEach((event) => {
      window.addEventListener(event, throttledUpdateActivity);
    });

    // Visbility / Focus state transitions
    const handleVisibilityChange = () => {
      const now = Date.now();
      if (document.visibilityState === "hidden") {
        awaySinceTime = now;
        localStorage.setItem("tracecode_away_since", now.toString());
      } else {
        if (awaySinceTime) {
          const elapsedAway = now - awaySinceTime;
          if (elapsedAway >= INACTIVITY_LIMIT) {
            handleLogout();
            return;
          }
        }
        awaySinceTime = null;
        localStorage.removeItem("tracecode_away_since");
        updateActivity();
      }
    };

    const handleWindowBlur = () => {
      const now = Date.now();
      if (!awaySinceTime) {
        awaySinceTime = now;
        localStorage.setItem("tracecode_away_since", now.toString());
      }
    };

    const handleWindowFocus = () => {
      const now = Date.now();
      if (awaySinceTime) {
        const elapsedAway = now - awaySinceTime;
        if (elapsedAway >= INACTIVITY_LIMIT) {
          handleLogout();
          return;
        }
      }
      awaySinceTime = null;
      localStorage.removeItem("tracecode_away_since");
      updateActivity();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);

    // Checker loop running every 5 seconds
    const checkInterval = setInterval(() => {
      const now = Date.now();

      // 1. Check tab switch-away (Condition A)
      if (awaySinceTime) {
        const elapsedAway = now - awaySinceTime;
        if (elapsedAway >= INACTIVITY_LIMIT) {
          handleLogout();
          return;
        }
      }

      // 2. Check idle inactivity (Condition B)
      const elapsedInactive = now - lastActivityTime;
      if (elapsedInactive >= INACTIVITY_LIMIT) {
        handleLogout();
        return;
      }

      // 3. Show warning at 4 minutes of inactivity
      if (elapsedInactive >= WARNING_THRESHOLD && !hasShownWarningRef.current && !awaySinceTime) {
        hasShownWarningRef.current = true;
        toast({
          title: "Session Expiring",
          description: "Your session will expire in 1 minute due to inactivity.",
          variant: "destructive",
        });
      }
    }, 5000);

    return () => {
      if (throttleTimeout) clearTimeout(throttleTimeout);
      clearInterval(checkInterval);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, throttledUpdateActivity);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [session, profile, signOut, navigate, toast]);

  return null;
}
