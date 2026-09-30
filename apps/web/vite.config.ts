/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devDemoToken = (env.VITE_DEV_DEMO_TOKEN || process.env.VITE_DEV_DEMO_TOKEN || "").trim();

  // Fail-closed security guard: NEVER allow VITE_DEV_DEMO_TOKEN into production bundle
  if (command === "build" && devDemoToken) {
    if (mode === "production" || process.env.NODE_ENV === "production") {
      throw new Error(
        "SECURITY FAIL-CLOSED: VITE_DEV_DEMO_TOKEN is defined in production build mode! " +
        "This variable contains operator credentials and must never be built into public client assets."
      );
    } else {
      console.warn(
        `\n⚠️  SECURITY WARNING: VITE_DEV_DEMO_TOKEN is defined during '${mode}' build. ` +
        `This token is strictly for internal dev/lab testing and must NEVER be published to production.\n`
      );
    }
  }

  return {
    plugins: [react()],
    server: {
      port: 3400,
      host: "0.0.0.0",
    },
    preview: {
      port: 3400,
      host: "0.0.0.0",
    },
    test: {
      environment: "happy-dom",
    },
  };
});
