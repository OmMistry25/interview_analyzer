"use client";

import { useState, useEffect } from "react";
import type { ExtractedSignals as CoreExtractedSignals } from "@transcript-evaluator/core/src/extraction/schemas";
import {
  formatCompetitorsMentionedForDigest,
  shouldShowParticipantTitle,
  shouldUseNoShowSlackLayout,
} from "@transcript-evaluator/core/src/formatting/slackPayload";
import { consoleUseCaseLabelFromJson } from "@transcript-evaluator/core/src/consoleUseCases/taxonomy";
import { stackCatalogLabel } from "@transcript-evaluator/core/src/stack/catalog";

interface BantScore {
  score: number;
  rationale: string;
}

type S1ChecklistAnswer = "yes" | "no" | "unclear";

interface S1ChecklistItemJson {
  answer: S1ChecklistAnswer;
  rationale: string;
  evidence_quotes?: string[];
}

interface S1OpportunityChecklistJson {
  active_project_or_initiative: S1ChecklistItemJson;
  defined_timeline: S1ChecklistItemJson;
  clear_pain: S1ChecklistItemJson;
  next_steps_confirmed: S1ChecklistItemJson;
  stakeholder_access: S1ChecklistItemJson;
}

interface EvaluationJson {
  bant_scores: {
    budget: BantScore;
    authority: BantScore;
    need: BantScore;
    timing: BantScore;
  };
  stage_1_probability: number;
  stage_1_reasoning: string;
  overall_status: string;
  s1_type?: string;
  icp_fit?: string;
  green_flags?: string[];
  red_flags?: string[];
  call_notes: string;
  coaching_notes?: string[];
  next_steps?: string[];
  score: number;
  s1_opportunity_checklist?: S1OpportunityChecklistJson;
  s1_checklist_yes_count?: number;
}

const S1_CHECKLIST_ROWS: { key: keyof S1OpportunityChecklistJson; label: string }[] = [
  { key: "active_project_or_initiative", label: "Active project or initiative" },
  { key: "defined_timeline", label: "Defined timeline (eval / decision)" },
  { key: "clear_pain", label: "Clear pain (Console fit)" },
  { key: "next_steps_confirmed", label: "Next steps scheduled or verbally confirmed" },
  { key: "stakeholder_access", label: "Stakeholder access" },
];

function s1ChecklistYesCountFromRows(checklist: S1OpportunityChecklistJson): number {
  return S1_CHECKLIST_ROWS.filter(({ key }) => checklist[key].answer === "yes").length;
}

/** Stored `overall_status` stays Qualified/Needs Work/Unqualified; UI shows No show when copy clearly indicates prospect absence. */
function evaluationDisplayStatus(evaluation: EvaluationJson): string {
  return shouldUseNoShowSlackLayout(evaluation) ? "No show" : evaluation.overall_status;
}

interface SignalField {
  value: unknown;
  evidence: string[];
}

interface BantGroupSignals {
  [key: string]: SignalField;
}

interface QualificationSignals {
  demo_requested: boolean;
  poc_mentioned: boolean;
  nda_mentioned: boolean;
  actively_evaluating_tools: boolean;
  multiple_stakeholders_present: boolean;
  competitor_bucket: string;
  competitor_is_active_customer: boolean;
}

interface ExtractedSignals {
  budget: BantGroupSignals;
  authority: BantGroupSignals;
  need: BantGroupSignals;
  timing: BantGroupSignals;
  account: BantGroupSignals & {
    tech_stack?: Record<string, unknown>;
    it_team_structure?: Record<string, unknown>;
    icp_fit?: string;
  };
  qualification_signals?: QualificationSignals;
  participant_titles: { name: string; title: string; role_in_deal: string }[];
  call_summary: string;
  stack_mentions?: { mention: string; evidence: string[] }[];
  stack_canonical_hits?: string[];
}

interface Participant {
  name: string;
  role: string;
}

interface ConsoleUseCasesItem {
  id: string;
  confidence: string;
  evidence?: string[];
  summary?: string;
}

interface ConsoleUseCasesJson {
  schema_version?: number;
  items?: ConsoleUseCasesItem[];
  skipped_reason?: string;
}

