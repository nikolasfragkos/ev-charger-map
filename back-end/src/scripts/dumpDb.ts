import { exec } from "child_process";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

/**
 * Find the back-end directory reliably.
 * - If script is run from inside back-end, cwd basename === "back-end"
 * - If run from repo root, expect a "back-end" folder under cwd
 */
function resolveBackendDir(): string {
  const cwd = process.cwd();

  // Running from /back-end
  if (path.basename(cwd) === "back-end") return cwd;

  // Running from repo root (has /back-end)
  const candidate = path.join(cwd, "back-end");
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;

  // Fallback: assume current dir is the backend anyway
  return cwd;
}

const backendDir = resolveBackendDir();

// ✅ Explicitly load /back-end/.env (NOT cwd/.env)
const envPath = path.join(backendDir, ".env");
dotenv.config({ path: envPath });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not found in .env");
  console.error(`Looked for: ${envPath}`);
  console.error(`process.cwd(): ${process.cwd()}`);
  process.exit(1);
}

const dumpDir = path.join(backendDir, "dump");
if (!fs.existsSync(dumpDir)) {
  console.log("📁 Creating dump directory...");
  fs.mkdirSync(dumpDir, { recursive: true });
}

function getTimestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

const filename = `ev_app_dump_${getTimestamp()}.sql`;
const filepath = path.join(dumpDir, filename);

// pg_dump command
const command = `pg_dump "${DATABASE_URL}" -F p -f "${filepath}"`;

console.log("🚀 Starting database dump...");
console.log(`📦 Output: ${filepath}`);

exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error("❌ Dump failed:");
    console.error(error.message);

    // Helpful extra context (usually empty, but nice to have)
    if (stderr?.trim()) {
      console.error("stderr:");
      console.error(stderr);
    }

    process.exit(1);
  }

  if (stderr?.trim()) {
    console.warn("⚠️ pg_dump warnings:");
    console.warn(stderr);
  }

  console.log("✅ Database dump completed successfully!");
});
