"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/dashboard/calls");
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "100px auto", fontFamily: "system-ui" }}>
      <h1 style={{ marginBottom: 24 }}>Sign In</h1>
      <form onSubmit={handleLogin}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
          />
        </div>
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{ padding: "8px 24px", cursor: "pointer" }}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
