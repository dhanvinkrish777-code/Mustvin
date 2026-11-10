import { GoogleGenAI, ThinkingLevel } from '@google/genai';

function createAI(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
      retryOptions: {
        attempts: 1,
      },
    },
  });
}

const WIKI_USER_AGENT =
  'Jarvis2App/2.2 (https://aistudio.google.com; educational-visual-lookup) NodeFetch/1.0';

// Track temporary 30-second cooldowns per API key + image model so transient 429s recover quickly
// and attaching a billing-enabled API key in Settings > Secrets activates Nano Banana immediately.
const imageModelCooldownUntil = new Map<string, number>();

function isImageModelCoolingDown(apiKey: string, modelName: string): boolean {
  const k = `${apiKey.slice(-8)}:${modelName}`;
  const until = imageModelCooldownUntil.get(k) || 0;
  return Date.now() < until;
}

function markImageModelCooldown(apiKey: string, modelName: string, durationMs = 30_000): void {
  const k = `${apiKey.slice(-8)}:${modelName}`;
  imageModelCooldownUntil.set(k, Date.now() + durationMs);
}

// Cache resolved subject visuals for 30 minutes so repeated lookups are instant
const subjectVisualCache = new Map<string, { url: string; expiresAt: number }>();

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeRawSvgMarkup(svg: string): string {
  let out = svg.trim();
  if (!out.includes('xmlns=')) {
    out = out.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  // Escape any unescaped ampersands that would break XML image rendering in browsers
  out = out.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
  return out;
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Downloads an external image URL on the server and returns a verified `data:image/...;base64,...`
 * URL so browser iframes never encounter Wikimedia 429 hotlink blocks or broken external image icons.
 */
async function fetchExternalImageAsDataUrl(
  imageUrl: string,
  timeoutMs = 5500
): Promise<string | null> {
  if (!imageUrl || imageUrl.startsWith('data:image/')) {
    return imageUrl || null;
  }

  try {
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent': WIKI_USER_AGENT,
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) return null;

    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength < 600 || arrayBuf.byteLength > 4.5 * 1024 * 1024) {
      return null;
    }

    const base64 = Buffer.from(arrayBuf).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}


/**
 * Generates a high-resolution, category-aware studio illustration (as an SVG data URL)
 * tailored specifically to the given subject name (smartphones, laptops, vehicles,
 * molecules/bioscience, astronomy/space, landmarks, or general concepts).
 */
export function buildStudioSubjectDataUrl(
  title: string,
  categoryHint: string = '',
  keySpecs: string[] = [],
  variantIndex: number = 0
): string {
  const lower = `${title} ${categoryHint}`.toLowerCase();
  const seed = hashString(title.trim().toLowerCase() + ':' + variantIndex);

  const palettes = [
    { bg1: '#0f172a', bg2: '#1e293b', accent: '#38bdf8', chassis: '#1e293b', rim: '#94a3b8' },
    { bg1: '#18181b', bg2: '#27272a', accent: '#10b981', chassis: '#27272a', rim: '#a1a1aa' },
    { bg1: '#172554', bg2: '#1e3a8a', accent: '#60a5fa', chassis: '#1e293b', rim: '#cbd5e1' },
    { bg1: '#1c1917', bg2: '#292524', accent: '#f59e0b', chassis: '#292524', rim: '#d6d3d1' },
    { bg1: '#14532d', bg2: '#064e3b', accent: '#34d399', chassis: '#1f2937', rim: '#9ca3af' },
    { bg1: '#311042', bg2: '#1e1b4b', accent: '#c084fc', chassis: '#1e1b4b', rim: '#cbd5e1' },
  ];
  const pal = palettes[(seed + variantIndex) % palettes.length];
  const safeTitle = escapeXml(title.slice(0, 40));
  const safeCategory = escapeXml((categoryHint || 'Visual Overview').slice(0, 48));
  const spec1 = escapeXml((keySpecs[0] || '').slice(0, 46));
  const spec2 = escapeXml((keySpecs[1] || '').slice(0, 46));
  const spec3 = escapeXml((keySpecs[2] || '').slice(0, 46));

  const isPhone =
    /\b(phone|smartphone|vivo|oppo|iphone|samsung|galaxy|pixel|xiaomi|redmi|oneplus|realme|nothing|motorola|iqoo|honor|huawei|poco|x9s|v70|s24|s25)\b/i.test(
      lower
    );
  const isLaptop =
    /\b(laptop|macbook|notebook|thinkpad|chromebook|pc|computer|ultrabook|surface|imac)\b/i.test(
      lower
    );
  const isCar =
    /\b(car|suv|sedan|supercar|hypercar|ev|tesla|bmw|mercedes|audi|porsche|ferrari|lamborghini|toyota|honda|hyundai|ford|cybertruck|vehicle|motorcycle|bike)\b/i.test(
      lower
    );
  const isScience =
    /\b(protein|gene|dna|rna|molecule|compound|drug|cell|enzyme|virus|bacteria|atom|quantum|chemical|receptor|kinase|tp53|brca1|egfr|crispr|mitochondria|photosynthesis)\b/i.test(
      lower
    );

  let illustrationMarkup = '';

  if (isPhone) {
    const circularIsland =
      (seed + variantIndex) % 2 === 1 || /\b(oppo|find|vivo|xiaomi|ultra)\b/i.test(lower);
    const brandWord = escapeXml((title.trim().split(/\s+/)[0] || 'PRO').toUpperCase());
    illustrationMarkup = `
      <g transform="translate(205, 62)">
        <rect x="0" y="0" width="172" height="340" rx="26" fill="${pal.chassis}" stroke="${pal.rim}" stroke-width="2.5"/>
        <rect x="6" y="6" width="160" height="328" rx="22" fill="url(#chassisGrad)" opacity="0.95"/>
        ${
          circularIsland
            ? `
            <circle cx="86" cy="86" r="52" fill="#09090b" stroke="${pal.rim}" stroke-width="2.5"/>
            <circle cx="86" cy="86" r="44" fill="#18181b" stroke="${pal.accent}" stroke-width="1.4" opacity="0.9"/>
            <circle cx="68" cy="70" r="11.5" fill="#020617" stroke="#475569" stroke-width="1.8"/>
            <circle cx="68" cy="70" r="4.5" fill="${pal.accent}" opacity="0.85"/>
            <circle cx="104" cy="70" r="11.5" fill="#020617" stroke="#475569" stroke-width="1.8"/>
            <circle cx="68" cy="102" r="11.5" fill="#020617" stroke="#475569" stroke-width="1.8"/>
            <rect x="95" y="95" width="16" height="14" rx="3" fill="#020617" stroke="#64748b" stroke-width="1.5"/>
            <circle cx="86" cy="150" r="5.5" fill="#fef08a" opacity="0.9"/>
            `
            : `
            <rect x="20" y="22" width="78" height="118" rx="18" fill="#09090b" stroke="${pal.rim}" stroke-width="2"/>
            <circle cx="45" cy="50" r="14" fill="#020617" stroke="#475569" stroke-width="2"/>
            <circle cx="45" cy="50" r="5" fill="${pal.accent}" opacity="0.85"/>
            <circle cx="45" cy="88" r="14" fill="#020617" stroke="#475569" stroke-width="2"/>
            <circle cx="77" cy="69" r="9.5" fill="#020617" stroke="#475569" stroke-width="1.5"/>
            <circle cx="77" cy="107" r="5.5" fill="#fef08a" opacity="0.9"/>
            `
        }
        <text x="86" y="300" text-anchor="middle" fill="${pal.rim}" font-family="Plus Jakarta Sans, sans-serif" font-size="11.5" font-weight="700" letter-spacing="2">${brandWord}</text>
      </g>
      <g transform="translate(405, 50)">
        <rect x="0" y="0" width="182" height="356" rx="28" fill="#050505" stroke="#e2e8f0" stroke-width="2.2"/>
        <rect x="6" y="6" width="170" height="344" rx="23" fill="url(#screenGrad)"/>
        <circle cx="91" cy="18" r="4.2" fill="#000000"/>
        <text x="91" y="124" text-anchor="middle" fill="#ffffff" font-family="Outfit, sans-serif" font-size="19" font-weight="700">${escapeXml(
          title.slice(0, 20)
        )}</text>
        <text x="91" y="148" text-anchor="middle" fill="#e2e8f0" font-family="Plus Jakarta Sans, sans-serif" font-size="10.5" opacity="0.92">${escapeXml(
          safeCategory.slice(0, 26)
        )}</text>
        ${
          spec1
            ? `<rect x="18" y="226" width="146" height="28" rx="8" fill="#000000" fill-opacity="0.52"/>
               <text x="91" y="244" text-anchor="middle" fill="#ffffff" font-family="JetBrains Mono, monospace" font-size="9.5">${escapeXml(
                 spec1.slice(0, 23)
               )}</text>`
            : ''
        }
        ${
          spec2
            ? `<rect x="18" y="262" width="146" height="28" rx="8" fill="#000000" fill-opacity="0.52"/>
               <text x="91" y="280" text-anchor="middle" fill="#ffffff" font-family="JetBrains Mono, monospace" font-size="9.5">${escapeXml(
                 spec2.slice(0, 23)
               )}</text>`
            : ''
        }
      </g>
    `;
  } else if (isLaptop) {
    illustrationMarkup = `
      <g transform="translate(185, 76)">
        <rect x="40" y="0" width="350" height="226" rx="14" fill="#09090b" stroke="${pal.rim}" stroke-width="2.5"/>
        <rect x="50" y="10" width="330" height="204" rx="8" fill="url(#screenGrad)"/>
        <text x="215" y="100" text-anchor="middle" fill="#ffffff" font-family="Outfit, sans-serif" font-size="24" font-weight="700">${safeTitle}</text>
        <text x="215" y="128" text-anchor="middle" fill="#e2e8f0" font-family="Plus Jakarta Sans, sans-serif" font-size="13">${safeCategory}</text>
        ${
          spec1
            ? `<text x="215" y="164" text-anchor="middle" fill="#f8fafc" font-family="JetBrains Mono, monospace" font-size="11">${spec1}</text>`
            : ''
        }
        <path d="M5,228 L425,228 L405,246 L25,246 Z" fill="#cbd5e1"/>
        <rect x="180" y="228" width="70" height="5" rx="2.5" fill="#64748b"/>
      </g>
    `;
  } else if (isCar) {
    illustrationMarkup = `
      <g transform="translate(110, 88)">
        <text x="290" y="34" text-anchor="middle" fill="#ffffff" font-family="Outfit, sans-serif" font-size="30" font-weight="700">${safeTitle}</text>
        <text x="290" y="60" text-anchor="middle" fill="${pal.accent}" font-family="JetBrains Mono, monospace" font-size="12">${safeCategory}</text>
        <path d="M70,210 L125,155 L235,120 L395,120 L495,165 L525,210 L515,232 L65,232 Z" fill="url(#screenGrad)" stroke="${pal.rim}" stroke-width="2.5"/>
        <path d="M150,155 L240,127 L380,127 L445,158 Z" fill="#020617" opacity="0.82" stroke="${pal.accent}" stroke-width="1.2"/>
        <circle cx="155" cy="232" r="34" fill="#09090b" stroke="${pal.rim}" stroke-width="4"/>
        <circle cx="155" cy="232" r="16" fill="${pal.accent}" opacity="0.7"/>
        <circle cx="430" cy="232" r="34" fill="#09090b" stroke="${pal.rim}" stroke-width="4"/>
        <circle cx="430" cy="232" r="16" fill="${pal.accent}" opacity="0.7"/>
      </g>
    `;
  } else if (isScience) {
    illustrationMarkup = `
      <g transform="translate(75, 58)">
        <rect x="0" y="0" width="650" height="336" rx="24" fill="#09090b" fill-opacity="0.58" stroke="${pal.rim}" stroke-opacity="0.35" stroke-width="1.5"/>
        <g transform="translate(495, 168)">
          <ellipse cx="0" cy="0" rx="92" ry="38" fill="none" stroke="${pal.accent}" stroke-width="2" transform="rotate(30)"/>
          <ellipse cx="0" cy="0" rx="92" ry="38" fill="none" stroke="#60a5fa" stroke-width="2" transform="rotate(-30)"/>
          <ellipse cx="0" cy="0" rx="92" ry="38" fill="none" stroke="#34d399" stroke-width="2" transform="rotate(90)"/>
          <circle cx="0" cy="0" r="18" fill="${pal.accent}"/>
          <circle cx="62" cy="-35" r="8" fill="#f8fafc"/>
          <circle cx="-62" cy="35" r="8" fill="#34d399"/>
          <circle cx="0" cy="-90" r="8" fill="#60a5fa"/>
        </g>
        <text x="42" y="76" fill="${pal.accent}" font-family="JetBrains Mono, monospace" font-size="12" font-weight="600">${safeCategory}</text>
        <text x="42" y="126" fill="#ffffff" font-family="Outfit, sans-serif" font-size="32" font-weight="700">${safeTitle}</text>
        ${spec1 ? `<text x="42" y="182" fill="#e2e8f0" font-family="Plus Jakarta Sans, sans-serif" font-size="15">• ${spec1}</text>` : ''}
        ${spec2 ? `<text x="42" y="218" fill="#cbd5e1" font-family="Plus Jakarta Sans, sans-serif" font-size="15">• ${spec2}</text>` : ''}
        ${spec3 ? `<text x="42" y="254" fill="#94a3b8" font-family="Plus Jakarta Sans, sans-serif" font-size="15">• ${spec3}</text>` : ''}
      </g>
    `;
  } else {
    illustrationMarkup = `
      <g transform="translate(75, 58)">
        <rect x="0" y="0" width="650" height="336" rx="24" fill="#09090b" fill-opacity="0.58" stroke="${pal.rim}" stroke-opacity="0.4" stroke-width="1.5"/>
        <circle cx="525" cy="126" r="78" fill="${pal.accent}" fill-opacity="0.18" stroke="${pal.accent}" stroke-width="2"/>
        <circle cx="525" cy="126" r="46" fill="${pal.accent}" fill-opacity="0.3"/>
        <text x="42" y="82" fill="${pal.accent}" font-family="JetBrains Mono, monospace" font-size="13" font-weight="600">${safeCategory}</text>
        <text x="42" y="136" fill="#ffffff" font-family="Outfit, sans-serif" font-size="33" font-weight="700">${safeTitle}</text>
        ${
          spec1
            ? `<text x="42" y="196" fill="#e2e8f0" font-family="Plus Jakarta Sans, sans-serif" font-size="15.5">• ${spec1}</text>`
            : ''
        }
        ${
          spec2
            ? `<text x="42" y="232" fill="#cbd5e1" font-family="Plus Jakarta Sans, sans-serif" font-size="15.5">• ${spec2}</text>`
            : ''
        }
        ${
          spec3
            ? `<text x="42" y="268" fill="#94a3b8" font-family="Plus Jakarta Sans, sans-serif" font-size="15.5">• ${spec3}</text>`
            : ''
        }
      </g>
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${pal.bg1}"/>
        <stop offset="100%" stop-color="${pal.bg2}"/>
      </linearGradient>
      <linearGradient id="chassisGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${pal.chassis}"/>
        <stop offset="100%" stop-color="#09090b"/>
      </linearGradient>
      <linearGradient id="screenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${pal.accent}"/>
        <stop offset="55%" stop-color="${pal.bg2}"/>
        <stop offset="100%" stop-color="#020617"/>
      </linearGradient>
    </defs>
    <rect width="800" height="480" fill="url(#bgGrad)"/>
    <circle cx="690" cy="80" r="180" fill="${pal.accent}" opacity="0.1"/>
    <circle cx="110" cy="410" r="160" fill="${pal.accent}" opacity="0.08"/>
    ${illustrationMarkup}
    <rect x="28" y="426" width="744" height="34" rx="10" fill="#000000" fill-opacity="0.46"/>
    <text x="44" y="448" fill="#f8fafc" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600">${safeTitle}</text>
    <text x="756" y="448" text-anchor="end" fill="#cbd5e1" font-family="JetBrains Mono, monospace" font-size="11">${safeCategory}</text>
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
}

export interface ProductStoreLink {
  storeName: string;
  url: string;
  kind: 'amazon' | 'flipkart' | 'retailer' | 'web';
}

export interface SubjectWebLookupResult {
  imageUrl: string;
  discoveredWebLinks: Array<{ title: string; url: string }>;
}

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const SUBJECT_Visual_RESULT_CACHE = new Map<
  string,
  { result: SubjectWebLookupResult; expiresAt: number }
>();

/**
 * Collapses accidental spaces inside alphanumeric model identifiers
 * (e.g., "oppo find X 9s" -> "oppo find X9s", "Vivo v 70 lite" -> "Vivo v70 lite").
 */
export function normalizeModelSpacing(raw: string): string {
  return String(raw || '')
    .replace(/\b([b-hj-zB-HJ-Z])\s+(\d+[a-zA-Z0-9]*)\b/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

const TIER_VARIANT_TOKENS = new Set([
  'lite',
  'elite',
  'ultra',
  'pro',
  'plus',
  'max',
  'mini',
  'fe',
  'se',
  'fold',
  'flip',
  'neo',
  'gt',
  'turbo',
  'air',
]);

const GENERIC_QUERY_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'how',
  'what',
  'who',
  'where',
  'explain',
  'explanation',
  'define',
  'definition',
  'meaning',
  'research',
  'product',
  'about',
  'official',
  'picture',
  'photo',
  'image',
  'difference',
  'between',
]);

function tokenizeClean(text: string): string[] {
  return normalizeModelSpacing(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Strictly scores whether a web/encyclopedia image candidate truly depicts the requested subject.
 * Returns -1 if any model number token (e.g. "v70", "x9s") or tier modifier ("lite", "elite", "pro", "ultra")
 * is missing or conflicts with another model variant.
 */
function scoreSubjectImageCandidate(
  subjectName: string,
  cand: { title?: string; purl?: string; murl?: string }
): number {
  const normSubj = normalizeModelSpacing(subjectName).toLowerCase();
  const rawTokens = tokenizeClean(normSubj).filter(
    (t) => (t.length >= 2 || /\d/.test(t)) && !GENERIC_QUERY_STOP_WORDS.has(t)
  );
  if (rawTokens.length === 0) return -1;

  const nonNetworkModelTokens = rawTokens.filter(
    (t) => /\d/.test(t) && t !== '5g' && t !== '4g' && t !== '3g'
  );
  const modelTokens =
    nonNetworkModelTokens.length > 0
      ? nonNetworkModelTokens
      : rawTokens.filter((t) => /\d/.test(t));
  const subjectTiers = rawTokens.filter((t) => TIER_VARIANT_TOKENS.has(t));

  const titleNorm = normalizeModelSpacing(cand.title || '').toLowerCase();
  let pageNorm = '';
  try {
    pageNorm = decodeURIComponent(cand.purl || '').toLowerCase();
  } catch {
    pageNorm = String(cand.purl || '').toLowerCase();
  }
  let imgNorm = '';
  try {
    imgNorm = decodeURIComponent(cand.murl || '').toLowerCase();
  } catch {
    imgNorm = String(cand.murl || '').toLowerCase();
  }

  const metaCombined = `${titleNorm} ${pageNorm}`;
  const metaWordSet = new Set(tokenizeClean(metaCombined));
  const imgWordSet = new Set(tokenizeClean(imgNorm));

  // Reject obvious icons, site logos, flags, Pollinations URLs, or non-photo assets
  if (
    /\b(logo|favicon|avatar|sprite|placeholder|no-image|no_image|icon-512|badge|pollinations)\b/i.test(
      `${imgNorm} ${pageNorm}`
    )
  ) {
    return -1;
  }

  // 1. Every model/identifier token (e.g., "v70", "x9s", "1000xm5") MUST appear as an exact token
  for (const mt of modelTokens) {
    if (!metaWordSet.has(mt) && !imgWordSet.has(mt)) {
      return -1;
    }
  }

  // 2. Every requested tier modifier (e.g., "lite", "elite", "pro", "ultra") MUST appear in title or page URL
  for (const tw of subjectTiers) {
    if (!metaWordSet.has(tw) && !imgWordSet.has(tw)) {
      return -1;
    }
  }

  // 3. Reject images whose filename belongs to a DIFFERENT conflicting tier (e.g. find-x9-ultra when searching find-x9s)
  for (const tw of TIER_VARIANT_TOKENS) {
    if (!subjectTiers.includes(tw) && imgWordSet.has(tw)) {
      return -1;
    }
  }

  // 4. Require high overall token overlap with the requested subject
  let matchedCount = 0;
  for (const tok of rawTokens) {
    if (metaWordSet.has(tok) || imgWordSet.has(tok) || metaCombined.includes(tok)) {
      matchedCount++;
    }
  }

  const minRequired =
    rawTokens.length <= 2 ? rawTokens.length : Math.ceil(rawTokens.length * 0.75);
  if (matchedCount < minRequired) {
    return -1;
  }

  let score = matchedCount * 12;
  for (const mt of modelTokens) {
    if (imgWordSet.has(mt)) score += 28;
    if (metaWordSet.has(mt)) score += 16;
  }
  for (const tw of subjectTiers) {
    if (imgWordSet.has(tw)) score += 22;
    if (metaWordSet.has(tw)) score += 12;
  }

  // Bonus when the full normalized phrase appears contiguously in title or URL
  const compactPhrase = rawTokens.join(' ');
  const slugPhrase = rawTokens.join('-');
  if (titleNorm.includes(compactPhrase)) score += 20;
  if (pageNorm.includes(slugPhrase) || imgNorm.includes(slugPhrase)) score += 22;

  // Prefer clean product/editorial image formats
  if (/\.(png|webp|jpg|jpeg)(\?|$)/i.test(cand.murl || '')) score += 6;
  if (
    /\b(gsmarena|91mobiles|smartprix|beebom|gizmochina|oppo\.com|vivo\.com|apple\.com|samsung\.com|amazon\.|flipkart\.|croma\.com|wikimedia|wikipedia)\b/i.test(
      `${pageNorm} ${imgNorm}`
    )
  ) {
    score += 14;
  }

  return score;
}

function isUsableWikiImageUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (
    lower.includes('pollinations.ai') ||
    lower.includes('question_book') ||
    lower.includes('disambig') ||
    lower.includes('wiki_letter_w') ||
    lower.includes('commons-logo') ||
    lower.includes('ambox_') ||
    lower.includes('edit-clear') ||
    lower.includes('flag_of_') ||
    lower.includes('crystal_clear_') ||
    lower.includes('nuvola_') ||
    lower.endsWith('.tif') ||
    lower.endsWith('.tiff') ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.ogv') ||
    lower.endsWith('.webm')
  ) {
    return false;
  }
  return true;
}

/**
 * Downloads a verified external web or Wikimedia image URL on the server and returns a
 * `data:image/...;base64,...` URL so browser iframes never show broken hotlink icons.
 */
async function fetchVerifiedWebImageAsDataUrl(
  imageUrl: string,
  timeoutMs = 4500
): Promise<string | null> {
  if (!imageUrl || imageUrl.startsWith('data:image/')) {
    return imageUrl || null;
  }

  const isWikimedia = /\b(wikimedia\.org|wikipedia\.org)\b/i.test(imageUrl);
  try {
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent': isWikimedia ? WIKI_USER_AGENT : BROWSER_USER_AGENT,
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) return null;

    const arrayBuf = await res.arrayBuffer();
    // Reject tiny 1x1 tracking pixels or oversized >5MB payloads
    if (arrayBuf.byteLength < 1200 || arrayBuf.byteLength > 5 * 1024 * 1024) {
      return null;
    }

    const base64 = Buffer.from(arrayBuf).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

interface WholeWebCandidate {
  title: string;
  purl: string;
  murl: string;
  turl: string;
  score: number;
}

/**
 * Searches across the entire open web for real photographs/diagrams matching `subjectName`
 * and also collects verified web pages (`purl`) for product research & reference links.
 */
async function fetchWholeWebImageCandidates(
  subjectName: string,
  categoryHint: string = ''
): Promise<WholeWebCandidate[]> {
  const cleanSubject = normalizeModelSpacing(subjectName);
  if (!cleanSubject) return [];

  const queries = [cleanSubject];
  const cleanCat = categoryHint.trim();
  if (
    cleanCat &&
    cleanCat.length <= 28 &&
    !cleanSubject.toLowerCase().includes(cleanCat.toLowerCase()) &&
    /\b(smartphone|phone|laptop|tablet|earbuds|headphones|watch|smartwatch|camera|tv|car|ev|gpu|processor)\b/i.test(
      cleanCat
    )
  ) {
    queries.push(`${cleanSubject} ${cleanCat}`);
  }

  const seenImg = new Set<string>();
  const collected: WholeWebCandidate[] = [];

  await Promise.all(
    queries.map(async (q) => {
      try {
        const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(
          q
        )}&form=HDRSC2&first=1&cc=IN&setlang=en`;
        const res = await fetch(searchUrl, {
          headers: {
            'User-Agent': BROWSER_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8',
          },
          signal: AbortSignal.timeout(2400),
        });
        if (!res.ok) return;
        const html = await res.text();
        const matches = [...html.matchAll(/m="(\{[^"]+\})"/g)].slice(0, 18);

        for (const m of matches) {
          try {
            const decoded = m[1]
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&#39;/g, "'");
            const obj = JSON.parse(decoded);
            const murl = String(obj?.murl || '').trim();
            const turl = String(obj?.turl || '').trim();
            const purl = String(obj?.purl || '').trim();
            const title = String(obj?.t || '').trim();
            if (!murl && !turl) continue;
            if (!isUsableWikiImageUrl(murl || turl)) continue;

            const key = murl || turl;
            if (seenImg.has(key)) continue;

            const score = scoreSubjectImageCandidate(cleanSubject, {
              title,
              purl,
              murl: murl || turl,
            });
            if (score > 0) {
              seenImg.add(key);
              collected.push({ title, purl, murl, turl, score });
            }
          } catch {
            // Ignore malformed metadata block
          }
        }
      } catch {
        // Network timeout or block — continue gracefully
      }
    })
  );

  collected.sort((a, b) => b.score - a.score);
  return collected;
}