interface DealBriefJson {
  contacts?: { name: string; role_summary: string; evidence?: string[] }[];
  stack?: { summary: string; tools?: string[]; evidence?: string[] };
  catalyst_why_now?: { summary: string; evidence?: string[] };
  scope_and_intake?: { summary: string; evidence?: string[] };
  pain_points?: { summary: string; evidence?: string[] }[];
  what_they_want_next?: string[];
  parallel_tracks?: string[];
  discovery?: { summary: string; evidence?: string[] };
  next_steps?: { summary: string; evidence?: string[] };
}

interface CallDetailTabsProps {
  evaluation: EvaluationJson | null;
  signals: ExtractedSignals | null;
  dealBrief?: Record<string, unknown> | null;
  /** When set (including null), show Console use cases UI; omit when dashboard env disables the column. */
  consoleUseCases?: ConsoleUseCasesJson | null;
  participants: Participant[];
  aeName: string | null;
  accountName: string | null;
}

export default function CallDetailTabs({
  evaluation,
  signals,
  dealBrief,
  consoleUseCases,
  participants,
  aeName,
  accountName,
}: CallDetailTabsProps) {
  const brief = dealBrief as DealBriefJson | null;
  const hasBrief = !!(brief && Object.keys(brief).length > 0);
  const [view, setView] = useState<"brief" | "ae" | "growth">(() => (hasBrief ? "brief" : "ae"));

  useEffect(() => {
    if (view === "brief" && !hasBrief) setView("ae");
  }, [view, hasBrief]);

  if (!evaluation && !signals) {
    return <p className="mt-24" style={{ color: "var(--text-tertiary)" }}>Processing not yet completed for this call.</p>;
  }

  return (
    <div className="mt-24">
      <div className="tab-bar">
        {hasBrief ? (
          <button
            onClick={() => setView("brief")}
            className={`tab ${view === "brief" ? "tab-active" : ""}`}
          >
            AE Brief
          </button>
        ) : null}
        <button
          onClick={() => setView("ae")}
          className={`tab ${view === "ae" ? "tab-active" : ""}`}
        >
          AE View
        </button>
        <button
          onClick={() => setView("growth")}
          className={`tab ${view === "growth" ? "tab-active" : ""}`}
        >
          Growth Team
        </button>
      </div>

      {view === "brief" && brief ? (
        <BriefView brief={brief} />
      ) : view === "ae" ? (
        <AEView evaluation={evaluation} signals={signals} consoleUseCases={consoleUseCases} />
      ) : (
        <GrowthView
          evaluation={evaluation}
          signals={signals}
          consoleUseCases={consoleUseCases}
          participants={participants}
          aeName={aeName}
          accountName={accountName}
        />
      )}
    </div>
  );
}

