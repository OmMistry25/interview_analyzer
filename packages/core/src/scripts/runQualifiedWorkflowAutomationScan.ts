import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

import { getServiceClient } from "../storage/db";
import { runQualifiedWorkflowAutomationScan } from "../analysis/workflowAutomationProspectScan";

async function main() {
  const db = getServiceClient();

  console.log("Running Qualified-call workflow + automation (prospect) scan...\n");
  const result = await runQualifiedWorkflowAutomationScan(db);
  console.log("\nDone.");
  console.log(`  Run id: ${result.runId}`);
  console.log(`  Qualified calls (latest eval): ${result.qualifiedCallCount}`);
  console.log(`  Scanned: ${result.scannedCount}`);
  console.log(`  Hits: ${result.hitCount}`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
