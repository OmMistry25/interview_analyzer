/**
 * Console product use-case taxonomy v1 (closed enum).
 * Bump schema_version and prompt file when adding or renaming ids.
 *
 * `workflow_automation` = product “workflow automation” (cross-tool / approval flows), not generic RPA.
 */
export const CONSOLE_USE_CASE_IDS = [
  "employee_lifecycle",
  "access_requests",
  "knowledge_deflection",
  "itsm_service_desk",
  "device_mdm",
  "identity_governance",
  "msp_multi_tenant",
  "workflow_automation",
  "compliance_audit",
  "ai_assisted_support",
] as const;

export type ConsoleUseCaseId = (typeof CONSOLE_USE_CASE_IDS)[number];

/** Short labels for UI / Slack (not shown to the LLM as authoritative — prompt has full defs). */
export const CONSOLE_USE_CASE_LABELS: Record<ConsoleUseCaseId, string> = {
  employee_lifecycle: "Employee lifecycle (joiners / leavers)",
  access_requests: "Access requests & approvals",
  knowledge_deflection: "Knowledge & self-serve",
  itsm_service_desk: "ITSM / service desk & tickets",
  device_mdm: "Devices & MDM",
  identity_governance: "Identity, SSO & provisioning",
  msp_multi_tenant: "MSP / multi-tenant IT",
  workflow_automation: "Workflow automation (cross-tool orchestration & approvals)",
  compliance_audit: "Compliance & access reviews",
  ai_assisted_support: "AI-assisted IT / support",
};

export function consoleUseCaseLabel(id: ConsoleUseCaseId): string {
  return CONSOLE_USE_CASE_LABELS[id] ?? id;
}

/** For JSON persisted ids (may include future unknowns). */
export function consoleUseCaseLabelFromJson(id: string): string {
  if ((CONSOLE_USE_CASE_IDS as readonly string[]).includes(id)) {
    return CONSOLE_USE_CASE_LABELS[id as ConsoleUseCaseId];
  }
  return id.replace(/_/g, " ");
}
