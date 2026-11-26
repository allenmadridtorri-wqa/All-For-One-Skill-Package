import fs from 'node:fs';
import path from 'node:path';
import type { EngineId } from './engine-profiles.ts';

export type CoreSpecialistId = 'crazymaker' | 'crazydesigner' | 'crazycoder' | 'crazyqa';

export type KnowledgeSourceType =
  | 'official-spec'
  | 'engine-profile'
  | 'framework-guide'
  | 'community-pattern';

export interface KnowledgeDocEntry {
  id: string;
  path: string;
  title: string;
  version: string;
  specialists: CoreSpecialistId[];
  engines: Array<EngineId | 'all'>;
  tags: string[];
  dependencies: string[];
  estimatedTokens: number;
  sourceType?: KnowledgeSourceType;
  sourceOrigin?: string;
  verifiedForVersion?: string;
  lastVerifiedDate?: string;
}

export interface KnowledgeRetrievalQuery {
  query: string;
  specialist?: CoreSpecialistId;
  engine?: EngineId;
  maxTokenBudget?: number;
  maxDocs?: number;
  preferOfficialSources?: boolean;
  compactSections?: boolean;
  maxSectionTokens?: number;
}

export interface RetrievedKnowledgeDoc {
  entry: KnowledgeDocEntry;
  relevanceScore: number;
  sourceType: KnowledgeSourceType;
  provenanceStatus: 'SOURCE_BACKED' | 'FRAMEWORK_REFERENCE';
  includedDependencyOf?: string;
  compactExcerpt?: string;
  effectiveTokens?: number;
}

export interface KnowledgeRetrievalResult {
  selected: RetrievedKnowledgeDoc[];
  totalTokensLoaded: number;
  totalCatalogTokens: number;
  tokenSavingsPercent: number;
  skippedForBudget: string[];
  duplicatesRemoved: number;
  cacheHit: boolean;
}

export interface OutdatedDocFinding {
  id: string;
  path: string;
  reason: string;
}

const indexCache = new Map<string, KnowledgeDocEntry[]>();
const queryCache = new Map<string, KnowledgeRetrievalResult>();

