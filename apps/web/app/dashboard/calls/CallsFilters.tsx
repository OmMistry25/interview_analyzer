"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const STATUSES = [
  { value: "", label: "All" },
  { value: "Qualified", label: "Qualified" },
  { value: "Needs Work", label: "Needs Work" },
  { value: "Unqualified", label: "Unqualified" },
  { value: "Pending", label: "Pending" },
];

interface Props {
  currentStatus: string;
  currentFrom: string;
  currentTo: string;
}

export default function CallsFilters({ currentStatus, currentFrom, currentTo }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/dashboard/calls?${params.toString()}`);
    },
    [router, searchParams]
  );

  const clearAll = useCallback(() => {
    router.push("/dashboard/calls");
  }, [router]);

  const hasFilters = currentStatus || currentFrom || currentTo;

  return (
    <div className="calls-filters">
      <div className="calls-filter-group">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            className={`btn btn-sm ${currentStatus === s.value ? "btn-primary" : ""}`}
            onClick={() => updateFilter("status", s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="calls-filter-group">
        <label className="calls-filter-label">From</label>
        <input
          type="date"
          className="input calls-filter-date"
          value={currentFrom}
          onChange={(e) => updateFilter("from", e.target.value)}
        />
        <label className="calls-filter-label">To</label>
        <input
          type="date"
          className="input calls-filter-date"
          value={currentTo}
          onChange={(e) => updateFilter("to", e.target.value)}
        />
      </div>

      {hasFilters && (
        <button className="btn btn-sm" onClick={clearAll}>
          Clear filters
        </button>
      )}
    </div>
  );
}
