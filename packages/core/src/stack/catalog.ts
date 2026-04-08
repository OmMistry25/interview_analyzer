/**
 * Curated vendor / product catalog for post-extraction normalization.
 * Extend via aliases (lowercase phrases); avoid ambiguous single-token aliases where possible.
 */
export type StackCategory =
  | "collaboration"
  | "workspace"
  | "idp"
  | "itsm"
  | "mdm"
  | "knowledge"
  | "security"
  | "ai_employee"
  | "automation";

export type StackCatalogEntry = {
  id: string;
  category: StackCategory;
  label: string;
  aliases: string[];
};

export const STACK_CATALOG: StackCatalogEntry[] = [
  // Collaboration
  { id: "slack", category: "collaboration", label: "Slack", aliases: ["slack"] },
  {
    id: "microsoft_teams",
    category: "collaboration",
    label: "Microsoft Teams",
    aliases: ["microsoft teams", "ms teams", "msteams"],
  },
  { id: "zoom", category: "collaboration", label: "Zoom", aliases: ["zoom", "zoom chat"] },
  {
    id: "webex",
    category: "collaboration",
    label: "Webex",
    aliases: ["webex", "cisco webex", "webex teams"],
  },
  { id: "google_chat", category: "collaboration", label: "Google Chat", aliases: ["google chat", "g chat"] },

  // Workspace / productivity
  {
    id: "google_workspace",
    category: "workspace",
    label: "Google Workspace",
    aliases: [
      "google workspace",
      "g suite",
      "gsuite",
      "google apps",
      "workspace google",
    ],
  },
  {
    id: "microsoft_365",
    category: "workspace",
    label: "Microsoft 365",
    aliases: ["microsoft 365", "m365", "office 365", "o365", "microsoft office 365"],
  },

  // Identity / access
  { id: "okta", category: "idp", label: "Okta", aliases: ["okta"] },
  {
    id: "entra_id",
    category: "idp",
    label: "Microsoft Entra ID",
    aliases: [
      "entra id",
      "entra",
      "azure ad",
      "azure active directory",
      "aad",
      "microsoft entra",
    ],
  },
  {
    id: "ping_identity",
    category: "idp",
    label: "Ping Identity",
    aliases: ["ping identity", "pingone", "ping federate", "pingfederate", "ping access"],
  },
  { id: "onelogin", category: "idp", label: "OneLogin", aliases: ["onelogin", "one login"] },
  { id: "jumpcloud", category: "idp", label: "JumpCloud", aliases: ["jumpcloud", "jump cloud"] },
  { id: "auth0", category: "idp", label: "Auth0", aliases: ["auth0", "auth 0"] },
  {
    id: "cyberark_identity",
    category: "idp",
    label: "CyberArk Identity",
    aliases: ["cyberark", "cyberark identity", "idaptive"],
  },
  {
    id: "forgerock",
    category: "idp",
    label: "ForgeRock / Ping",
    aliases: ["forgerock", "forge rock", "openam"],
  },
  { id: "ibm_verify", category: "idp", label: "IBM Security Verify", aliases: ["ibm verify", "ibm security verify"] },
  { id: "oracle_idm", category: "idp", label: "Oracle IAM", aliases: ["oracle identity", "oracle iam", "oracle oim"] },
  { id: "sap_identity", category: "idp", label: "SAP Identity", aliases: ["sap cloud identity", "sap idm", "sap identity"] },
  { id: "keycloak", category: "idp", label: "Keycloak", aliases: ["keycloak"] },
  { id: "miniorange", category: "idp", label: "miniOrange", aliases: ["miniorange", "mini orange"] },
  { id: "duo", category: "security", label: "Duo / Cisco Duo", aliases: ["duo security", "cisco duo", "duo mfa"] },

  // ITSM / service desk
  {
    id: "servicenow",
    category: "itsm",
    label: "ServiceNow",
    aliases: ["servicenow", "service now", "snow itsm"],
  },
  {
    id: "jira_service_management",
    category: "itsm",
    label: "Jira Service Management",
    aliases: [
      "jira service management",
      "jsm",
      "jira service desk",
      "atlassian jira",
      "jira itsm",
    ],
  },
  { id: "freshservice", category: "itsm", label: "Freshservice", aliases: ["freshservice", "fresh service"] },
  { id: "freshdesk", category: "itsm", label: "Freshdesk", aliases: ["freshdesk"] },
  { id: "zendesk", category: "itsm", label: "Zendesk", aliases: ["zendesk"] },
  {
    id: "ivanti",
    category: "itsm",
    label: "Ivanti",
    aliases: ["ivanti", "ivanti neurons", "cherwell", "heat software"],
  },
  { id: "bmc_helix", category: "itsm", label: "BMC Helix", aliases: ["bmc helix", "bmc remedy", "remedy itsm"] },
  {
    id: "manageengine",
    category: "itsm",
    label: "ManageEngine",
    aliases: ["manageengine", "manage engine", "servicedesk plus", "service desk plus"],
  },
  {
    id: "solarwinds",
    category: "itsm",
    label: "SolarWinds",
    aliases: ["solarwinds", "solar winds", "samanage"],
  },
  { id: "sysaid", category: "itsm", label: "SysAid", aliases: ["sysaid"] },
  { id: "halo_itsm", category: "itsm", label: "HaloITSM", aliases: ["halo itsm", "haloitsm", "halo service desk"] },
  { id: "topdesk", category: "itsm", label: "TOPdesk", aliases: ["topdesk", "top desk"] },
  { id: "4me", category: "itsm", label: "4me", aliases: ["4me"] },
  { id: "teamdynamix", category: "itsm", label: "TeamDynamix", aliases: ["teamdynamix", "team dynamix"] },
  { id: "easyvista", category: "itsm", label: "EasyVista", aliases: ["easyvista", "easy vista"] },
  {
    id: "salesforce_service_cloud",
    category: "itsm",
    label: "Salesforce Service Cloud",
    aliases: ["salesforce service cloud", "sf service cloud"],
  },

  // MDM / endpoint
  { id: "jamf", category: "mdm", label: "Jamf", aliases: ["jamf", "jamf pro"] },
  { id: "kandji", category: "mdm", label: "Kandji", aliases: ["kandji"] },
  {
    id: "intune",
    category: "mdm",
    label: "Microsoft Intune",
    aliases: ["intune", "microsoft intune", "endpoint manager", "microsoft endpoint manager"],
  },
  { id: "workspace_one", category: "mdm", label: "Workspace ONE", aliases: ["workspace one", "vmware workspace one", "airwatch"] },
  { id: "addigy", category: "mdm", label: "Addigy", aliases: ["addigy"] },
  { id: "mosyle", category: "mdm", label: "Mosyle", aliases: ["mosyle"] },
  { id: "hexnode", category: "mdm", label: "Hexnode", aliases: ["hexnode"] },

  // Knowledge / wiki
  { id: "confluence", category: "knowledge", label: "Confluence", aliases: ["confluence", "atlassian confluence"] },
  { id: "notion", category: "knowledge", label: "Notion", aliases: ["notion"] },
  { id: "sharepoint", category: "knowledge", label: "SharePoint", aliases: ["sharepoint", "sharepoint online"] },
  { id: "gitbook", category: "knowledge", label: "GitBook", aliases: ["gitbook"] },
  { id: "guru", category: "knowledge", label: "Guru", aliases: ["guru"] },

  // AI employee / IT automation (competitive landscape)
  { id: "moveworks", category: "ai_employee", label: "Moveworks", aliases: ["moveworks", "move works"] },
  { id: "aisera", category: "ai_employee", label: "Aisera", aliases: ["aisera"] },
  { id: "rezolve_ai", category: "ai_employee", label: "Rezolve.ai", aliases: ["rezolve.ai", "rezolve ai", "rezolve"] },
  { id: "serv", category: "ai_employee", label: "Serv", aliases: ["serv"] },
  { id: "harmoni", category: "ai_employee", label: "Harmoni", aliases: ["harmoni"] },
  { id: "sysaid_ai", category: "ai_employee", label: "SysAid AI", aliases: ["sysaid ai"] },

  // Workflow / iPaaS
  { id: "workato", category: "automation", label: "Workato", aliases: ["workato"] },
  { id: "zapier", category: "automation", label: "Zapier", aliases: ["zapier"] },
  { id: "make", category: "automation", label: "Make (Integromat)", aliases: ["make.com", "integromat"] },
  { id: "credal", category: "automation", label: "Credal", aliases: ["credal"] },
];

const byId: Record<string, StackCatalogEntry> = {};
for (const e of STACK_CATALOG) {
  byId[e.id] = e;
}

export const STACK_CATALOG_BY_ID: Readonly<Record<string, StackCatalogEntry>> = byId;

export function stackCatalogLabel(id: string): string {
  return STACK_CATALOG_BY_ID[id]?.label ?? id.replace(/_/g, " ");
}
