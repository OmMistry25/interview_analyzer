"use client";

import { useState } from "react";

export default function ImportMeetingForm() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setResult(null);

    const res = await fetch("/api/admin/import-meeting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim() }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      setResult({ ok: true, message: `"${data.title}" queued for processing.` });
      setUrl("");
    } else {
      setResult({ ok: false, message: data.error });
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="import-form">
        <input
          type="text"
          className="input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a Fathom meeting link..."
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="btn btn-primary"
        >
          {loading ? "Importing..." : "Import"}
        </button>
      </form>
      {result && (
        <p className={result.ok ? "feedback-success" : "feedback-error"} style={{ marginTop: -20, marginBottom: 16 }}>
          {result.message}
        </p>
      )}
    </div>
  );
}
