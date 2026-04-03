/**
 * Load functions/.env when running in the Firebase emulator so SMTP_* is available.
 * Deployed functions use environment variables set in Google Cloud (not this file).
 */
import * as fs from "fs";
import * as path from "path";
import { config as dotenvConfig } from "dotenv";

const envPath = path.resolve(__dirname, "../.env");
const runningInEmulator =
  process.env.FUNCTIONS_EMULATOR === "true" || !!process.env.FIREBASE_EMULATOR_HUB;

if (runningInEmulator && fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
  console.log("[functions] Loaded env from", envPath);
} else if (runningInEmulator && !fs.existsSync(envPath)) {
  console.warn(
    "[functions] Emulator running but functions/.env not found — SMTP will be missing unless set in the shell or Cloud."
  );
}
