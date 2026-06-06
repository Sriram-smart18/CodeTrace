import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

if (typeof (globalThis as any).Deno === "undefined") {
  (globalThis as any).Deno = {
    env: {
      get: (key: string) => {
        if (key === "OPENROUTER_API_KEY") return "mock_key";
        return undefined;
      }
    }
  };
}

