import { getModelById } from './model-registry.ts';

export interface GradioEndpointParam {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
}

export interface GradioEndpointSummary {
  apiName: string;
  parameters: GradioEndpointParam[];
  returnTypes: string[];
}

export interface HostedSpaceInspectionResult {
  spaceId: string;
  baseUrl: string;
  status:
    | 'SCHEMA_INSPECTED'
    | 'UNAVAILABLE_FALLBACK_COLAB'
    | 'RATE_LIMITED'
    | 'AUTH_REQUIRED'
    | 'INVALID_TARGET';
  httpStatus: number | null;
  gradioVersion: 'gradio-5+' | 'gradio-4' | 'unknown';
  endpoints: GradioEndpointSummary[];
  fallbackRecommended: 'colab-t4-drive-job' | 'none';
  licenseReminder: string | null;
  warnings: string[];
  checkedAt: string;
}

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

/**
 * Normalizes a Hugging Face Space identifier ("owner/space") or HTTPS `.hf.space` URL
 * with strict HTTPS + host allowlist enforcement to avoid SSRF against arbitrary hosts.
 */
export function resolveSafeHfSpaceTarget(spaceIdOrUrl: string): {
  spaceId: string;
  baseUrl: string;
} {
  const trimmed = spaceIdOrUrl.trim();
  if (!trimmed) {
    throw new Error('Space identifier or URL cannot be empty.');
  }

  if (/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(trimmed)) {
    const [owner, repo] = trimmed.split('/');
    const slug = `${owner.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${repo.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
    return {
      spaceId: trimmed,
      baseUrl: `https://${slug}.hf.space`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid Hugging Face Space target "${trimmed}".`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`Refusing non-HTTPS Space URL "${trimmed}".`);
  }

  const host = parsed.hostname.toLowerCase();
  if (host.endsWith('.hf.space')) {
    return {
      spaceId: host.replace(/\.hf\.space$/, ''),
      baseUrl: `https://${host}`,
    };
  }

  if (host === 'huggingface.co' && parsed.pathname.startsWith('/spaces/')) {
    const parts = parsed.pathname.replace(/^\/spaces\//, '').split('/').filter(Boolean);
    if (parts.length >= 2) {
      const spaceId = `${parts[0]}/${parts[1]}`;
      const slug = `${parts[0].toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${parts[1].toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
      return {
        spaceId,
        baseUrl: `https://${slug}.hf.space`,
      };
    }
  }

  throw new Error(
    `Host "${host}" is not an allowed Hugging Face Space domain (*.hf.space or huggingface.co/spaces/*).`,
  );
}

/**
 * Deterministic parser for Gradio /gradio_api/info or /info JSON schemas.
 */
export function parseGradioSchemaPayload(raw: unknown): GradioEndpointSummary[] {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;
  const named =
    (obj.named_endpoints as Record<string, unknown> | undefined) ??
    (obj.unnamed_endpoints as Record<string, unknown> | undefined) ??
    {};

  const summaries: GradioEndpointSummary[] = [];
  for (const [apiName, spec] of Object.entries(named)) {
    if (!spec || typeof spec !== 'object') continue;
    const s = spec as Record<string, unknown>;
    const rawParams = Array.isArray(s.parameters) ? s.parameters : [];
    const parameters: GradioEndpointParam[] = rawParams.map((p, idx) => {
      const rec = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
      const typeObj =
        rec.type && typeof rec.type === 'object'
          ? String((rec.type as Record<string, unknown>).type ?? 'unknown')
          : String(rec.type ?? rec.python_type ?? 'unknown');
      return {
        name: String(rec.parameter_name ?? rec.label ?? `arg_${idx}`),
        type: typeObj,
        required: !Boolean(rec.parameter_has_default),
        defaultValue: rec.parameter_default,
      };
    });

    const rawReturns = Array.isArray(s.returns) ? s.returns : [];
    const returnTypes = rawReturns.map((r) => {
      const rec = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
      return String(
        (rec.type as Record<string, unknown> | undefined)?.type ??
          rec.label ??
          rec.component ??
          'unknown',
      );
    });

    summaries.push({ apiName, parameters, returnTypes });
  }

  return summaries;
}

/**
 * Probes a Hugging Face Gradio Space schema safely, respecting quotas/rate limits
 * and falling back to Google Colab T4 Drive jobs when unreachable or rate-limited.
 */
