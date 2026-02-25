import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });

import { runOnce } from "./runOnce";

async function main() {
  console.log("Worker starting...");
  const processed = await runOnce(15);
  console.log(`Worker done. Processed ${processed} job(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Worker crashed:", err);
  process.exit(1);
});