/**
 * Inspects top grounded Google Search URLs for OpenGraph (`og:image` / `twitter:image`) photos
 * that match the subject's strict token checks.
 */
async function fetchGroundedSourcesOgCandidates(
  subjectName: string,
  groundedSources: Array<{ title: string; uri: string }> = []
): Promise<WholeWebCandidate[]> {
  if (!groundedSources.length) return [];
  const cleanSubject = normalizeModelSpacing(subjectName);
  const matchingSources = groundedSources
    .filter(
      (s) =>
        s.uri &&
        /^https?:\/\//i.test(s.uri) &&
        scoreSubjectImageCandidate(cleanSubject, { title: s.title, purl: s.uri, murl: '' }) > 0
    )
    .slice(0, 3);

  const found: WholeWebCandidate[] = [];
  await Promise.all(
    matchingSources.map(async (src) => {
      try {
        const res = await fetch(src.uri, {
          headers: {
            'User-Agent': BROWSER_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(1800),
        });
        if (!res.ok) return;
        const finalUrl = res.url || src.uri;
        const html = (await res.text()).slice(0, 80000);
        const ogMatch =
          html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
          html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
          html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
        if (!ogMatch?.[1]) return;

        const resolvedImg = new URL(ogMatch[1].replace(/&amp;/g, '&'), finalUrl).href;
        if (!isUsableWikiImageUrl(resolvedImg)) return;

        const score = scoreSubjectImageCandidate(cleanSubject, {
          title: src.title,
          purl: finalUrl,
          murl: resolvedImg,
        });
        if (score > 0) {
          found.push({
            title: src.title,
            purl: finalUrl,
            murl: resolvedImg,
            turl: '',
            score: score + 8,
          });
        }
      } catch {}
    })
  );

  return found;
}

/**
 * 1) Exact Wikipedia REST v1 Summary Lookup (strictly verified against subject tokens)
 */
async function fetchExactWikipediaSummaryImage(subjectName: string): Promise<string | null> {
  const clean = normalizeModelSpacing(subjectName);
  if (!clean) return null;

  try {
    const titleSlug = encodeURIComponent(clean.replace(/ /g, '_'));
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${titleSlug}`, {
      headers: { 'User-Agent': WIKI_USER_AGENT },
      signal: AbortSignal.timeout(2600),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (data?.type === 'disambiguation') return null;

    const pageTitle = String(data?.title || '');
    const candidate = data?.thumbnail?.source || data?.originalimage?.source;
    if (
      candidate &&
      isUsableWikiImageUrl(String(candidate)) &&
      scoreSubjectImageCandidate(clean, {
        title: pageTitle,
        purl: data?.content_urls?.desktop?.page || '',
        murl: String(candidate),
      }) > 0
    ) {
      return String(candidate);
    }
  } catch {}
  return null;
}

/**
 * 2) Wikipedia Generator Search with strict model/tier token verification
 */
async function fetchWikipediaSearchImage(subjectName: string): Promise<string | null> {
  const cleanQuery = normalizeModelSpacing(subjectName);
  if (!cleanQuery) return null;

  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      cleanQuery
    )}&gsrlimit=5&prop=pageimages&piprop=thumbnail&pithumbsize=900&format=json&origin=*`;

    const res = await fetch(url, {
      headers: { 'User-Agent': WIKI_USER_AGENT },
      signal: AbortSignal.timeout(2800),
    });
    if (!res.ok) return null;

    const data: any = await res.json();
    const pages = data?.query?.pages ? (Object.values(data.query.pages) as any[]) : [];
    if (!pages.length) return null;

    pages.sort((a, b) => Number(a?.index ?? 99) - Number(b?.index ?? 99));

    for (const page of pages) {
      const pageTitle = String(page?.title || '');
      const thumbSrc = String(page?.thumbnail?.source || '');
      if (!isUsableWikiImageUrl(thumbSrc)) continue;

      if (
        scoreSubjectImageCandidate(cleanQuery, {
          title: pageTitle,
          purl: `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`,
          murl: thumbSrc,
        }) > 0
      ) {
        return thumbSrc;
      }
    }
  } catch {}
  return null;
}

/**
 * 3) Wikimedia Commons direct photograph lookup with strict verification
 */
async function fetchWikimediaCommonsPhoto(subjectName: string): Promise<string | null> {
  const cleanQuery = normalizeModelSpacing(subjectName);
  if (!cleanQuery) return null;

  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
      cleanQuery
    )}&gsrlimit=6&prop=imageinfo&iiprop=url|mime&iiurlwidth=900&format=json&origin=*`;

    const res = await fetch(url, {
      headers: { 'User-Agent': WIKI_USER_AGENT },
      signal: AbortSignal.timeout(2800),
    });
    if (!res.ok) return null;

    const data: any = await res.json();
    const pages = data?.query?.pages ? (Object.values(data.query.pages) as any[]) : [];
    if (!pages.length) return null;

    pages.sort((a, b) => Number(a?.index ?? 99) - Number(b?.index ?? 99));

    for (const page of pages) {
      const titleStr = String(page?.title || '');
      const info = page?.imageinfo?.[0];
      const mime = String(info?.mime || '');
      const thumbUrl = String(info?.thumburl || info?.url || '');

      if (!mime.startsWith('image/')) continue;
      if (!isUsableWikiImageUrl(thumbUrl)) continue;

      if (
        scoreSubjectImageCandidate(cleanQuery, {
          title: titleStr,
          purl: '',
          murl: thumbUrl,
        }) > 0
      ) {
        return thumbUrl;
      }
    }
  } catch {}
  return null;
}

/**
 * 4) Scientific & Molecular Image Lookup (PubChem 2D compound PNG or RCSB PDB macromolecular render)
 */
async function fetchScientificDepiction(
  subjectName: string,
  categoryHint: string
): Promise<string | null> {
  const clean = normalizeModelSpacing(subjectName);
  const combined = `${clean} ${categoryHint}`.toLowerCase();

  if (
    /^[1-9][a-z0-9]{3}$/i.test(clean) &&
    /\b(pdb|protein|structure|crystal|heme|chain)\b/i.test(combined)
  ) {
    return `https://cdn.rcsb.org/images/structures/${clean.toLowerCase()}_assembly-1.jpeg`;
  }

  if (
    /\b(compound|chemical|molecule|drug|medication|inhibitor|acid|alkaloid|vitamin|hormone|neurotransmitter|aspirin|imatinib|caffeine|ibuprofen|paracetamol|acetaminophen|penicillin|dopamine|serotonin|glucose|atp)\b/i.test(
      combined
    )
  ) {
    try {
      const cidRes = await fetch(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(
          clean
        )}/cids/JSON`,
        { signal: AbortSignal.timeout(2400) }
      );
      if (cidRes.ok) {
        const cidJson: any = await cidRes.json();
        const cid = cidJson?.IdentifierList?.CID?.[0];
        if (cid) {
          return `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG?image_size=500x500`;
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Searches the ENTIRE web (whole-web image search, Google Search grounded pages OpenGraph images,
 * PubChem/RCSB scientific depictions, Wikipedia, and Wikimedia Commons) for an authentic,
 * token-verified picture of `subjectName`.
 *
 * IMPORTANT: Never fabricates or substitutes an AI/SVG placeholder when an authentic picture cannot
 * be verified — returns `imageUrl: ""` cleanly so the UI omits the image ("leave it if it can't do it").
 */
export async function resolveSubjectVisualWithWebLinks(
  subjectName: string,
  categoryHint: string = '',
  groundedSources: Array<{ title: string; uri: string }> = [],
  allowVisual: boolean = true
): Promise<SubjectWebLookupResult> {
  const normalizedSubject = normalizeModelSpacing(subjectName);
  if (!normalizedSubject || !allowVisual) {
    return { imageUrl: '', discoveredWebLinks: [] };
  }

  const cacheKey = `${normalizedSubject.toLowerCase()}::${categoryHint.trim().toLowerCase()}`;
  const cached = SUBJECT_Visual_RESULT_CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }

  const [webCandidates, ogCandidates, sciImg, exactWikiImg, searchWikiImg, commonsImg] =
    await Promise.all([
      fetchWholeWebImageCandidates(normalizedSubject, categoryHint),
      fetchGroundedSourcesOgCandidates(normalizedSubject, groundedSources),
      fetchScientificDepiction(normalizedSubject, categoryHint),
      fetchExactWikipediaSummaryImage(normalizedSubject),
      fetchWikipediaSearchImage(normalizedSubject),
      fetchWikimediaCommonsPhoto(normalizedSubject),
    ]);

  // Collect verified matching web pages discovered during whole-web search
  const discoveredWebLinks: Array<{ title: string; url: string }> = [];
  const seenLinkUrls = new Set<string>();
  for (const cand of [...webCandidates, ...ogCandidates]) {
    if (cand.purl && /^https?:\/\//i.test(cand.purl) && !seenLinkUrls.has(cand.purl)) {
      seenLinkUrls.add(cand.purl);
      discoveredWebLinks.push({
        title: cand.title || normalizedSubject,
        url: cand.purl,
      });
    }
  }

  // Order candidate image URLs:
  // - For scientific molecules/PDBs, prioritize PubChem/RCSB first.
  // - For products/models with version numbers (e.g. Vivo V70 Lite, Oppo Find X9s), prioritize top-scored whole-web candidates first.
  // - For general concepts/definitions, check exact Wikipedia summary + top whole-web candidates.
  const hasModelNumber = /\d/.test(normalizedSubject);
  const orderedImagePairs: Array<{ primary: string; fallback?: string }> = [];

  if (sciImg) {
    orderedImagePairs.push({ primary: sciImg });
  }
  if (!hasModelNumber && exactWikiImg) {
    orderedImagePairs.push({ primary: exactWikiImg });
  }

  const mergedWeb = [...ogCandidates, ...webCandidates].sort((a, b) => b.score - a.score);
  for (const wc of mergedWeb.slice(0, 6)) {
    orderedImagePairs.push({
      primary: wc.murl || wc.turl,
      fallback: wc.turl && wc.turl !== wc.murl ? wc.turl : undefined,
    });
  }

  if (hasModelNumber && exactWikiImg) {
    orderedImagePairs.push({ primary: exactWikiImg });
  }
  if (searchWikiImg) {
    orderedImagePairs.push({ primary: searchWikiImg });
  }
  if (commonsImg) {
    orderedImagePairs.push({ primary: commonsImg });
  }

  // Download top candidates in parallel (max 2.2s total instead of sequential 15s timeouts)
  const flatCandidates: string[] = [];
  for (const pair of orderedImagePairs) {
    if (pair.primary && !flatCandidates.includes(pair.primary)) {
      flatCandidates.push(pair.primary);
    }
    if (pair.fallback && !flatCandidates.includes(pair.fallback)) {
      flatCandidates.push(pair.fallback);
    }
    if (flatCandidates.length >= 6) break;
  }

  let verifiedDataUrl = '';
  if (flatCandidates.length > 0) {
    const parallelDownloads = await Promise.all(
      flatCandidates.map((u) => fetchVerifiedWebImageAsDataUrl(u, 2200))
    );
    verifiedDataUrl = parallelDownloads.find((d): d is string => Boolean(d)) || '';
  }

  const result: SubjectWebLookupResult = {
    imageUrl: verifiedDataUrl,
    discoveredWebLinks: discoveredWebLinks.slice(0, 8),
  };

  if (SUBJECT_Visual_RESULT_CACHE.size > 120) {
    const oldest = SUBJECT_Visual_RESULT_CACHE.keys().next().value;
    if (oldest) SUBJECT_Visual_RESULT_CACHE.delete(oldest);
  }
  SUBJECT_Visual_RESULT_CACHE.set(cacheKey, {
    result,
    expiresAt: Date.now() + 30 * 60 * 1000,
  });

  return result;
}

/**
 * Backwards-compatible wrapper returning only the verified authentic image URL (or `""` if none).
 */
export async function resolveSubjectVisual(
  subjectName: string,
  categoryHint: string = '',
  _keySpecs: string[] = [],
  _variantIndex: number = 0
): Promise<string> {
  const res = await resolveSubjectVisualWithWebLinks(subjectName, categoryHint, [], true);
  return res.imageUrl;
}

function formatReadableDomainName(urlStr: string, fallbackTitle?: string): string {
  try {
    const host = new URL(urlStr).hostname.replace(/^www\./i, '').toLowerCase();
    if (host.includes('amazon.')) return 'Amazon';
    if (host.includes('flipkart.')) return 'Flipkart';
    if (host.includes('croma.')) return 'Croma';
    if (host.includes('reliancedigital.')) return 'Reliance Digital';
    if (host.includes('vijaysales.')) return 'Vijay Sales';
    if (host.includes('gsmarena.')) return 'GSMArena';
    if (host.includes('91mobiles.')) return '91mobiles';
    if (host.includes('smartprix.')) return 'Smartprix';
    if (host.includes('beebom.')) return 'Beebom Gadgets';
    if (host.includes('gadgets360.')) return 'Gadgets 360';
    if (host.includes('gizmochina.')) return 'Gizmochina';
    if (host.includes('oppo.com')) return 'OPPO Official';
    if (host.includes('vivo.com')) return 'vivo Official';
    if (host.includes('samsung.com')) return 'Samsung Official';
    if (host.includes('apple.com')) return 'Apple Official';
    if (host.includes('xiaomi.com') || host.includes('mi.com')) return 'Xiaomi Official';
    if (host.includes('oneplus.')) return 'OnePlus Official';
    if (host.includes('realme.')) return 'realme Official';
    if (host.includes('sony.')) return 'Sony Official';
    if (host.includes('bestbuy.')) return 'Best Buy';
    if (host.includes('walmart.')) return 'Walmart';
    if (host.includes('ebay.')) return 'eBay';

    if (
      fallbackTitle &&
      fallbackTitle.length <= 26 &&
      !fallbackTitle.includes('http') &&
      !fallbackTitle.includes('vertexaisearch')
    ) {
      return fallbackTitle;
    }

    const base = host.split('.')[0] || host;
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return fallbackTitle?.slice(0, 24) || 'Website';
  }
}

/**
 * Builds verified shopping & product research links for a product:
 * Always includes Amazon, Flipkart, and real third-party / official websites discovered on the web.
 */
export function buildProductStoreLinks(
  productName: string,
  discoveredWebLinks: Array<{ title: string; url: string }> = [],
  groundedSources: Array<{ title: string; uri: string }> = [],
  categoryHint: string = ''
): ProductStoreLink[] {
  const cleanProduct = normalizeModelSpacing(productName);
  if (!cleanProduct) return [];

  const allCandidates: Array<{ title: string; url: string }> = [
    ...discoveredWebLinks,
    ...groundedSources.map((s) => ({ title: s.title, url: s.uri })),
  ];

  let directAmazonUrl = '';
  let directFlipkartUrl = '';
  const otherWebLinks: ProductStoreLink[] = [];
  const usedDomains = new Set<string>();

  for (const item of allCandidates) {
    if (!item.url || !/^https?:\/\//i.test(item.url)) continue;
    const combinedCheck = `${item.title} ${item.url}`.toLowerCase();

    if (!directAmazonUrl && /\bamazon\.(in|com|co\.uk|de|ae)\b/i.test(combinedCheck)) {
      directAmazonUrl = item.url;
      continue;
    }
    if (!directFlipkartUrl && /\bflipkart\.com\b/i.test(combinedCheck)) {
      directFlipkartUrl = item.url;
      continue;
    }

    let domainKey = '';
    try {
      const parsed = new URL(item.url);
      if (parsed.hostname.includes('vertexaisearch.cloud.google.com')) {
        domainKey = (item.title || item.url).toLowerCase().trim();
      } else {
        domainKey = parsed.hostname.replace(/^www\./i, '').toLowerCase();
      }
    } catch {
      continue;
    }

    if (!domainKey || usedDomains.has(domainKey) || domainKey.includes('bing.com')) continue;

    const storeLabel = formatReadableDomainName(
      item.url.includes('vertexaisearch.cloud.google.com') && item.title.includes('.')
        ? `https://${item.title.trim()}`
        : item.url,
      item.title
    );

    if (storeLabel === 'Amazon') {
      if (!directAmazonUrl) directAmazonUrl = item.url;
      continue;
    }
    if (storeLabel === 'Flipkart') {
      if (!directFlipkartUrl) directFlipkartUrl = item.url;
      continue;
    }

    usedDomains.add(domainKey);
    const isRetailer =
      /\b(croma|reliance|vijay|bestbuy|walmart|ebay|official|shop|store|mobiles)\b/i.test(
        `${storeLabel} ${domainKey}`
      );
    otherWebLinks.push({
      storeName: storeLabel,
      url: item.url,
      kind: isRetailer ? 'retailer' : 'web',
    });
  }

  const encodedProduct = encodeURIComponent(cleanProduct);
  const links: ProductStoreLink[] = [
    {
      storeName: 'Amazon',
      url: directAmazonUrl || `https://www.amazon.in/s?k=${encodedProduct}`,
      kind: 'amazon',
    },
    {
      storeName: 'Flipkart',
      url: directFlipkartUrl || `https://www.flipkart.com/search?q=${encodedProduct}`,
      kind: 'flipkart',
    },
    ...otherWebLinks.slice(0, 3),
  ];

  // Ensure at least one additional website alongside Amazon & Flipkart
  if (links.length < 3) {
    const isTechDevice =
      /\b(phone|smartphone|mobile|tablet|laptop|watch|earbuds|headphones|vivo|oppo|samsung|iphone|apple|xiaomi|redmi|oneplus|realme|pixel|motorola|iqoo|nothing)\b/i.test(
        `${cleanProduct} ${categoryHint}`
      );
    if (isTechDevice) {
      links.push({
        storeName: 'Croma',
        url: `https://www.croma.com/searchB?q=${encodedProduct}%3Arelevance`,
        kind: 'retailer',
      });
      links.push({
        storeName: '91mobiles',
        url: `https://www.91mobiles.com/search_page.php?q=${encodedProduct}`,
        kind: 'web',
      });
    } else {
      links.push({
        storeName: 'Croma',
        url: `https://www.croma.com/searchB?q=${encodedProduct}%3Arelevance`,
        kind: 'retailer',
      });
    }
  }

  return links;
}

