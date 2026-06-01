// File: src/lib/validateEnv.ts

interface EnvironmentConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  mode: string;
}

export function validateEnvironment(): EnvironmentConfig {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const mode = import.meta.env.MODE || "development";

  const missingKeys: string[] = [];

  if (!supabaseUrl) {
    missingKeys.push("VITE_SUPABASE_URL");
  } else if (!supabaseUrl.startsWith("https://")) {
    console.error("[validateEnv] VITE_SUPABASE_URL must be a valid HTTPS endpoint.");
  }

  if (!supabaseAnonKey) {
    missingKeys.push("VITE_SUPABASE_ANON_KEY");
  }

  if (missingKeys.length > 0) {
    const errorMsg = `[Environment Configuration Error] Missing required keys: ${missingKeys.join(", ")}. Please inspect your local .env configuration.`;
    console.error(errorMsg);
    
    // In production or build, fail gracefully but explicitly so the developer notices it.
    if (typeof window !== "undefined") {
      const banner = document.createElement("div");
      banner.style.position = "fixed";
      banner.style.top = "0";
      banner.style.left = "0";
      banner.style.width = "100%";
      banner.style.backgroundColor = "#ef4444";
      banner.style.color = "#ffffff";
      banner.style.padding = "10px";
      banner.style.textAlign = "center";
      banner.style.fontSize = "12px";
      banner.style.fontFamily = "monospace";
      banner.style.zIndex = "99999";
      banner.innerText = `⚠️ System Configuration Failure: Missing env credentials (${missingKeys.join(", ")}).`;
      document.body.appendChild(banner);
    }
  } else {
    console.log(`[validateEnv] Environment validation passed. Active mode: ${mode}`);
  }

  return {
    supabaseUrl: supabaseUrl || "",
    supabaseAnonKey: supabaseAnonKey || "",
    mode
  };
}