export function clearKnowledgeCache(): void {
  indexCache.clear();
  queryCache.clear();
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function tokenizeQuery(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_+-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function inferSourceType(entry: KnowledgeDocEntry): KnowledgeSourceType {
  if (entry.sourceType) return entry.sourceType;
  if (entry.id.startsWith('engines/')) return 'engine-profile';
  return 'framework-guide';
}

export function loadKnowledgeIndex(rootDir: string, useCache = true): KnowledgeDocEntry[] {
  const absRoot = path.resolve(rootDir);
  if (useCache && indexCache.has(absRoot)) {
    return indexCache.get(absRoot)!;
  }

  const indexPath = path.join(absRoot, 'references', 'index.json');
  let docs: KnowledgeDocEntry[] = [];
  if (fs.existsSync(indexPath)) {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as {
      documents: KnowledgeDocEntry[];
    };
    docs = parsed.documents;
  } else {
    const refsDir = path.join(absRoot, 'references');
    if (fs.existsSync(refsDir)) {
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else if (entry.name.endsWith('.md')) {
            const rel = path.relative(absRoot, full).replace(/\\/g, '/');
            const content = fs.readFileSync(full, 'utf8');
            const titleLine = content.split(/\r?\n/)[0]?.replace(/^#\s*/, '').trim() || entry.name;
            docs.push({
              id: rel.replace(/^references\//, '').replace(/\.md$/, ''),
              path: rel,
              title: titleLine,
              version: '3.0.0',
              specialists: ['crazymaker', 'crazydesigner', 'crazycoder', 'crazyqa'],
              engines: ['all'],
              tags: tokenizeQuery(`${rel} ${titleLine}`),
              dependencies: [],
              estimatedTokens: estimateTokens(content),
              sourceType: rel.includes('/engines/') ? 'engine-profile' : 'framework-guide',
            });
          }
        }
      };
      walk(refsDir);
    }
  }

  if (useCache) indexCache.set(absRoot, docs);
  return docs;
}

export function detectOutdatedKnowledgeDocs(
  catalog: KnowledgeDocEntry[],
  referenceDateIso = new Date().toISOString().slice(0, 10),
  maxAgeDays = 365,
): OutdatedDocFinding[] {
  const refMs = Date.parse(referenceDateIso);
  const findings: OutdatedDocFinding[] = [];

  for (const doc of catalog) {
    if (doc.version.startsWith('1.')) {
      findings.push({
        id: doc.id,
        path: doc.path,
        reason: `Outdated major doc version "${doc.version}" (expected >= 2.0.0).`,
      });
      continue;
    }
    if (doc.lastVerifiedDate) {
      const docMs = Date.parse(doc.lastVerifiedDate);
      if (!Number.isNaN(docMs) && !Number.isNaN(refMs)) {
        const ageDays = (refMs - docMs) / (1000 * 60 * 60 * 24);
        if (ageDays > maxAgeDays) {
          findings.push({
            id: doc.id,
            path: doc.path,
            reason: `Last verified ${Math.round(ageDays)} days ago (> ${maxAgeDays} days threshold).`,
          });
        }
      }
    }
  }
  return findings;
}

function extractCompactMarkdownExcerpt(
  absPath: string,
  queryTokens: string[],
  maxDocTokens: number,
): { excerpt: string; tokens: number } | null {
  if (!fs.existsSync(absPath)) return null;
  const raw = fs.readFileSync(absPath, 'utf8');
  const sections = raw.split(/\r?\n(?=##\s+)/);
  const header = sections[0]?.trim() ?? '';
  const bodySections = sections.slice(1);

  const scoredSections = bodySections.map((sec, idx) => {
    const lower = sec.toLowerCase();
    let score = 0;
    if (/^##\s+(?:purpose|production methodology|technical requirements|important constraints|validation procedure)/i.test(sec)) {
      score += 2;
    }
    for (const tok of queryTokens) {
      if (lower.includes(tok)) score += 3;
    }
    return { sec: sec.trim(), idx, score };
  });

  scoredSections.sort((a, b) => b.score - a.score || a.idx - b.idx);
  const chosen: string[] = [];
  let usedTokens = 0;

  if (header) {
    const headerLines = header.split(/\r?\n/).slice(0, 6).join('\n');
    const hTok = estimateTokens(headerLines);
    if (hTok <= maxDocTokens) {
      chosen.push(headerLines);
      usedTokens += hTok;
    }
  }

  for (const item of scoredSections) {
    const t = estimateTokens(item.sec);
    if (usedTokens + t <= maxDocTokens) {
      chosen.push(item.sec);
      usedTokens += t;
    } else if (chosen.length <= 1 && maxDocTokens > usedTokens + 40) {
      const charBudget = Math.max(120, (maxDocTokens - usedTokens) * 4);
      const truncated = item.sec.slice(0, charBudget).trimEnd() + '\n...';
      chosen.push(truncated);
      usedTokens += estimateTokens(truncated);
      break;
    }
  }

  const excerpt = chosen.join('\n\n').trim();
  return { excerpt, tokens: Math.max(1, estimateTokens(excerpt)) };
}

export function retrieveTaskKnowledge(
  rootDir: string,
  params: KnowledgeRetrievalQuery,
): KnowledgeRetrievalResult {
  const absRoot = path.resolve(rootDir);
  const compactSections = Boolean(params.compactSections);
  const cacheKey = JSON.stringify({
    absRoot,
    q: params.query,
    s: params.specialist ?? '',
    e: params.engine ?? '',
    b: params.maxTokenBudget ?? 6500,
    m: params.maxDocs ?? 4,
    o: params.preferOfficialSources ?? true,
    c: compactSections,
    st: params.maxSectionTokens ?? 0,
  });

  const cached = queryCache.get(cacheKey);
  if (cached) {
    return { ...cached, cacheHit: true };
  }

  const catalog = loadKnowledgeIndex(absRoot);
  const byId = new Map(catalog.map((d) => [d.id, d]));
  const totalCatalogTokens = catalog.reduce((sum, d) => sum + d.estimatedTokens, 0);

  const maxTokenBudget = params.maxTokenBudget ?? 6500;
  const maxDocs = params.maxDocs ?? 4;
  const preferOfficial = params.preferOfficialSources ?? true;
  const qTokens = tokenizeQuery(params.query);

  const scored = catalog
    .map((entry) => {
      if (
        params.engine &&
        !entry.engines.includes('all') &&
        !entry.engines.includes(params.engine)
      ) {
        return { entry, score: -1 };
      }

      let score = 0;
      if (params.specialist && entry.specialists.includes(params.specialist)) {
        score += 3;
      }
      if (params.engine && entry.engines.includes(params.engine)) {
        score += 4;
      }

      const sourceType = inferSourceType(entry);
      if (preferOfficial) {
        if (sourceType === 'official-spec') score += 2;
        else if (sourceType === 'engine-profile') score += 1.5;
      }

      const searchable = new Set([
        ...entry.tags.map((t) => t.toLowerCase()),
        ...tokenizeQuery(entry.title),
        ...tokenizeQuery(entry.id),
      ]);

      for (const tok of qTokens) {
        if (searchable.has(tok)) score += 2.5;
      }

      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected: RetrievedKnowledgeDoc[] = [];
  const selectedIds = new Set<string>();
  const seenTitles = new Set<string>();
  const skippedForBudget: string[] = [];
  let duplicatesRemoved = 0;
  let usedTokens = 0;

  const tryAdd = (entry: KnowledgeDocEntry, relevanceScore: number, depOf?: string) => {
    const normTitle = entry.title.trim().toLowerCase();
    if (selectedIds.has(entry.id) || seenTitles.has(normTitle)) {
      duplicatesRemoved += 1;
      return;
    }
    if (selected.length >= maxDocs && !depOf) return;

    let effectiveTokens = entry.estimatedTokens;
    let compactExcerpt: string | undefined;
    if (compactSections) {
      const perDocCap = Math.max(
        180,
        Math.floor((params.maxSectionTokens ?? maxTokenBudget) / Math.max(1, maxDocs)),
      );
      const extracted = extractCompactMarkdownExcerpt(
        path.join(absRoot, entry.path),
        qTokens,
        perDocCap,
      );
      if (extracted) {
        compactExcerpt = extracted.excerpt;
        effectiveTokens = Math.min(entry.estimatedTokens, extracted.tokens);
      }
    }

    if (usedTokens + effectiveTokens > maxTokenBudget) {
      skippedForBudget.push(entry.id);
      return;
    }
    selectedIds.add(entry.id);
    seenTitles.add(normTitle);
    usedTokens += effectiveTokens;
    const sourceType = inferSourceType(entry);
    selected.push({
      entry,
      relevanceScore,
      sourceType,
      provenanceStatus:
        sourceType === 'official-spec' || sourceType === 'engine-profile'
          ? 'SOURCE_BACKED'
          : 'FRAMEWORK_REFERENCE',
      includedDependencyOf: depOf,
      compactExcerpt,
      effectiveTokens,
    });

    for (const depId of entry.dependencies) {
      const depEntry = byId.get(depId);
      if (depEntry && !selectedIds.has(depId)) {
        let depTokens = depEntry.estimatedTokens;
        let depExcerpt: string | undefined;
        if (compactSections) {
          const perDepCap = Math.max(
            140,
            Math.floor((params.maxSectionTokens ?? maxTokenBudget) / Math.max(1, maxDocs + 1)),
          );
          const extractedDep = extractCompactMarkdownExcerpt(
            path.join(absRoot, depEntry.path),
            qTokens,
            perDepCap,
          );
          if (extractedDep) {
            depExcerpt = extractedDep.excerpt;
            depTokens = Math.min(depEntry.estimatedTokens, extractedDep.tokens);
          }
        }
        if (usedTokens + depTokens <= maxTokenBudget) {
          const depNorm = depEntry.title.trim().toLowerCase();
          if (seenTitles.has(depNorm)) {
            duplicatesRemoved += 1;
            continue;
          }
          selectedIds.add(depEntry.id);
          seenTitles.add(depNorm);
          usedTokens += depTokens;
          const depSource = inferSourceType(depEntry);
          selected.push({
            entry: depEntry,
            relevanceScore: Math.max(1, relevanceScore - 0.5),
            sourceType: depSource,
            provenanceStatus:
              depSource === 'official-spec' || depSource === 'engine-profile'
                ? 'SOURCE_BACKED'
                : 'FRAMEWORK_REFERENCE',
            includedDependencyOf: entry.id,
            compactExcerpt: depExcerpt,
            effectiveTokens: depTokens,
          });
        }
      }
    }
  };

  for (const item of scored) {
    if (selected.length >= maxDocs) break;
    tryAdd(item.entry, item.score);
  }

  const savings =
    totalCatalogTokens === 0
      ? 0
      : Math.max(0, Math.round(((totalCatalogTokens - usedTokens) / totalCatalogTokens) * 100));

  const result: KnowledgeRetrievalResult = {
    selected,
    totalTokensLoaded: usedTokens,
    totalCatalogTokens,
    tokenSavingsPercent: savings,
    skippedForBudget,
    duplicatesRemoved,
    cacheHit: false,
  };
  queryCache.set(cacheKey, result);
  return result;
}
