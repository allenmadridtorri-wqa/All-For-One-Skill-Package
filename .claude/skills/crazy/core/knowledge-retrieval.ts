import fs from 'node:fs';
import path from 'node:path';
import type { CoreSpecialistId } from './collaboration.ts';
import type { EngineId } from './engine-profiles.ts';

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
}

export interface KnowledgeRetrievalQuery {
  query: string;
  specialist?: CoreSpecialistId;
  engine?: EngineId;
  maxTokenBudget?: number;
  maxDocs?: number;
}

export interface RetrievedKnowledgeDoc {
  entry: KnowledgeDocEntry;
  relevanceScore: number;
  includedDependencyOf?: string;
}

export interface KnowledgeRetrievalResult {
  selected: RetrievedKnowledgeDoc[];
  totalTokensLoaded: number;
  totalCatalogTokens: number;
  tokenSavingsPercent: number;
  skippedForBudget: string[];
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

export function loadKnowledgeIndex(rootDir: string): KnowledgeDocEntry[] {
  const indexPath = path.join(rootDir, 'references', 'index.json');
  if (fs.existsSync(indexPath)) {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as {
      documents: KnowledgeDocEntry[];
    };
    return parsed.documents;
  }

  // Fallback automatic scan if index.json has not been generated yet
  const refsDir = path.join(rootDir, 'references');
  const entries: KnowledgeDocEntry[] = [];
  if (!fs.existsSync(refsDir)) return entries;

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.md')) {
        const rel = path.relative(rootDir, full).replace(/\\/g, '/');
        const content = fs.readFileSync(full, 'utf8');
        const titleLine = content.split(/\r?\n/)[0]?.replace(/^#\s*/, '').trim() || entry.name;
        entries.push({
          id: rel.replace(/^references\//, '').replace(/\.md$/, ''),
          path: rel,
          title: titleLine,
          version: '2.0.0',
          specialists: ['crazymaker', 'crazydesigner', 'crazycoder', 'crazyqa'],
          engines: ['all'],
          tags: tokenizeQuery(`${rel} ${titleLine}`),
          dependencies: [],
          estimatedTokens: estimateTokens(content),
        });
      }
    }
  };
  walk(refsDir);
  return entries;
}

export function retrieveTaskKnowledge(
  rootDir: string,
  params: KnowledgeRetrievalQuery,
): KnowledgeRetrievalResult {
  const catalog = loadKnowledgeIndex(rootDir);
  const byId = new Map(catalog.map((d) => [d.id, d]));
  const totalCatalogTokens = catalog.reduce((sum, d) => sum + d.estimatedTokens, 0);

  const maxTokenBudget = params.maxTokenBudget ?? 6500;
  const maxDocs = params.maxDocs ?? 4;
  const qTokens = tokenizeQuery(params.query);

  const scored = catalog
    .map((entry) => {
      // Filter incompatible engine-specific docs when an engine is explicitly selected
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
  const skippedForBudget: string[] = [];
  let usedTokens = 0;

  const tryAdd = (entry: KnowledgeDocEntry, relevanceScore: number, depOf?: string) => {
    if (selectedIds.has(entry.id)) return;
    if (selected.length >= maxDocs && !depOf) return;
    if (usedTokens + entry.estimatedTokens > maxTokenBudget) {
      skippedForBudget.push(entry.id);
      return;
    }
    selectedIds.add(entry.id);
    usedTokens += entry.estimatedTokens;
    selected.push({
      entry,
      relevanceScore,
      includedDependencyOf: depOf,
    });

    for (const depId of entry.dependencies) {
      const depEntry = byId.get(depId);
      if (depEntry && !selectedIds.has(depId)) {
        if (usedTokens + depEntry.estimatedTokens <= maxTokenBudget) {
          selectedIds.add(depEntry.id);
          usedTokens += depEntry.estimatedTokens;
          selected.push({
            entry: depEntry,
            relevanceScore: Math.max(1, relevanceScore - 0.5),
            includedDependencyOf: entry.id,
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

  return {
    selected,
    totalTokensLoaded: usedTokens,
    totalCatalogTokens,
    tokenSavingsPercent: savings,
    skippedForBudget,
  };
}
