# Executive pipeline flow (Console call analyzer)

Single-page reference for Stage 0 call processing. **Download:** use *Save As* on this file, or open on GitHub and use *Raw* → save.

## High-level flow

```mermaid
flowchart TB
  subgraph ingest [Ingest]
    A[FathomWebhook] --> B[NormalizeCall]
    B --> C[PersistCallParticipantsUtterances]
    C --> D[CreateProcessingRun]
  end

  subgraph identity [ProspectIdentity]
    E[ExtractProspectEmailDomain]
    F[ParseMeetingTitleFallback]
    G[ResolveDisplayNameDomainFirst]
    H[ApolloEnrichEmployeeCountOnly]
    I[SetDealSegmentEnterpriseOrMidTier]
    E --> G
    F --> G
    E --> H
    F --> H
    H --> I
    G --> J[BuildMeetingContext]
    I --> J
  end

  subgraph extract [Extraction]
    K[LLMExtractor_v4]
    L[ZodValidateExtractedSignals]
    M[DefaultDisqualifyingSignalsIfLegacy]
    N[NormalizeStackMentionsToCatalog]
    K --> L --> M --> N
  end

  subgraph brief [OptionalDealBrief]
    O{DealBriefEnabled}
    P[LLMDealBrief]
    Q[SkipBrief]
    O -->|yes| P
    O -->|no| Q
  end

  subgraph eval [Evaluation]
    R[LLMEvaluator_v3]
    S[DisqualifyingSignalsOverrideIfAnyTrue]
    T[BANTScoresAndS1Checklist]
    U[ZodValidateEvaluation]
    V[ComputeS1ChecklistYesCount]
    W[CrossCheckEvaluation]
    R --> S
    S --> T
    T --> U --> V --> W
  end

  subgraph persist [Persist]
    X[SaveSignalsJson]
    Y[SaveDealBriefJsonOptional]
    Z[SaveEvaluationJson]
    N --> X
    P --> Y
    Q --> R
    Y --> R
    X --> R
    W --> Z
  end

  subgraph deliver [Deliver]
    AA{CallbackUrl}
    AB[SlackGrowthAndAEPayloads]
    AC[DashboardUI]
    AA -->|yes| AB
    AA -->|no| AC
    AB --> AC
  end

  D --> E
  D --> F
  J --> K
  Z --> AA
```

## Swimlane view (roles)

```mermaid
flowchart LR
  subgraph system [System]
    S1[WebhookAndDBWrites]
  end
  subgraph models [LLM]
    M1[Extractor]
    M2[DealBriefOptional]
    M3[Evaluator]
  end
  subgraph rules [Rules]
    R1[ZodSchemas]
    R2[StackCatalogMatch]
    R3[DisqualifyOverridePrompt]
    R4[CrossCheckBANT]
  end
  subgraph people [Humans]
    H1[SlackDigest]
    H2[DashboardReview]
  end

  S1 --> M1
  M1 --> R1
  M1 --> R2
  R2 --> M2
  M2 --> M3
  M3 --> R3
  M3 --> R1
  M3 --> R4
  R4 --> S1
  S1 --> H1
  S1 --> H2
```

## Key decision points (executive)

| Step | What happens |
|------|----------------|
| Identity | Company label from **email domain first**, title fallback; Apollo only for **employee count → segment**. |
| Extract | Structured BANT + account + qualification + **`disqualifying_signals`** + stack mentions. |
| Post-extract | **`stack_canonical_hits`** from internal catalog; legacy rows get **default disqualifying block**. |
| Evaluate | If **any** `disqualifying_signals.value` is true → **Unqualified**, **not_s1**, **stage_1_probability ≤ 10**, first red flag **`DISQUALIFIED: …`**; else normal BANT + S1 checklist. |
| Output | Supabase + optional **callback** (Slack-style payloads) + **dashboard**. |

## Export as PNG/SVG

1. Copy either `flowchart` code block above (without the \`\`\` lines).
2. Open [https://mermaid.live](https://mermaid.live), paste, then **Actions → PNG/SVG**.

---

*Generated for handoff; keep in sync when changing `extractor_v4`, `evaluator_v3`, or ingestion.*
