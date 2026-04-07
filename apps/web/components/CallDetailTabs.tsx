"use client";

import { useState } from "react";

interface BantScore {
  score: number;
  rationale: string;
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
  coaching_notes: string[];
  next_steps: string[];
  score: number;
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
}

interface Participant {
  name: string;
  role: string;
}

interface CallDetailTabsProps {
  evaluation: EvaluationJson | null;
  signals: ExtractedSignals | null;
  participants: Participant[];
  aeName: string | null;
  accountName: string | null;
}

export default function CallDetailTabs({
  evaluation,
  signals,
  participants,
  aeName,
  accountName,
}: CallDetailTabsProps) {
  const [view, setView] = useState<"ae" | "growth">("ae");

  if (!evaluation && !signals) {
    return <p className="mt-24" style={{ color: "var(--text-tertiary)" }}>Processing not yet completed for this call.</p>;
  }

  return (
    <div className="mt-24">
      <div className="tab-bar">
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

      {view === "ae" ? (
        <AEView evaluation={evaluation} signals={signals} />
      ) : (
        <GrowthView
          evaluation={evaluation}
          signals={signals}
          participants={participants}
          aeName={aeName}
          accountName={accountName}
        />
      )}
    </div>
  );
}

function AEView({
  evaluation,
  signals,
}: {
  evaluation: EvaluationJson | null;
  signals: ExtractedSignals | null;
}) {
  return (
    <>
      {evaluation && (
        <section className="card">
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
            <span className={`badge ${statusBadgeClass(evaluation.overall_status)}`} style={{ fontSize: 13 }}>
              {evaluation.overall_status}
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

          {evaluation.coaching_notes.length > 0 && (
            <div className="mt-20">
              <h3 className="section-title">Coaching Notes</h3>
              <ul className="list-clean">
                {evaluation.coaching_notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {evaluation.next_steps.length > 0 && (
            <div className="mt-16">
              <h3 className="section-title">Next Steps</h3>
              <ul className="list-clean">
                {evaluation.next_steps.map((step, i) => (
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

function GrowthView({
  evaluation,
  signals,
  participants,
  aeName,
  accountName,
}: {
  evaluation: EvaluationJson | null;
  signals: ExtractedSignals | null;
  participants: Participant[];
  aeName: string | null;
  accountName: string | null;
}) {
  const participantTitles = signals?.participant_titles ?? [];

  const participantDisplay = participants.map((p) => {
    const titleInfo = participantTitles.find(
      (t) => t.name.toLowerCase() === p.name.toLowerCase()
    );
    return titleInfo ? `${p.name} — ${titleInfo.title}` : p.name;
  });

  return (
    <section className="card" style={{ lineHeight: 1.8 }}>
      <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
        {aeName ?? "AE"} just met with {accountName ?? "Unknown Account"}
      </p>

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
        <span className="digest-label">Probability it moves to Stage 1: </span>
        <span className={`badge ${probBadgeClass(evaluation?.stage_1_probability ?? 0)}`} style={{ fontSize: 14, marginLeft: 4 }}>
          {evaluation?.stage_1_probability ?? "—"}%
        </span>
        {evaluation?.s1_type && evaluation.s1_type !== "not_s1" && (
          <span className={`badge ${evaluation.s1_type === "sell_s1" ? "badge-green" : "badge-amber"}`} style={{ fontSize: 12, marginLeft: 8 }}>
            {evaluation.s1_type === "sell_s1" ? "Sell S1" : "Chase S1"}
          </span>
        )}
      </p>

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
  };
  return map[status] ?? "badge-gray";
}

function probBadgeClass(value: number): string {
  if (value >= 61) return "badge-green";
  if (value >= 41) return "badge-amber";
  return "badge-red";
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
