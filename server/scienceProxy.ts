import type { Express } from 'express';

/**
 * Exponential backoff helper for rate-limited scientific REST & GraphQL APIs
 * (follows `/skills/system_skills/science/SKILL.md` specification).
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  baseDelayMs = 600
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.ok) {
      return response;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      const delay =
        !Number.isNaN(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `HTTP ${response.status} (${response.statusText}) from ${url}: ${errorBody.slice(0, 300)}`
    );
  }
  throw new Error(`Exhausted retries for ${url}`);
}

/**
 * Registers server-side proxy routes for non-CORS scientific databases (arXiv, dbSNP Variation Services,
 * JASPAR, UniBind, and PubMed Central BioC JSON) and polite header/key injection.
 */
export function registerScienceProxyRoutes(app: Express): void {
  // 1. arXiv Quantitative Biology & Preprint Atom XML Proxy
  app.get('/api/science/arxiv', async (req, res) => {
    try {
      const query = String(req.query.query || 'cat:q-bio.BM+AND+all:TP53');
      const maxResults = Math.min(20, Math.max(1, Number(req.query.max_results) || 8));
      const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(
        query
      )}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;

      const upstream = await fetchWithRetry(url, {
        headers: { 'User-Agent': 'Jarvis2ScienceWorkbench/2.0' },
      });
      const xml = await upstream.text();
      res.status(upstream.status).type('application/xml').send(xml);
    } catch (err: any) {
      res.status(502).json({ error: err?.message || 'Unable to query arXiv API.' });
    }
  });

  // 2. NCBI dbSNP Variation Services RefSNP Proxy (`/variation/v0/refsnp/:rsid`)
  app.get('/api/science/dbsnp/:rsid', async (req, res) => {
    try {
      const cleanNumericId = String(req.params.rsid || '').replace(/^rs/i, '').replace(/\D+/g, '');
      if (!cleanNumericId) {
        res.status(400).json({ error: 'Valid numeric rsID required (e.g. rs699 or 699).' });
        return;
      }
      const apiKeyParam = process.env.NCBI_API_KEY
        ? `?api_key=${encodeURIComponent(process.env.NCBI_API_KEY)}`
        : '';
      const url = `https://api.ncbi.nlm.nih.gov/variation/v0/refsnp/${cleanNumericId}${apiKeyParam}`;
      const upstream = await fetchWithRetry(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'Jarvis2ScienceWorkbench/2.0' },
      });
      res.json(await upstream.json());
    } catch (err: any) {
      res.status(502).json({ error: err?.message || 'Unable to query NCBI dbSNP Variation API.' });
    }
  });

  // 3. JASPAR Transcription Factor Binding Profiles Proxy
  app.get('/api/science/jaspar', async (req, res) => {
    try {
      const search = String(req.query.search || 'TP53');
      const url = `https://jaspar.elixir.no/api/v1/matrix/?search=${encodeURIComponent(
        search
      )}&tax_group=vertebrates&page_size=6&format=json`;
      const upstream = await fetchWithRetry(url, {
        headers: { Accept: 'application/json' },
      });
      res.json(await upstream.json());
    } catch (err: any) {
      res.status(502).json({ error: err?.message || 'Unable to query JASPAR API.' });
    }
  });

  // 4. UniBind ChIP-seq TFBS Datasets Proxy
  app.get('/api/science/unibind', async (req, res) => {
    try {
      const tfName = String(req.query.tf_name || 'TP53');
      const url = `https://unibind.uio.no/api/v1/datasets/?tf_name=${encodeURIComponent(
        tfName
      )}&species=Homo%20sapiens&page_size=6`;
      const upstream = await fetchWithRetry(url, {
        headers: { Accept: 'application/json' },
      });
      res.json(await upstream.json());
    } catch (err: any) {
      res.status(502).json({ error: err?.message || 'Unable to query UniBind API.' });
    }
  });
}
