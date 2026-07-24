/**
 * HydraDB HTTP client (server-only).
 * Docs: https://docs.hydradb.com/api-reference/v2
 *
 * Every call is traced into public.hydra_traces so we can prove autonomous
 * read/write behavior from the agent. Trace writes are best-effort — they
 * must never break the underlying Hydra operation.
 */

const BASE_URL = "https://api.hydradb.com";
const TENANT_ID = "healththread";

function authHeaders() {
  const key = process.env.HYDRADB_API_KEY;
  if (!key) throw new Error("HYDRADB_API_KEY is not configured");
  return {
    Authorization: `Bearer ${key}`,
    "API-Version": "2",
  } as Record<string, string>;
}

async function logTrace(row: {
  userId: string;
  operation: string;
  source: string;
  query?: string | null;
  request?: unknown;
  response?: unknown;
  status: "ok" | "error";
  error?: string | null;
  durationMs: number;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("hydra_traces").insert({
      user_id: row.userId,
      operation: row.operation,
      source: row.source,
      query: row.query ?? null,
      request: (row.request ?? null) as never,
      response: (row.response ?? null) as never,
      status: row.status,
      error: row.error ?? null,
      duration_ms: Math.round(row.durationMs),
    });
  } catch (err) {
    console.warn("[hydra.trace] log failed:", err);
  }
}

async function createTenantIfMissing(): Promise<void> {
  const res = await fetch(`${BASE_URL}/tenants`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ tenant_id: TENANT_ID }),
  });
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  if (/already.?exist|TENANT_ALREADY_EXISTS/i.test(text)) return;
  throw new Error(`HydraDB create tenant failed (${res.status}): ${text.slice(0, 300)}`);
}

async function waitForTenantReady(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(
      `${BASE_URL}/tenants/status?tenant_id=${encodeURIComponent(TENANT_ID)}`,
      { headers: authHeaders() },
    );
    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as {
        data?: { infra?: { ready_for_ingestion?: boolean } };
      };
      if (json.data?.infra?.ready_for_ingestion) return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`HydraDB tenant '${TENANT_ID}' did not become ready in time`);
}

async function ensureTenant(): Promise<void> {
  await createTenantIfMissing();
  await waitForTenantReady();
}

let tenantReady: Promise<void> | null = null;
function getTenantReady() {
  if (!tenantReady) {
    tenantReady = ensureTenant().catch((err) => {
      tenantReady = null;
      throw err;
    });
  }
  return tenantReady;
}

export type HydraMemoryInput = {
  userId: string;
  text: string;
  id?: string;
  metadata?: Record<string, unknown>;
  source?: string;
};

export async function ingestMemory(input: HydraMemoryInput) {
  await getTenantReady();
  const source = input.source ?? "unknown";
  const start = Date.now();
  const requestPayload = {
    id: input.id,
    text: input.text,
    metadata: input.metadata ?? null,
  };

  try {
    const form = new FormData();
    form.append("type", "memory");
    form.append("tenant_id", TENANT_ID);
    form.append("sub_tenant_id", input.userId);
    form.append("upsert", "true");
    form.append(
      "memories",
      JSON.stringify([
        {
          ...(input.id ? { id: input.id } : {}),
          text: input.text,
          infer: false,
          ...(input.metadata ? { additional_metadata: input.metadata } : {}),
        },
      ]),
    );

    const res = await fetch(`${BASE_URL}/context/ingest`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const errMsg = `HydraDB ingest failed (${res.status}): ${text.slice(0, 300)}`;
      await logTrace({
        userId: input.userId,
        operation: "write",
        source,
        query: input.text,
        request: requestPayload,
        response: { status: res.status, body: text.slice(0, 1000) },
        status: "error",
        error: errMsg,
        durationMs: Date.now() - start,
      });
      throw new Error(errMsg);
    }

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    await logTrace({
      userId: input.userId,
      operation: "write",
      source,
      query: input.text,
      request: requestPayload,
      response: json,
      status: "ok",
      durationMs: Date.now() - start,
    });
    return json;
  } catch (err) {
    if (!(err instanceof Error && err.message.startsWith("HydraDB ingest failed"))) {
      await logTrace({
        userId: input.userId,
        operation: "write",
        source,
        query: input.text,
        request: requestPayload,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      });
    }
    throw err;
  }
}

export async function deleteMemory(userId: string, ids: string[], source = "unknown") {
  if (ids.length === 0) return;
  await getTenantReady();
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/context`, {
      method: "DELETE",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "memory",
        tenant_id: TENANT_ID,
        sub_tenant_id: userId,
        ids,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const errMsg = `HydraDB delete failed (${res.status}): ${text.slice(0, 300)}`;
      await logTrace({
        userId,
        operation: "delete",
        source,
        request: { ids },
        response: { status: res.status, body: text.slice(0, 1000) },
        status: "error",
        error: errMsg,
        durationMs: Date.now() - start,
      });
      throw new Error(errMsg);
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    await logTrace({
      userId,
      operation: "delete",
      source,
      request: { ids },
      response: json,
      status: "ok",
      durationMs: Date.now() - start,
    });
    return json;
  } catch (err) {
    if (!(err instanceof Error && err.message.startsWith("HydraDB delete failed"))) {
      await logTrace({
        userId,
        operation: "delete",
        source,
        request: { ids },
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      });
    }
    throw err;
  }
}

export type HydraSearchHit = {
  id: string;
  score: number;
  text: string;
  metadata?: Record<string, unknown>;
};

export async function queryMemory(
  userId: string,
  query: string,
  maxResults = 5,
  source = "unknown",
): Promise<HydraSearchHit[]> {
  await getTenantReady();
  const start = Date.now();
  const requestPayload = { query, max_results: maxResults };

  try {
    const res = await fetch(`${BASE_URL}/query`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        sub_tenant_id: userId,
        query,
        type: "memory",
        query_by: "hybrid",
        mode: "fast",
        max_results: maxResults,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const errMsg = `HydraDB query failed (${res.status}): ${text.slice(0, 300)}`;
      await logTrace({
        userId,
        operation: "query",
        source,
        query,
        request: requestPayload,
        response: { status: res.status, body: text.slice(0, 1000) },
        status: "error",
        error: errMsg,
        durationMs: Date.now() - start,
      });
      throw new Error(errMsg);
    }

    const json = (await res.json().catch(() => ({}))) as {
      results?: Array<{
        id?: string;
        score?: number;
        text?: string;
        content?: string;
        metadata?: Record<string, unknown>;
      }>;
    };

    const hits = (json.results ?? []).map((r, i) => ({
      id: r.id ?? `hit_${i}`,
      score: typeof r.score === "number" ? r.score : 0,
      text: r.text ?? r.content ?? "",
      metadata: r.metadata,
    }));

    await logTrace({
      userId,
      operation: "query",
      source,
      query,
      request: requestPayload,
      response: { hit_count: hits.length, hits: hits.slice(0, 10) },
      status: "ok",
      durationMs: Date.now() - start,
    });

    return hits;
  } catch (err) {
    if (!(err instanceof Error && err.message.startsWith("HydraDB query failed"))) {
      await logTrace({
        userId,
        operation: "query",
        source,
        query,
        request: requestPayload,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      });
    }
    throw err;
  }
}
