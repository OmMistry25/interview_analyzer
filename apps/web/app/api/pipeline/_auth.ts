import { NextRequest, NextResponse } from "next/server";

export function authenticatePipeline(
  req: NextRequest
): NextResponse | null {
  const key = process.env.PIPELINE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "PIPELINE_API_KEY not configured" },
      { status: 500 }
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (token !== key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null; // auth passed
}
