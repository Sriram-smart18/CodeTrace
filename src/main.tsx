import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { aiQueueService } from "@/lib/aiQueueService";
import { validateEnvironment } from "@/lib/validateEnv";

// Validate env configurations on boot
validateEnvironment();

// Start background AI evaluation jobs dispatcher
aiQueueService.start();

// Global frontend error & promise rejection monitoring
if (typeof window !== "undefined") {
  window.onerror = (message, source, lineno, colno, error) => {
    console.error("[GLOBAL FRONTEND ERROR]", { message, source, lineno, colno, error });
  };

  window.onunhandledrejection = (event) => {
    console.error("[GLOBAL FRONTEND REJECTION]", event.reason);
  };
}

createRoot(document.getElementById("root")!).render(<App />);
