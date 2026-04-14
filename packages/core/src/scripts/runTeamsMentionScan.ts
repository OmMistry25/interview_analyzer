import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

import { getServiceClient } from "../storage/db";
import { runTeamsMentionScan, type TeamsScanPopulation } from "../analysis/teamsStackContextScan";
import { patchCompanyProperty } from "../enrichment/hubspot";
import { resolveHubSpotCompanyIdForCall } from "../enrichment/teamsHubSpotResolve";

function parseFlags(): {
  population: TeamsScanPopulation;
  hubspotApply: boolean;
  logPath: string | null;
} {
  const argv = process.argv.slice(2);
  const qualifiedOnly = argv.includes("--qualified-only");
  const hubspotApply = argv.includes("--apply");
  const logArg = argv.find((a) => a.startsWith("--log="));
  const logPath = logArg ? logArg.slice("--log=".length).trim() || null : null;
  return {
    population: qualifiedOnly ? "qualified_only" : "all_fathom",
    hubspotApply,
    logPath,
  };
}

function appendLog(filePath: string, line: string): void {
  try {
    fs.appendFileSync(filePath, `${new Date().toISOString()} ${line}\n`, "utf8");
  } catch {
    // ignore log IO errors
  }
}

async function main() {
  const { population, hubspotApply, logPath } = parseFlags();
  const db = getServiceClient();

  const defaultLog =
    logPath ?? path.resolve(process.cwd(), "teams_hubspot_apply_log.txt");

  console.log(
    `Population: ${population}${hubspotApply ? " | HubSpot: APPLY (PATCH)" : " | HubSpot: dry-run (no PATCH)"}\n`
  );

  const result = await runTeamsMentionScan(db, { population });

  console.log("\nScan done.");
  console.log(`  Run id: ${result.runId}`);
  console.log(`  Input calls: ${result.inputCallCount}`);
  console.log(`  Scanned: ${result.scannedCount}`);
  console.log(`  Hits: ${result.hitCount}`);

  if (result.hitCallIds.length === 0) {
    console.log("\nNo hits — skipping HubSpot resolution.");
    return;
  }

  const hsKey = process.env.HUBSPOT_API_KEY;
  if (!hsKey) {
    console.warn("\nHUBSPOT_API_KEY not set — skipping company resolution and tagging.");
    return;
  }

  const tagProperty = process.env.HUBSPOT_COMPANY_TEAMS_TAG_PROPERTY;
  const tagValue = process.env.HUBSPOT_COMPANY_TEAMS_TAG_VALUE ?? "true";

  if (hubspotApply && !tagProperty) {
    throw new Error(
      "HUBSPOT_COMPANY_TEAMS_TAG_PROPERTY must be set when using --apply (internal HubSpot company property name)."
    );
  }

  console.log(`\nResolving HubSpot companies for ${result.hitCallIds.length} hit(s)...`);

  let resolved = 0;
  let patched = 0;
  let skipped = 0;

  for (const callId of result.hitCallIds) {
    let companyId: string | null = null;
    let detail = "";
    try {
      const r = await resolveHubSpotCompanyIdForCall(db, callId);
      companyId = r.companyId;
      detail = r.detail;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const line = `call=${callId} error=${msg}`;
      console.warn(`  ${line}`);
      appendLog(defaultLog, line);
      continue;
    }

    if (!companyId) {
      const line = `call=${callId} unresolved ${detail}`;
      console.log(`  ${line}`);
      appendLog(defaultLog, line);
      continue;
    }

    resolved++;
    if (hubspotApply && tagProperty) {
      const { skipped: didSkip } = await patchCompanyProperty(companyId, tagProperty, tagValue, {
        skipIfUnchanged: true,
      });
      if (didSkip) skipped++;
      else patched++;
      const line = `call=${callId} company=${companyId} ${detail} PATCH ${didSkip ? "skipped_unchanged" : "applied"}`;
      console.log(`  ${line}`);
      appendLog(defaultLog, line);
    } else {
      const line = `call=${callId} company=${companyId} ${detail} dry-run would set ${tagProperty ?? "(set HUBSPOT_COMPANY_TEAMS_TAG_PROPERTY)"}=${JSON.stringify(tagValue)}`;
      console.log(`  ${line}`);
      appendLog(defaultLog, line);
    }
  }

  console.log(`\nHubSpot summary: resolved=${resolved} patched=${patched} skipped_unchanged=${skipped}`);
  console.log(`Log: ${defaultLog}`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
