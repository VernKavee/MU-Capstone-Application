import path from "node:path";
import { defineConfig } from "@playwright/test";

// The camera fixture the stub engine's placement guide and ready gate need real landmarks
// from (e2e/fixtures/README.md). Chrome's fake video device loops it; a single held T-pose
// frame is a static feed. Both flags are required together for a fake camera device to
// exist at all and for the getUserMedia prompt to auto-accept.
const T_POSE = path.resolve(__dirname, "e2e/fixtures/t-pose.y4m");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  // Both specs create accounts against the one local stack; running them in parallel
  // workers buys nothing here and only adds noise to read.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome", // the installed Google Chrome, so no browser download
    trace: "retain-on-failure", // no retries here, so on-first-retry would never record one
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-video-capture=${T_POSE}`,
        // This network has IPv6 addresses that do not route (curl -6 fails, -4 works) and
        // blocks outbound UDP, so QUIC connections fail at the socket. Both otherwise
        // stall fetching the pose model and its wasm from jsdelivr and Google Storage.
        "--disable-ipv6",
        "--disable-quic",
      ],
    },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