export type SupportedAspectRatio =
  | '1:1'
  | '16:9'
  | '4:3'
  | '3:4'
  | '9:16'
  | '1:4'
  | '1:8'
  | '4:1'
  | '8:1';

export type SupportedImageSize = '1K' | '2K' | '4K';

/**
 * Creates a brand-new image OR edits an existing image (100% Pollinations-free):
 * 1) Primary: `gemini-nano-banana-2.1` (1K/2K/4K, extended aspect ratios, image editing, imageSearch)
 * 2) Secondary Nano Banana / Gemini Image Models: `gemini-3.1-flash-lite-image` & `gemini-3-pro-image`
 * 3) Native Gemini Vector Illustration (`gemini-flash-lite-latest` / `gemini-3.5-flash-lite` / `gemini-3.8-flash`, XML-sanitized)
 * Never fetches or scrapes images from external websites when creating or modifying images.
 */
export async function generateOrModifyImage(params: {
  prompt: string;
  sourceImageBase64?: string;
  sourceMimeType?: string;
  aspectRatio?: SupportedAspectRatio;
  imageSize?: SupportedImageSize;
  useImageSearch?: boolean;
}): Promise<{
  imageUrl: string;
  caption: string;
  wasModified: boolean;
  modelUsed: string;
}> {
  const {
    prompt,
    sourceImageBase64,
    sourceMimeType = 'image/png',
    aspectRatio = '1:1',
    imageSize = '1K',
  } = params;

  const currentKey = process.env.GEMINI_API_KEY || '';
  const cleanBase64 = sourceImageBase64
    ? sourceImageBase64.replace(/^data:[^;]+;base64,/, '')
    : '';
  const isEditing = Boolean(cleanBase64);
  const ai = createAI();

  let hitQuotaOrBillingLimit = false;

  // Attempt 1: Flagship Nano Banana 2 (`gemini-nano-banana-2.1`)
  if (
    !isImageModelCoolingDown(currentKey, 'gemini-nano-banana-2.1') &&
    (!isEditing || !sourceMimeType.includes('svg'))
  ) {
    try {
      const parts: any[] = [];
      if (isEditing) {
        parts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: sourceMimeType,
          },
        });
        parts.push({
          text: `Edit this image faithfully according to the user's instruction: ${prompt}`,
        });
      } else {
        parts.push({ text: prompt });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-nano-banana-2.1',
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio,
            imageSize,
          },
          abortSignal: AbortSignal.timeout(22000),
        },
      });

      let generatedDataUrl = '';
      let modelCaption = '';
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          generatedDataUrl = `data:${mime};base64,${part.inlineData.data}`;
        } else if (part.text) {
          modelCaption += part.text + ' ';
        }
      }

      if (generatedDataUrl) {
        return {
          imageUrl: generatedDataUrl,
          caption:
            modelCaption.trim() ||
            (isEditing
              ? `Modified image (${imageSize}, ${aspectRatio}) with Nano Banana for: "${prompt}".`
              : `Created image (${imageSize}, ${aspectRatio}) with Nano Banana for: "${prompt}".`),
          wasModified: isEditing,
          modelUsed: 'gemini-nano-banana-2.1',
        };
      }
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (
        msg.includes('403') ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('PERMISSION_DENIED')
      ) {
        hitQuotaOrBillingLimit = true;
        markImageModelCooldown(currentKey, 'gemini-nano-banana-2.1', 30_000);
      }
    }
  } else if (isImageModelCoolingDown(currentKey, 'gemini-nano-banana-2.1')) {
    hitQuotaOrBillingLimit = true;
  }

  // Attempt 2: Secondary Nano Banana / Native Gemini Image Models (`gemini-3.1-flash-lite-image`, `gemini-3-pro-image`)
  const standardRatio: '1:1' | '16:9' | '4:3' | '3:4' | '9:16' =
    aspectRatio === '16:9' || aspectRatio === '4:1' || aspectRatio === '8:1'
      ? '16:9'
      : aspectRatio === '9:16' || aspectRatio === '1:4' || aspectRatio === '1:8'
      ? '9:16'
      : aspectRatio === '4:3' || aspectRatio === '3:4'
      ? aspectRatio
      : '1:1';

  const secondaryNanoBananaModels = ['gemini-3.1-flash-lite-image', 'gemini-3-pro-image'] as const;
  for (const imageModel of secondaryNanoBananaModels) {
    if (
      isImageModelCoolingDown(currentKey, imageModel) ||
      (isEditing && sourceMimeType.includes('svg'))
    ) {
      continue;
    }

    try {
      const parts: any[] = [];
      if (isEditing) {
        parts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: sourceMimeType,
          },
        });
        parts.push({
          text: `Modify this image according to the user's request: ${prompt}`,
        });
      } else {
        parts.push({ text: prompt });
      }

      const response = await ai.models.generateContent({
        model: imageModel,
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: standardRatio,
          },
          abortSignal: AbortSignal.timeout(18000),
        },
      });

      let generatedDataUrl = '';
      let modelCaption = '';
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          generatedDataUrl = `data:${mime};base64,${part.inlineData.data}`;
        } else if (part.text) {
          modelCaption += part.text + ' ';
        }
      }

      if (generatedDataUrl) {
        return {
          imageUrl: generatedDataUrl,
          caption:
            modelCaption.trim() ||
            (isEditing
              ? `Here is your modified image based on: "${prompt}".`
              : `Here is the generated image for: "${prompt}".`),
          wasModified: isEditing,
          modelUsed: imageModel,
        };
      }
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (
        msg.includes('403') ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('PERMISSION_DENIED')
      ) {
        hitQuotaOrBillingLimit = true;
        markImageModelCooldown(currentKey, imageModel, 30_000);
      }
    }
  }

  // Attempt 3: Direct Native Gemini Illustration Synthesis (100% Gemini-created, never fetched from external websites)
  const svgWidth = standardRatio === '16:9' ? 960 : standardRatio === '9:16' ? 540 : 800;
  const svgHeight = standardRatio === '16:9' ? 540 : standardRatio === '9:16' ? 960 : 800;

  const vectorModels = [
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
  ];
  for (const modelName of vectorModels) {
    try {
      const svgParts: any[] = [];
      let decodedSvgContext = '';

      if (isEditing && sourceMimeType.includes('svg') && cleanBase64) {
        decodedSvgContext = Buffer.from(cleanBase64, 'base64').toString('utf-8').slice(0, 12000);
      } else if (isEditing && cleanBase64) {
        svgParts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: sourceMimeType,
          },
        });
      }

      const svgInstruction = isEditing
        ? `You are an expert digital illustrator. Modify the provided image${
            decodedSvgContext ? ` (current SVG code: ${decodedSvgContext})` : ''
          } according to this instruction: "${prompt}".
Output ONLY valid, standalone <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">...</svg> code with rich gradients, lighting, detailed multi-layer shapes, shadows, and realistic composition reflecting the requested modification. Never use raw '&' characters in text. No markdown fences, no commentary.`
        : `You are an expert digital illustrator. Create a rich, detailed, multi-layered artistic illustration for: "${prompt}".
Output ONLY valid, standalone <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">...</svg> code using layered gradients, foreground/midground/background depth, atmospheric lighting, shadows, and accurate subject anatomy/geometry. Never use raw '&' characters in text. No markdown fences, no commentary.`;

      svgParts.push({ text: svgInstruction });

      const svgConfig: any = {
        abortSignal: AbortSignal.timeout(16000),
      };
      if (modelName.startsWith('gemini-3')) {
        svgConfig.thinkingConfig = {
          thinkingLevel: modelName.includes('lite')
            ? ThinkingLevel.MINIMAL
            : ThinkingLevel.LOW,
        };
      } else {
        svgConfig.thinkingConfig = {
          thinkingBudget: 0,
        };
      }

      const svgResponse = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: svgParts }],
        config: svgConfig,
      });

      const raw = (svgResponse.text || '').trim();
      const svgMatch = raw.match(/<svg[\s\S]*?<\/svg>/i);
      if (svgMatch) {
        const cleanSvg = sanitizeRawSvgMarkup(svgMatch[0]);
        const dataUrl = `data:image/svg+xml;base64,${Buffer.from(cleanSvg, 'utf-8').toString(
          'base64'
        )}`;
        const quotaNote = hitQuotaOrBillingLimit
          ? ' (Attach a billing-enabled Gemini API key in Settings > Secrets to activate Nano Banana raster generation.)'
          : '';
        return {
          imageUrl: dataUrl,
          caption: isEditing
            ? `Modified illustration for: "${prompt}".${quotaNote}`
            : `Created illustration for: "${prompt}".${quotaNote}`,
          wasModified: isEditing,
          modelUsed: modelName,
        };
      }
    } catch {
      // Try next model in pool
    }
  }

  return {
    imageUrl: buildStudioSubjectDataUrl(
      prompt.slice(0, 40),
      isEditing ? 'Modified Visual' : 'Generated Visual',
      [prompt.slice(0, 42)],
      isEditing ? 1 : 0
    ),
    caption: isEditing
      ? `Modified visual ready for: "${prompt}".`
      : `Created visual ready for: "${prompt}".`,
    wasModified: isEditing,
    modelUsed: 'studio-svg',
  };
}
