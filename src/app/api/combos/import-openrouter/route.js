import { NextResponse } from "next/server";
import { createCombo } from "@/lib/localDb";

export const dynamic = "force-dynamic";

// Never fetch the user-supplied URL (SSRF). Only parse its query as filters,
// then fetch this fixed catalog endpoint.
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

function parseMaxPrice(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseModalities(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function modelMatches(model, { maxPrice, outputModalities }) {
  if (maxPrice != null) {
    const prompt = Number(model?.pricing?.prompt);
    const completion = Number(model?.pricing?.completion);
    if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return false;
    if (prompt > maxPrice || completion > maxPrice) return false;
  }
  if (outputModalities.length > 0) {
    const arch = model?.architecture?.output_modalities || model?.output_modalities || [];
    const have = new Set(arch.map((m) => String(m).toLowerCase()));
    if (!outputModalities.every((m) => have.has(m))) return false;
  }
  return true;
}

// POST /api/combos/import-openrouter — { url } → create openrouter-{Date.now()} combo
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
    if (!rawUrl) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const host = parsed.hostname.toLowerCase();
    if (host !== "openrouter.ai" && host !== "www.openrouter.ai") {
      return NextResponse.json({ error: "URL must be an openrouter.ai/models link" }, { status: 400 });
    }
    if (parsed.pathname.replace(/\/+$/, "") !== "/models") {
      return NextResponse.json({ error: "URL must be an openrouter.ai/models link" }, { status: 400 });
    }

    const maxPrice = parseMaxPrice(parsed.searchParams.get("max_price"));
    if (parsed.searchParams.has("max_price") && maxPrice == null) {
      return NextResponse.json({ error: "max_price must be a number" }, { status: 400 });
    }
    const outputModalities = parseModalities(parsed.searchParams.get("output_modalities"));
    // Note: order=most-popular is accepted but not re-sorted — /v1/models
    // exposes no popularity rank, so upstream order is preserved.

    let res;
    try {
      res = await fetch(OPENROUTER_MODELS_URL, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      console.log("Error fetching OpenRouter catalog:", error?.message || error);
      return NextResponse.json({ error: "Failed to fetch OpenRouter catalog" }, { status: 502 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch OpenRouter catalog" }, { status: 502 });
    }

    const data = await res.json().catch(() => null);
    const list = data?.data || data?.models || [];
    if (!Array.isArray(list)) {
      return NextResponse.json({ error: "Unexpected OpenRouter catalog shape" }, { status: 502 });
    }

    const models = list
      .filter((m) => typeof m?.id === "string" && modelMatches(m, { maxPrice, outputModalities }))
      .map((m) => `openrouter/${m.id}`);

    if (models.length === 0) {
      return NextResponse.json({ error: "No models matched these filters" }, { status: 400 });
    }

    const combo = await createCombo({
      name: `openrouter-${Date.now()}`,
      models,
      kind: "llm",
    });

    return NextResponse.json({ combo, count: models.length }, { status: 201 });
  } catch (error) {
    console.log("Error importing OpenRouter combo:", error);
    return NextResponse.json({ error: "Failed to import OpenRouter combo" }, { status: 500 });
  }
}