export async function inspectGradioSpaceSchema(
  spaceIdOrUrl: string,
  options?: {
    modelId?: string;
    timeoutMs?: number;
    hfToken?: string;
    fetchFn?: FetchLike;
  },
): Promise<HostedSpaceInspectionResult> {
  const checkedAt = new Date().toISOString();
  const modelEntry = options?.modelId ? getModelById(options.modelId) : undefined;
  const licenseReminder = modelEntry
    ? `Code: ${modelEntry.codeLicense} | Weights: ${modelEntry.weightLicense} (${modelEntry.commercialRestrictions})`
    : null;

  let target: { spaceId: string; baseUrl: string };
  try {
    target = resolveSafeHfSpaceTarget(spaceIdOrUrl);
  } catch (err) {
    return {
      spaceId: spaceIdOrUrl,
      baseUrl: '',
      status: 'INVALID_TARGET',
      httpStatus: null,
      gradioVersion: 'unknown',
      endpoints: [],
      fallbackRecommended: 'colab-t4-drive-job',
      licenseReminder,
      warnings: [err instanceof Error ? err.message : String(err)],
      checkedAt,
    };
  }

  const fetchImpl: FetchLike =
    options?.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
  if (typeof fetchImpl !== 'function') {
    return {
      spaceId: target.spaceId,
      baseUrl: target.baseUrl,
      status: 'UNAVAILABLE_FALLBACK_COLAB',
      httpStatus: null,
      gradioVersion: 'unknown',
      endpoints: [],
      fallbackRecommended: 'colab-t4-drive-job',
      licenseReminder,
      warnings: ['HTTP fetch unavailable in runtime; fall back to Colab T4 Drive job.'],
      checkedAt,
    };
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options?.hfToken) {
    headers.Authorization = `Bearer ${options.hfToken}`;
  }

  const probes: Array<{ path: string; version: 'gradio-5+' | 'gradio-4' }> = [
    { path: '/gradio_api/info', version: 'gradio-5+' },
    { path: '/info', version: 'gradio-4' },
  ];

  const warnings: string[] = [
    'Free hosted Hugging Face Spaces have ZeroGPU queue/rate limits and are NOT guaranteed unlimited production APIs.',
  ];
  let lastHttpStatus: number | null = null;

  for (const probe of probes) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? 4500);
      const res = await fetchImpl(`${target.baseUrl}${probe.path}`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      lastHttpStatus = res.status;

      if (res.status === 429) {
        return {
          spaceId: target.spaceId,
          baseUrl: target.baseUrl,
          status: 'RATE_LIMITED',
          httpStatus: 429,
          gradioVersion: probe.version,
          endpoints: [],
          fallbackRecommended: 'colab-t4-drive-job',
          licenseReminder,
          warnings: [
            ...warnings,
            'Hosted Space returned HTTP 429 (rate/ZeroGPU quota limited). Route job to Colab T4 Drive worker.',
          ],
          checkedAt,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          spaceId: target.spaceId,
          baseUrl: target.baseUrl,
          status: 'AUTH_REQUIRED',
          httpStatus: res.status,
          gradioVersion: probe.version,
          endpoints: [],
          fallbackRecommended: 'colab-t4-drive-job',
          licenseReminder,
          warnings: [
            ...warnings,
            `Hosted Space returned HTTP ${res.status} (authentication/gated access required).`,
          ],
          checkedAt,
        };
      }

      if (res.ok) {
        const json = await res.json();
        const endpoints = parseGradioSchemaPayload(json);
        return {
          spaceId: target.spaceId,
          baseUrl: target.baseUrl,
          status: 'SCHEMA_INSPECTED',
          httpStatus: res.status,
          gradioVersion: probe.version,
          endpoints,
          fallbackRecommended: 'none',
          licenseReminder,
          warnings,
          checkedAt,
        };
      }
    } catch (err) {
      warnings.push(
        `Probe ${probe.path} failed (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
  }

  return {
    spaceId: target.spaceId,
    baseUrl: target.baseUrl,
    status: 'UNAVAILABLE_FALLBACK_COLAB',
    httpStatus: lastHttpStatus,
    gradioVersion: 'unknown',
    endpoints: [],
    fallbackRecommended: 'colab-t4-drive-job',
    licenseReminder,
    warnings: [
      ...warnings,
      'Hosted Space unreachable or sleeping; fallback cleanly to prepare_colab_job (Colab T4 Drive workflow).',
    ],
    checkedAt,
  };
}
