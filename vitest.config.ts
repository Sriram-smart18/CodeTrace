import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "https://deno.land/std@0.168.0/http/server.ts": path.resolve(__dirname, "./src/test/mocks/denoServerMock.ts"),
      "https://esm.sh/@supabase/supabase-js@2": path.resolve(__dirname, "./src/test/mocks/supabaseMock.ts"),
    },
  },
});
