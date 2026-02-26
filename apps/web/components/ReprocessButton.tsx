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
      setResult("Queued for reprocessing.");
    } else {
      setResult(`Error: ${data.error}`);
    }
  }

  return (
    <div className="mt-24">
      <button onClick={handleReprocess} disabled={loading} className="btn">
        {loading ? "Queuing..." : "Reprocess Call"}
      </button>
      {result && <p className="feedback-success mt-16" style={{ fontSize: 13 }}>{result}</p>}
    </div>
  );
}