function BriefView({ brief }: { brief: DealBriefJson }) {
  return (
    <section className="card" style={{ lineHeight: 1.75 }}>
      <p className="page-meta" style={{ marginBottom: 20 }}>
        Second-pass synthesis from the transcript (with quotes). Reprocess the call after deploying to generate if empty.
      </p>

      {brief.contacts && brief.contacts.length > 0 ? (
        <div className="mb-16">
          <h3 className="section-title">Contacts</h3>
          <ul className="list-clean">
            {brief.contacts.map((c, i) => (
              <li key={i}>
                <strong>{c.name}</strong>
                {c.role_summary ? ` — ${c.role_summary}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {brief.stack?.summary ? (
        <div className="mb-16">
          <h3 className="section-title">Stack</h3>
          <p style={{ color: "var(--text-secondary)" }}>{brief.stack.summary}</p>
          {brief.stack.tools && brief.stack.tools.length > 0 ? (
            <p className="mt-8" style={{ fontSize: 13 }}>
              <span className="digest-label">Tools: </span>
              {brief.stack.tools.join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {brief.catalyst_why_now?.summary ? (
        <div className="mb-16">
          <h3 className="section-title">Why now</h3>
          <p style={{ color: "var(--text-secondary)" }}>{brief.catalyst_why_now.summary}</p>
        </div>
      ) : null}

      {brief.scope_and_intake?.summary ? (
        <div className="mb-16">
          <h3 className="section-title">Scope & intake</h3>
          <p style={{ color: "var(--text-secondary)" }}>{brief.scope_and_intake.summary}</p>
        </div>
      ) : null}

      {brief.pain_points && brief.pain_points.length > 0 ? (
        <div className="mb-16">
          <h3 className="section-title">Pain points</h3>
          <ul className="list-clean">
            {brief.pain_points.map((p, i) => (
              <li key={i} style={{ color: "var(--text-secondary)" }}>{p.summary}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {brief.what_they_want_next && brief.what_they_want_next.length > 0 ? (
        <div className="mb-16">
          <h3 className="section-title">What they want next</h3>
          <ul className="list-clean">
            {brief.what_they_want_next.map((w, i) => (
              <li key={i} style={{ color: "var(--text-secondary)" }}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {brief.parallel_tracks && brief.parallel_tracks.length > 0 ? (
        <div className="mb-16">
          <h3 className="section-title">Parallel tracks</h3>
          <ul className="list-clean">
            {brief.parallel_tracks.map((t, i) => (
              <li key={i} style={{ color: "var(--text-secondary)" }}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {brief.discovery?.summary ? (
        <div className="mb-16">
          <h3 className="section-title">Discovery</h3>
          <p style={{ color: "var(--text-secondary)" }}>{brief.discovery.summary}</p>
        </div>
      ) : null}

      {brief.next_steps?.summary ? (
        <div className="mb-16">
          <h3 className="section-title">Next steps</h3>
          <p style={{ color: "var(--text-secondary)" }}>{brief.next_steps.summary}</p>
        </div>
      ) : null}
    </section>
  );
}

function AEView({
  evaluation,
  signals,
  consoleUseCases,
}: {
  evaluation: EvaluationJson | null;
  signals: ExtractedSignals | null;
  consoleUseCases?: ConsoleUseCasesJson | null;
}) {
  return (
    <>
      {evaluation && (
        <section className="card">
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
            <span className={`badge ${statusBadgeClass(evaluationDisplayStatus(evaluation))}`} style={{ fontSize: 13 }}>
              {evaluationDisplayStatus(evaluation)}
            </span>
            {evaluation.s1_type && evaluation.s1_type !== "not_s1" && (
              <span className={`badge ${evaluation.s1_type === "sell_s1" ? "badge-green" : "badge-amber"}`} style={{ fontSize: 12 }}>
                {evaluation.s1_type === "sell_s1" ? "Sell S1" : "Chase S1"}
              </span>
            )}
            {evaluation.icp_fit && evaluation.icp_fit !== "unknown" && (
              <span className={`badge ${icpFitBadgeClass(evaluation.icp_fit)}`} style={{ fontSize: 12 }}>
                ICP: {evaluation.icp_fit.replace(/_/g, " ")}
              </span>
            )}
            <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              Stage 1: <strong>{evaluation.stage_1_probability}%</strong>
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
            {evaluation.stage_1_reasoning}
          </p>

          {consoleUseCases !== undefined ? <ConsoleUseCasesSection data={consoleUseCases} /> : null}

          {evaluation.s1_opportunity_checklist && (
            <div className="mb-20">
              <h3 className="section-title">S1 opportunity checklist</h3>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                <strong>
                  {evaluation.s1_checklist_yes_count ?? s1ChecklistYesCountFromRows(evaluation.s1_opportunity_checklist)}
                  /5
                </strong>{" "}
                yes — heuristic scan (unclear counts as not yes).
              </p>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: "32%" }}>Question</th>
                    <th style={{ width: "12%" }}>Answer</th>
                    <th>Rationale & evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {S1_CHECKLIST_ROWS.map(({ key, label }) => {
                    const row = evaluation.s1_opportunity_checklist![key];
                    return (
                      <tr key={key}>
                        <td style={{ fontWeight: 500 }}>{label}</td>
                        <td>
                          <span className={`badge ${s1ChecklistAnswerBadgeClass(row.answer)}`} style={{ fontSize: 11, fontWeight: 500 }}>
                            {row.answer}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{row.rationale}</span>
                          {row.evidence_quotes && row.evidence_quotes.length > 0
                            ? row.evidence_quotes.map((q, i) => (
                                <blockquote key={i} className="evidence-quote">
                                  &ldquo;{q}&rdquo;
                                </blockquote>
                              ))
                            : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="section-title">BANT Scores</h3>
          <div className="bant-grid">
            {(["budget", "authority", "need", "timing"] as const).map((dim) => {
              const s = evaluation.bant_scores[dim];
              return (
                <div key={dim} className="bant-card">
                  <div className="bant-card-header">
                    <span className="bant-card-label">{dim}</span>
                    <ScorePips score={s.score} />
                  </div>
                  <p className="bant-card-rationale">{s.rationale}</p>
                </div>
              );
            })}
          </div>

          {(evaluation.green_flags?.length || evaluation.red_flags?.length) ? (
            <div className="mt-20" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {evaluation.green_flags && evaluation.green_flags.length > 0 && (
                <div style={{ flex: "1 1 280px" }}>
                  <h3 className="section-title">Green Flags</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {evaluation.green_flags.map((flag, i) => (
                      <span key={i} className="badge badge-green" style={{ fontSize: 12, fontWeight: 400 }}>{flag}</span>
                    ))}
                  </div>
                </div>
              )}
              {evaluation.red_flags && evaluation.red_flags.length > 0 && (
                <div style={{ flex: "1 1 280px" }}>
                  <h3 className="section-title">Red Flags</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {evaluation.red_flags.map((flag, i) => (
                      <span key={i} className="badge badge-red" style={{ fontSize: 12, fontWeight: 400 }}>{flag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {(evaluation.coaching_notes?.length ?? 0) > 0 && (
            <div className="mt-20">
              <h3 className="section-title">Coaching Notes</h3>
              <ul className="list-clean">
                {evaluation.coaching_notes!.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {(evaluation.next_steps?.length ?? 0) > 0 && (
            <div className="mt-16">
              <h3 className="section-title">Next Steps</h3>
              <ul className="list-clean">
                {evaluation.next_steps!.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {signals && <SignalsTable signals={signals} />}
    </>
  );
}

/** Maps extractor `account.tech_stack` boolean keys to stack catalog ids for labels + dedupe with `stack_canonical_hits`. */
const TECH_STACK_BOOLEAN_TO_CATALOG_ID: Record<string, string> = {
  slack: "slack",
  teams: "microsoft_teams",
  okta: "okta",
  google_workspace: "google_workspace",
  entra_ad: "entra_id",
};

function growthTechStackLabels(signals: ExtractedSignals): string[] {
  const hits = signals.stack_canonical_hits ?? [];
  const canonicalIds = new Set(hits);
  const seenNorm = new Set<string>();
  const out: string[] = [];

  const push = (label: string) => {
    const n = label.trim().toLowerCase();
    if (seenNorm.has(n)) return;
    seenNorm.add(n);
    out.push(label);
  };

  for (const id of hits) {
    push(stackCatalogLabel(id));
  }

  const ts = signals.account?.tech_stack;
  if (!ts) return out;

  for (const [key, val] of Object.entries(ts)) {
    if (val !== true) continue;
    const catId = TECH_STACK_BOOLEAN_TO_CATALOG_ID[key];
    if (catId && canonicalIds.has(catId)) continue;
    if (catId) {
      push(stackCatalogLabel(catId));
    } else {
      push(key.replace(/_/g, " "));
    }
  }

  return out;
}

function ConsoleUseCasesSection({
  data,
}: {
  data: ConsoleUseCasesJson | null;
}) {
  const items = data?.items ?? [];
  const skipped = data?.skipped_reason;

  let body: React.ReactNode;
  if (skipped === "no_show") {
    body = (
      <span className="digest-value" style={{ color: "var(--text-secondary)" }}>
        — (no transcript)
      </span>
    );
  } else if (items.length > 0) {
    body = (
      <div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {items.map((it, idx) => (
            <span
              key={`${it.id}-${idx}`}
              className="badge badge-blue"
              style={{ fontSize: 12, fontWeight: 400 }}
              title={it.summary ?? undefined}
            >
              {consoleUseCaseLabelFromJson(it.id)} ({it.confidence})
            </span>
          ))}
        </div>
        <ul className="list-clean mt-8" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {items.map((it, evIdx) =>
            it.evidence && it.evidence.length > 0 ? (
              <li key={`${it.id}-ev-${evIdx}`}>
                <strong>{consoleUseCaseLabelFromJson(it.id)}:</strong>{" "}
                {it.evidence.map((q, i) => (
                  <span key={i} style={{ display: "block", marginTop: 4, fontStyle: "italic" }}>
                    &ldquo;{q}&rdquo;
                  </span>
                ))}
              </li>
            ) : null
          )}
        </ul>
      </div>
    );
  } else {
    body = (
      <span className="digest-value" style={{ color: "var(--text-secondary)" }}>
        —
      </span>
    );
  }

  return (
    <div className="mb-12">
      <span className="digest-label" style={{ display: "block", marginBottom: 8 }}>
        Console use cases
      </span>
      {body}
    </div>
  );
}

function GrowthView({
  evaluation,
  signals,
  consoleUseCases,
  participants,
  aeName,
  accountName,
}: {
  evaluation: EvaluationJson | null;
  signals: ExtractedSignals | null;
  consoleUseCases?: ConsoleUseCasesJson | null;
  participants: Participant[];
  aeName: string | null;
  accountName: string | null;
}) {
  const participantTitles = signals?.participant_titles ?? [];

  const participantDisplay = participants.map((p) => {
    const titleInfo = participantTitles.find(
      (t) => t.name.toLowerCase() === p.name.toLowerCase()
    );
    if (!titleInfo) return p.name;
    if (!shouldShowParticipantTitle(titleInfo.title)) return p.name;
    return `${p.name} — ${titleInfo.title}`;
  });

  const competitorsLine = signals
    ? formatCompetitorsMentionedForDigest(signals as unknown as CoreExtractedSignals)
    : "";

  const prospectAbsentUi = evaluation ? shouldUseNoShowSlackLayout(evaluation) : false;

  return (
    <section className="card" style={{ lineHeight: 1.8 }}>
      <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
        {prospectAbsentUi
          ? `${aeName ?? "AE"} / ${accountName ?? "Unknown Account"} — prospect did not join`
          : `${aeName ?? "AE"} just met with ${accountName ?? "Unknown Account"}`}
      </p>

      <div className="mb-12">
        <span className="digest-label" style={{ display: "block", marginBottom: 8 }}>
          Tech stack
        </span>
        {!signals ? (
          <span className="digest-value" style={{ color: "var(--text-secondary)" }}>
            —
          </span>
        ) : (() => {
            const labels = growthTechStackLabels(signals);
            return labels.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {labels.map((label) => (
                  <span key={label} className="badge badge-green" style={{ fontSize: 12, fontWeight: 400 }}>
                    {label}
                  </span>
                ))}
              </div>
            ) : (
              <span className="digest-value" style={{ color: "var(--text-secondary)" }}>
                —
              </span>
            );
          })()}
      </div>

      {consoleUseCases !== undefined ? <ConsoleUseCasesSection data={consoleUseCases} /> : null}

      <div className="mb-12">
        <span className="digest-label" style={{ display: "block", marginBottom: 8 }}>
          Competitors
        </span>
        {competitorsLine ? (
          <span className="digest-value">{competitorsLine}</span>
        ) : (
          <span className="digest-value" style={{ color: "var(--text-secondary)" }}>
            —
          </span>
        )}
      </div>

      <DigestRow label="Participants" value={participantDisplay.join(", ") || "—"} />
      <DigestRow label="Call Notes" value={evaluation?.call_notes ?? signals?.call_summary ?? "—"} />

      <hr className="digest-divider" />

      <DigestRow
        label="Budget"
        value={evaluation ? `${evaluation.bant_scores.budget.rationale} (${evaluation.bant_scores.budget.score}/5)` : "—"}
      />
      <DigestRow
        label="Authority"
        value={evaluation ? `${evaluation.bant_scores.authority.rationale} (${evaluation.bant_scores.authority.score}/5)` : "—"}
      />
      <DigestRow
        label="Need"
        value={evaluation ? `${evaluation.bant_scores.need.rationale} (${evaluation.bant_scores.need.score}/5)` : "—"}
      />
      <DigestRow
        label="Timing"
        value={evaluation ? `${evaluation.bant_scores.timing.rationale} (${evaluation.bant_scores.timing.score}/5)` : "—"}
      />

      <hr className="digest-divider" />

      <p className="digest-row">
        <span className="digest-label">Status: </span>
        {evaluation?.overall_status ? (
          <span className={`badge ${statusBadgeClass(evaluationDisplayStatus(evaluation))}`} style={{ fontSize: 14 }}>
            {evaluationDisplayStatus(evaluation)}
          </span>
        ) : (
          <span className="digest-value">—</span>
        )}
        {evaluation?.s1_type && evaluation.s1_type !== "not_s1" ? (
          <span
            className={`badge ${evaluation.s1_type === "sell_s1" ? "badge-green" : "badge-amber"}`}
            style={{ fontSize: 12, marginLeft: 8 }}
          >
            {evaluation.s1_type === "sell_s1" ? "Sell S1" : "Chase S1"}
          </span>
        ) : null}
      </p>
      {evaluation?.stage_1_reasoning ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4, marginBottom: 0 }}>
          {evaluation.stage_1_reasoning}
        </p>
      ) : null}

      {evaluation?.s1_opportunity_checklist != null && (
        <DigestRow
          label="S1 checklist"
          value={`${evaluation.s1_checklist_yes_count ?? s1ChecklistYesCountFromRows(evaluation.s1_opportunity_checklist)}/5 yes (open AE tab for detail)`}
        />
      )}

      {evaluation?.icp_fit && evaluation.icp_fit !== "unknown" && (
        <DigestRow label="ICP Fit" value={evaluation.icp_fit.replace(/_/g, " ")} />
      )}

      {evaluation?.green_flags && evaluation.green_flags.length > 0 && (
        <div className="digest-row">
          <span className="digest-label">Green Flags: </span>
          <span className="digest-value">{evaluation.green_flags.join(" · ")}</span>
        </div>
      )}

      {evaluation?.red_flags && evaluation.red_flags.length > 0 && (
        <div className="digest-row">
          <span className="digest-label">Red Flags: </span>
          <span className="digest-value">{evaluation.red_flags.join(" · ")}</span>
        </div>
      )}
    </section>
  );
}

function DigestRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="digest-row">
      <span className="digest-label">{label}: </span>
      <span className="digest-value">{value}</span>
    </p>
  );
}

function ScorePips({ score }: { score: number }) {
  const colorClass = score >= 4 ? "score-pip-filled-green" : score >= 3 ? "score-pip-filled-amber" : "score-pip-filled-red";
  return (
    <span className="score-pips">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`score-pip ${i <= score ? colorClass : ""}`} />
      ))}
    </span>
  );
}

function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    Qualified: "badge-green",
    "Needs Work": "badge-amber",
    Unqualified: "badge-red",
    "No show": "badge-gray",
  };
  return map[status] ?? "badge-gray";
}

function s1ChecklistAnswerBadgeClass(answer: S1ChecklistAnswer): string {
  if (answer === "yes") return "badge-green";
  if (answer === "no") return "badge-gray";
  return "badge-amber";
}

function icpFitBadgeClass(fit: string): string {
  if (fit === "strong_fit") return "badge-green";
  if (fit === "moderate_fit") return "badge-amber";
  return "badge-red";
}

function SignalsTable({ signals }: { signals: ExtractedSignals }) {
  const groups = [
    { label: "Budget", fields: signals.budget },
    { label: "Authority", fields: signals.authority },
    { label: "Need", fields: signals.need },
    { label: "Timing", fields: signals.timing },
    { label: "Account", fields: signals.account },
  ];

  return (
    <section className="mt-24">
      <h2 className="section-title">Extracted Signals</h2>
      {groups.map((group) => (
        <div key={group.label} className="mb-16">
          <h3 className="mb-8">{group.label}</h3>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: "25%" }}>Signal</th>
                <th style={{ width: "25%" }}>Value</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(group.fields)
                .filter(([, field]) => field && typeof field === "object" && "value" in field && "evidence" in field)
                .map(([key, field]) => (
                <tr key={key}>
                  <td style={{ fontWeight: 500 }}>{key.replace(/_/g, " ")}</td>
                  <td>
                    {Array.isArray(field.value) ? field.value.join(", ") || "—" : String(field.value)}
                  </td>
                  <td>
                    {field.evidence?.length > 0
                      ? field.evidence.map((q: string, i: number) => (
                          <blockquote key={i} className="evidence-quote">
                            &ldquo;{q}&rdquo;
                          </blockquote>
                        ))
                      : <span style={{ color: "var(--text-tertiary)" }}>—</span>}
                  </td>
                </tr>
              ))}
              {(() => {
                const raw = (group.fields as Record<string, unknown>).prospect_sentiment;
                if (!raw) return null;
                const s = raw as { disposition: string; summary: string; evidence: string[] };
                return (
                  <tr className="sentiment-row">
                    <td style={{ fontWeight: 500 }}>prospect sentiment</td>
                    <td>
                      <span className={`sentiment-${s.disposition}`}>
                        {s.disposition}
                      </span>
                      {(group.fields as Record<string, unknown>).budget_alignment ? (
                        <span style={{ fontWeight: 400, color: "var(--text-secondary)", marginLeft: 8, fontSize: 12 }}>
                          (alignment: {String((group.fields as Record<string, unknown>).budget_alignment)})
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>{s.summary}</span>
                      {s.evidence?.length > 0 && s.evidence.map((q, i) => (
                        <blockquote key={i} className="evidence-quote">
                          &ldquo;{q}&rdquo;
                        </blockquote>
                      ))}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      ))}

      {signals.account?.tech_stack && (
        <div className="mb-16">
          <h3 className="mb-8">Tech Stack</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(signals.account.tech_stack).map(([key, val]) => (
              <span
                key={key}
                className={`badge ${val === true ? "badge-green" : val === false ? "badge-gray" : "badge-amber"}`}
                style={{ fontSize: 12, fontWeight: 400 }}
              >
                {key.replace(/_/g, " ")}{typeof val === "string" ? `: ${val}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {signals.stack_canonical_hits && signals.stack_canonical_hits.length > 0 && (
        <div className="mb-16">
          <h3 className="mb-8">Stack (canonical)</h3>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
            Normalized from mentions + structured fields via an internal catalog (extend in core).
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {signals.stack_canonical_hits.map((id) => (
              <span key={id} className="badge badge-amber" style={{ fontSize: 12, fontWeight: 400 }}>
                {stackCatalogLabel(id)}
              </span>
            ))}
          </div>
        </div>
      )}

      {signals.stack_mentions && signals.stack_mentions.length > 0 && (
        <div className="mb-16">
          <h3 className="mb-8">Stack mentions</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {signals.stack_mentions.map((row, i) => (
              <li key={i} style={{ marginBottom: 12 }}>
                <strong style={{ fontSize: 13 }}>{row.mention}</strong>
                {row.evidence?.length > 0 &&
                  row.evidence.map((q, j) => (
                    <blockquote key={j} className="evidence-quote">
                      &ldquo;{q}&rdquo;
                    </blockquote>
                  ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {signals.account?.icp_fit && signals.account.icp_fit !== "unknown" && (
        <div className="mb-16">
          <h3 className="mb-8">ICP Fit</h3>
          <span className={`badge ${icpFitBadgeClass(signals.account.icp_fit)}`} style={{ fontSize: 13 }}>
            {signals.account.icp_fit.replace(/_/g, " ")}
          </span>
        </div>
      )}

      {signals.qualification_signals && (
        <div className="mb-16">
          <h3 className="mb-8">Qualification Signals</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(signals.qualification_signals)
              .filter(([, val]) => typeof val === "boolean" || typeof val === "string")
              .map(([key, val]) => (
              <span
                key={key}
                className={`badge ${val === true ? "badge-green" : val === false ? "badge-gray" : "badge-amber"}`}
                style={{ fontSize: 12, fontWeight: 400 }}
              >
                {key.replace(/_/g, " ")}{typeof val === "string" ? `: ${val}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {signals.call_summary && (
        <div className="mt-16">
          <h3 className="section-title">Call Summary</h3>
          <p style={{ color: "var(--text-secondary)" }}>{signals.call_summary}</p>
        </div>
      )}
    </section>
  );
}
