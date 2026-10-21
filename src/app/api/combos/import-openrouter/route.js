import { NextResponse } from "next/server";
import { createCombo, getComboByName } from "@/lib/localDb";

export const dynamic = "force-dynamic";

export const DEFAULT_OPENROUTER_URL =
  "https://openrouter.ai/models?max_price=0&input_modalities=text&order=coding-high-to-low";

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

function modelMatches(model, { maxPrice, outputModalities, inputModalities }) {
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
  if (inputModalities.length > 0) {
    const arch = model?.architecture?.input_modalities || model?.input_modalities || [];
    const have = new Set(arch.map((m) => String(m).toLowerCase()));
    if (!inputModalities.every((m) => have.has(m))) return false;
  }
  return true;
}

export function formatComboDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${year}-${month}-${day}`;
}

async function getUniqueOpenRouterComboName(prefix = "openrouter") {
  const dateStr = formatComboDate();
  const baseName = `${prefix}-${dateStr}`;

  const existing = await getComboByName(baseName);
  if (!existing) {
    return baseName;
  }

  let suffix = 2;
  while (true) {
    const candidate = `${baseName}-${suffix}`;
    const found = await getComboByName(candidate);
    if (!found) {
      return candidate;
    }
    suffix++;
  }
}

// POST /api/combos/import-openrouter — { url?, name? } → create openrouter-YYYY-MM-DD combo
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawUrl = typeof body?.url === "string" && body.url.trim() ? body.url.trim() : DEFAULT_OPENROUTER_URL;

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
    const inputModalities = parseModalities(parsed.searchParams.get("input_modalities"));
    const order = parsed.searchParams.get("order")?.toLowerCase();

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

    let matchedList = list.filter(
      (m) => typeof m?.id === "string" && modelMatches(m, { maxPrice, outputModalities, inputModalities })
    );

    if (order === "coding-high-to-low") {
      matchedList.sort((a, b) => {
        const scoreA = Number(a?.benchmarks?.artificial_analysis?.coding_index ?? -1);
        const scoreB = Number(b?.benchmarks?.artificial_analysis?.coding_index ?? -1);
        return scoreB - scoreA;
      });
    } else if (order === "intelligence-high-to-low") {
      matchedList.sort((a, b) => {
        const scoreA = Number(a?.benchmarks?.artificial_analysis?.intelligence_index ?? -1);
        const scoreB = Number(b?.benchmarks?.artificial_analysis?.intelligence_index ?? -1);
        return scoreB - scoreA;
      });
    }

    const models = matchedList.map((m) => `openrouter/${m.id}`);

    if (models.length === 0) {
      return NextResponse.json({ error: "No models matched these filters" }, { status: 400 });
    }

    const requestedName = typeof body?.name === "string" ? body.name.trim() : "";
    let comboName = "";
    if (requestedName) {
      if (!/^[a-zA-Z0-9_.\-]+$/.test(requestedName)) {
        return NextResponse.json(
          { error: "Only letters, numbers, -, _ and . allowed in combo name" },
          { status: 400 }
        );
      }
      const existing = await getComboByName(requestedName);
      if (existing) {
        return NextResponse.json({ error: `Combo "${requestedName}" already exists` }, { status: 400 });
      }
      comboName = requestedName;
    } else {
      comboName = await getUniqueOpenRouterComboName();
    }

    const combo = await createCombo({
      name: comboName,
      models,
      kind: "llm",
    });

    return NextResponse.json({ combo, count: models.length }, { status: 201 });
  } catch (error) {
    console.log("Error importing OpenRouter combo:", error);
    return NextResponse.json({ error: "Failed to import OpenRouter combo" }, { status: 500 });
  }
}
