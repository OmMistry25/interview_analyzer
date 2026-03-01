import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

import { createClient } from "@supabase/supabase-js";
import { runQualifiedExtraction, runWeeklyAnalysis } from "../analysis/geoAnalysisPipeline";

async function main() {
  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  console.log("Running GEO phrase extraction on Qualified calls...\n");
  const extraction = await runQualifiedExtraction(db);
  console.log(`\nExtraction complete: ${extraction.callsProcessed} calls processed\n`);

  console.log("Running weekly analysis to aggregate phrases...\n");
  const analysis = await runWeeklyAnalysis(db);
  console.log(`\nAnalysis complete: ${analysis.uniquePhrases} unique phrases ranked`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
