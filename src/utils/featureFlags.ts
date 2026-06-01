export const featureFlags = {
  enableDevDiagnostics: import.meta.env.VITE_ENABLE_DEV_DIAGNOSTICS === 'true' || import.meta.env.DEV,
  enableStressTests: import.meta.env.VITE_ENABLE_STRESS_TESTS === 'true' || import.meta.env.DEV,
  enableOfflineMode: import.meta.env.VITE_ENABLE_OFFLINE_MODE !== 'false',
  enableRuntimeTelemetry: import.meta.env.VITE_ENABLE_RUNTIME_TELEMETRY !== 'false',
};
