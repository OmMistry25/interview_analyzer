"use client";

import { useState } from "react";

export default function ReprocessButton({ callId }: { callId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleReprocess() {
    setLoading(true);
    setResult(null);

    const res = await fetch("/api/admin/reprocess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: callId }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      setResult(`Reprocess job queued (${data.job_id})`);
    } else {
      setResult(`Error: ${data.error}`);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <button
        onClick={handleReprocess}
        disabled={loading}
        style={{ padding: "8px 16px", cursor: "pointer" }}
      >
        {loading ? "Queuing..." : "Reprocess Call"}
      </button>
      {result && <p style={{ marginTop: 8, fontSize: 13 }}>{result}</p>}
    </div>
  );
}
