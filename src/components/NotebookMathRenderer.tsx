import React from 'react';
import 'katex/dist/katex.min.css';
import { BlockMath, InlineMath } from 'react-katex';
import { Check, Copy } from 'lucide-react';

interface NotebookMathRendererProps {
  text: string;
  copiedKey: string | null;
  onCopyBlock: (code: string, key: string) => void;
}

/**
 * Extracts a brace-delimited argument `{...}` starting at `startIdx` (where `str[startIdx] === '{'`).
 * Supports arbitrarily nested braces so nested fractions like `\frac{\frac{1}{2}}{3}` parse cleanly.
 */
function extractBracedGroup(
  str: string,
  startIdx: number
): { content: string; nextIdx: number } | null {
  let idx = startIdx;
  while (idx < str.length && str[idx] === ' ') idx++;
  if (idx >= str.length || str[idx] !== '{') return null;

  let depth = 0;
  const contentStart = idx + 1;
  for (let i = idx; i < str.length; i++) {
    if (str[i] === '{' && str[i - 1] !== '\\') {
      depth++;
    } else if (str[i] === '}' && str[i - 1] !== '\\') {
      depth--;
      if (depth === 0) {
        return {
          content: str.slice(contentStart, i),
          nextIdx: i + 1,
        };
      }
    }
  }
  return null;
}

/**
 * Converts plain slash fractions inside a mathematical expression (e.g., `3/4`, `(a + b)/(c + d)`, `2 3/4`)
 * into proper LaTeX `\frac{num}{den}` while preserving existing LaTeX commands.
 */
function convertPlainFractionsToLatex(expr: string): string {
  let out = expr;

  // 1. Parenthesized numerator and denominator: (a + b) / (c + d)
  out = out.replace(
    /\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g,
    (_m, num, den) => `\\frac{${num.trim()}}{${den.trim()}}`
  );

  // 2. Parenthesized numerator: (a + b) / 4x
  out = out.replace(
    /\(([^()]+)\)\s*\/\s*([0-9a-zA-Z]+)/g,
    (_m, num, den) => `\\frac{${num.trim()}}{${den.trim()}}`
  );

  // 3. Parenthesized denominator: 3 / (c + d)
  out = out.replace(
    /([0-9a-zA-Z]+)\s*\/\s*\(([^()]+)\)/g,
    (_m, num, den) => `\\frac{${num.trim()}}{${den.trim()}}`
  );

  // 4. Mixed numbers like `2 3/4` -> `2\frac{3}{4}`
  out = out.replace(
    /(^|[=+\-×÷*(\s])(\d+)\s+(\d{1,5})\s*\/\s*(\d{1,5})(?=$|[=+\-×÷*)\s,.])/g,
    '$1$2\\frac{$3}{$4}'
  );

  // 5. Simple numeric or algebraic slash fractions: `3/4`, `15/8`, `a/b`, `3x/4y`
  out = out.replace(
    /(?<![\\a-zA-Z0-9])([0-9]{1,6}[a-zA-Z]?|[a-zA-Z])\s*\/\s*([0-9]{1,6}[a-zA-Z]?|[a-zA-Z])(?![a-zA-Z0-9])/g,
    '\\frac{$1}{$2}'
  );

  return out;
}

/**
 * Stabilizes incomplete LaTeX expressions while tokens are actively streaming so `react-katex`
 * renders progressive equations smoothly without flashing ParseError strings.
 */
function stabilizeStreamingLatex(expr: string): string {
  let s = expr.trim();
  if (!s) return s;

  // Strip trailing incomplete control sequence or bare script operator at end of stream
  s = s.replace(/\\[a-zA-Z]*$/, (cmd) => {
    if (
      /^\\(?:times|div|cdot|pm|mp|le|leq|ge|geq|neq|approx|infty|pi|theta|Delta|alpha|beta|gamma|to|rightarrow|Rightarrow)$/.test(
        cmd
      )
    ) {
      return `${cmd} \\square`;
    }
    return '';
  });
  s = s.replace(/[\^_]$/, '');

  // Balance open curly braces `{`
  let braceDepth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{' && s[i - 1] !== '\\') braceDepth++;
    else if (s[i] === '}' && s[i - 1] !== '\\') braceDepth = Math.max(0, braceDepth - 1);
  }
  if (braceDepth > 0) {
    s += '}'.repeat(braceDepth);
  }

  // If `\frac{num}` is still missing its denominator `{den}` mid-stream, append `{}`
  s = s.replace(/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*$/, '\\frac{$1}{\\cdots}');

  // Balance `\left` without matching `\right`
  const leftCount = (s.match(/\\left\b/g) || []).length;
  const rightCount = (s.match(/\\right\b/g) || []).length;
  if (leftCount > rightCount) {
    s += '\\right.'.repeat(leftCount - rightCount);
  }

  return s;
}

/**
 * Normalizes mathematical expressions into clean KaTeX-ready LaTeX, ensuring:
 * - Multiplication uses proper `\times` (`×`) notation instead of `*` or `\ast`
 * - Division uses proper `\div` (`÷`) or stacked `\frac{a}{b}` notation
 * - Unicode symbols (`×`, `÷`, `±`, `√`, `²`, `₁`, etc.) map cleanly to KaTeX macros
 */
export function normalizeLatexForKatex(rawExpr: string, convertSlashFractions = true): string {
  let expr = rawExpr.trim();
  if (!expr) return '';

  // Normalize align/align* environments to KaTeX-supported `aligned`
  expr = expr
    .replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
    .replace(/\\end\{align\*?\}/g, '\\end{aligned}');

  // Normalize Unicode math operators & Greek letters to canonical LaTeX commands
  expr = expr
    .replace(/×/g, ' \\times ')
    .replace(/÷/g, ' \\div ')
    .replace(/·/g, ' \\cdot ')
    .replace(/−/g, '-')
    .replace(/±/g, ' \\pm ')
    .replace(/∓/g, ' \\mp ')
    .replace(/≤/g, ' \\le ')
    .replace(/≥/g, ' \\ge ')
    .replace(/≠/g, ' \\neq ')
    .replace(/≈/g, ' \\approx ')
    .replace(/∞/g, '\\infty ')
    .replace(/π/g, '\\pi ')
    .replace(/θ/g, '\\theta ')
    .replace(/Δ/g, '\\Delta ')
    .replace(/α/g, '\\alpha ')
    .replace(/β/g, '\\beta ')
    .replace(/γ/g, '\\gamma ')
    .replace(/→/g, ' \\rightarrow ')
    .replace(/⇒/g, ' \\Rightarrow ')
    .replace(/⁰/g, '^{0}')
    .replace(/¹/g, '^{1}')
    .replace(/²/g, '^{2}')
    .replace(/³/g, '^{3}')
    .replace(/⁴/g, '^{4}')
    .replace(/₀/g, '_{0}')
    .replace(/₁/g, '_{1}')
    .replace(/₂/g, '_{2}')
    .replace(/₃/g, '_{3}')
    .replace(/₄/g, '_{4}')
    .replace(/√\s*\(([^()]+)\)/g, '\\sqrt{$1}')
    .replace(/√\s*([0-9a-zA-Z]+)/g, '\\sqrt{$1}');

  // Ensure computer multiplication `*` and `\ast` follow proper `\times` notation
  expr = expr
    .replace(/\\ast\b/g, '\\times')
    .replace(/(?<=[0-9a-zA-Z)\]}])\s*\*\s*(?=[0-9a-zA-Z(\[{\\])/g, ' \\times ');

  if (convertSlashFractions) {
    expr = convertPlainFractionsToLatex(expr);
  }

  return stabilizeStreamingLatex(expr).replace(/\s{2,}/g, ' ').trim();
}

/**
 * Clean human-readable fallback if an invalid/incomplete LaTeX string encounters a KaTeX ParseError.
 */
function readableMathFallback(raw: string): string {
  return raw
    .replace(/\\(?:d|t)?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\times\b/g, '×')
    .replace(/\\div\b/g, '÷')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\pm\b/g, '±')
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, '√($1)')
    .replace(/\\(?:text|textbf|mathrm|cancel|boxed)\s*\{([^{}]+)\}/g, '$1')
    .replace(/[{}]/g, '');
}

const SafeInlineMath: React.FC<{ math: string; rawFallback?: string }> = ({
  math,
  rawFallback,
}) => {
  const normalized = normalizeLatexForKatex(math, true);
  if (!normalized) return null;
  return (
    <span className="inline-block align-middle mx-0.5">
      <InlineMath
        math={normalized}
        renderError={() => (
          <span className="font-mono text-[0.92em]">{readableMathFallback(rawFallback || math)}</span>
        )}
      />
    </span>
  );
};

const SafeBlockMath: React.FC<{ math: string; rawFallback?: string }> = ({
  math,
  rawFallback,
}) => {
  const normalized = normalizeLatexForKatex(math, true);
  if (!normalized) return null;
  return (
    <div className="overflow-x-auto py-0.5">
      <BlockMath
        math={normalized}
        renderError={() => (
          <div className="font-mono text-sm">{readableMathFallback(rawFallback || math)}</div>
        )}
      />
    </div>
  );
};

/**
 * Scans a plain text string (outside explicit `$...$` delimiters) starting at `startIdx`
 * to consume a contiguous naked LaTeX equation/expression (e.g., `\frac{3}{4} \times \frac{2}{5} = \frac{3}{10}`).
 */
function consumeNakedLatexSpan(str: string, cmdIdx: number): { start: number; end: number } {
  // Walk slightly backward to include leading number/variable/sign/equals (e.g. `1\frac{7}{8}` or `x = \frac{3}{4}`)
  let start = cmdIdx;
  while (start > 0) {
    const prevSlice = str.slice(0, start);
    const leadMatch = prevSlice.match(/(?:[0-9a-zA-Z()+\-=×÷*]+\s*)$/);
    if (leadMatch) {
      // Avoid absorbing normal English words of 2+ letters like "is " or "So "
      const trimmedLead = leadMatch[0].trim();
      if (/^[a-zA-Z]{2,}$/.test(trimmedLead)) {
        break;
      }
      start -= leadMatch[0].length;
    } else {
      break;
    }
  }

  let cursor = cmdIdx;
  while (cursor < str.length) {
    const rest = str.slice(cursor);

    // Match LaTeX commands with braced args: \frac{a}{b}, \dfrac{a}{b}, \sqrt[n]{x}, \cancel{x}, \text{x}, \boxed{x}
    const fracCmd = rest.match(/^\\(?:d|t)?frac\b/);
    if (fracCmd) {
      const g1 = extractBracedGroup(str, cursor + fracCmd[0].length);
      if (g1) {
        const g2 = extractBracedGroup(str, g1.nextIdx);
        if (g2) {
          cursor = g2.nextIdx;
          continue;
        }
      }
    }

    if (rest.startsWith('\\sqrt')) {
      let c = cursor + 5;
      if (str[c] === '[') {
        const closeB = str.indexOf(']', c + 1);
        if (closeB !== -1) c = closeB + 1;
      }
      const g = extractBracedGroup(str, c);
      if (g) {
        cursor = g.nextIdx;
        continue;
      }
    }

    const singleArgCmd = rest.match(/^\\(?:cancel|boxed|text|textbf|mathrm|mathbf)\b/);
    if (singleArgCmd) {
      const g = extractBracedGroup(str, cursor + singleArgCmd[0].length);
      if (g) {
        cursor = g.nextIdx;
        continue;
      }
    }

    // Match operator/symbol macros: \times, \div, \cdot, \pm, \le, \ge, \neq, \approx, \pi, etc.
    const symCmd = rest.match(
      /^\\(?:times|div|cdot|ast|pm|mp|leq?|geq?|neq|approx|infty|pi|theta|Delta|alpha|beta|gamma|to|rightarrow|Rightarrow)\b/
    );
    if (symCmd) {
      cursor += symCmd[0].length;
      continue;
    }

    // Match superscripts / subscripts `^{...}`, `_{...}`, `^2`, `_1`
    if (str[cursor] === '^' || str[cursor] === '_') {
      const g = extractBracedGroup(str, cursor + 1);
      if (g) {
        cursor = g.nextIdx;
        continue;
      }
      const subSup = rest.slice(1).match(/^[0-9a-zA-Z+\-]+/);
      if (subSup) {
        cursor += 1 + subSup[0].length;
        continue;
      }
    }

    // Match contiguous math continuations: whitespace + operators + numbers/fractions/parens/single-letter vars
    const contMatch = rest.match(
      /^(?:\s*[=+\-×÷*/^()]+\s*(?=[0-9\\(\-a-zA-Z])|\s*[0-9]+(?:\.[0-9]+)?|[()]|\s+[a-zA-Z](?=\s*[=+\-×÷*/^)\\]|$))/
    );
    if (contMatch) {
      cursor += contMatch[0].length;
      continue;
    }

    break;
  }

  return { start, end: cursor };
}

type ProseToken = { type: 'text' | 'math'; value: string };

/**
 * Tokenizes plain prose (without `$` delimiters) into normal text and inline mathematical expressions
 * (fractions, multiplication, division, and naked LaTeX commands), while protecting URLs and dates.
 */
function tokenizePlainProseForMath(input: string): ProseToken[] {
  if (!input) return [];

  // Protect URLs and multi-slash dates (e.g., 2026/10/30 or 10/30/2026) first
  const protectedSplit = input.split(/(https?:\/\/\S+|\b\d{1,4}\/\d{1,2}\/\d{1,4}\b)/gi);
  const tokens: ProseToken[] = [];

  for (const chunk of protectedSplit) {
    if (!chunk) continue;
    if (/^(?:https?:\/\/\S+|\d{1,4}\/\d{1,2}\/\d{1,4})$/i.test(chunk)) {
      tokens.push({ type: 'text', value: chunk });
      continue;
    }

    // Step A: Extract naked LaTeX spans (\frac, \dfrac, \sqrt, \times, \div, \cancel, \boxed)
    const afterNaked: ProseToken[] = [];
    let pos = 0;
    const nakedStarterRegex =
      /\\(?:(?:d|t)?frac|sqrt|cancel|boxed|times|div|cdot|pm|leq?|geq?|neq|approx)\b/;

    while (pos < chunk.length) {
      const sub = chunk.slice(pos);
      const m = nakedStarterRegex.exec(sub);
      if (!m) {
        afterNaked.push({ type: 'text', value: sub });
        break;
      }
      const cmdAbsIdx = pos + m.index;
      const span = consumeNakedLatexSpan(chunk, cmdAbsIdx);
      if (span.end <= cmdAbsIdx) {
        afterNaked.push({ type: 'text', value: chunk.slice(pos, cmdAbsIdx + m[0].length) });
        pos = cmdAbsIdx + m[0].length;
        continue;
      }
      if (span.start > pos) {
        afterNaked.push({ type: 'text', value: chunk.slice(pos, span.start) });
      }
      afterNaked.push({ type: 'math', value: chunk.slice(span.start, span.end) });
      pos = span.end;
    }

    // Step B: Inside remaining plain text tokens, detect arithmetic equations, multiplication, division, & fractions
    // Matches:
    //  1) Multi-term arithmetic involving fractions, ×, ÷, *, or = (e.g. `3/4 * 2/5 = 3/10`, `15 ÷ 3 = 5`, `12 * 8`, `(2 + 3)/(4 * 5)`)
    //  2) Mixed numbers (e.g. `2 3/4`)
    //  3) Standalone numeric fractions (e.g. `3/4`, `15/8`, excluding idioms like `24/7`, `50/50`, `10/10`)
    const plainMathRegex =
      /((?<![a-zA-Z0-9_])(?:\([0-9+\-×÷*/.\s]+\)|-?\d+(?:\.\d+)?(?:\s+\d{1,4}\/\d{1,4}|\s*\/\s*\d{1,5})?)(?:\s*(?:[×÷*]|[+\-=]\s*(?=[-(\d]))\s*(?:\([0-9+\-×÷*/.\s]+\)|-?\d+(?:\.\d+)?(?:\s+\d{1,4}\/\d{1,4}|\s*\/\s*\d{1,5})?))+|\b\d+\s+[1-9]\d{0,3}\s*\/\s*[2-9]\d{0,3}\b|(?<![a-zA-Z0-9_/.:-])-?[1-9]\d{0,3}\s*\/\s*[2-9]\d{0,3}(?![a-zA-Z0-9_/.:-]))/g;

    for (const item of afterNaked) {
      if (item.type === 'math') {
        tokens.push(item);
        continue;
      }

      let lastIdx = 0;
      let match: RegExpExecArray | null;
      plainMathRegex.lastIndex = 0;

      while ((match = plainMathRegex.exec(item.value)) !== null) {
        const candidate = match[0];
        const compact = candidate.replace(/\s+/g, '');

        // Skip common non-math slash idioms like 24/7, 50/50, 10/10, 100/100
        if (/^(?:24\/7|50\/50|10\/10|100\/100|20\/20|9\/11)$/.test(compact)) {
          continue;
        }

        if (match.index > lastIdx) {
          tokens.push({ type: 'text', value: item.value.slice(lastIdx, match.index) });
        }
        tokens.push({ type: 'math', value: candidate });
        lastIdx = match.index + candidate.length;
      }

      if (lastIdx < item.value.length) {
        tokens.push({ type: 'text', value: item.value.slice(lastIdx) });
      }
    }
  }

  return tokens;
}

function renderBoldAndPlainMath(text: string, keyBase: string): React.ReactNode {
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  return boldParts.map((part, idx) => {
    const pKey = `${keyBase}_b_${idx}`;
    const isBold = part.startsWith('**') && part.endsWith('**') && part.length > 4;
    const raw = isBold ? part.slice(2, -2) : part;

    const subTokens = tokenizePlainProseForMath(raw);
    const rendered = subTokens.map((tok, tIdx) =>
      tok.type === 'math' ? (
        <SafeInlineMath key={`${pKey}_m_${tIdx}`} math={tok.value} rawFallback={tok.value} />
      ) : (
        <React.Fragment key={`${pKey}_t_${tIdx}`}>{tok.value}</React.Fragment>
      )
    );

    return isBold ? (
      <strong key={pKey} className="font-semibold text-black dark:text-white">
        {rendered}
      </strong>
    ) : (
      <React.Fragment key={pKey}>{rendered}</React.Fragment>
    );
  });
}

function renderDisplayMathCard(inner: string, keyPrefix: string): React.ReactNode {
  const trimmed = inner.trim();
  if (!trimmed) return null;

  // Keep structured multi-line LaTeX environments (`aligned`, `cases`, `pmatrix`, `bmatrix`, `array`) intact
  if (/\\begin\{/.test(trimmed)) {
    return (
      <div
        key={keyPrefix}
        className="my-2.5 px-4 py-3 rounded-xl bg-white dark:bg-[#111113] border border-neutral-200 dark:border-neutral-800 text-black dark:text-neutral-100 overflow-x-auto"
      >
        <SafeBlockMath math={trimmed} rawFallback={trimmed} />
      </div>
    );
  }

  // Split step-by-step equations on `\\` or newlines so each step renders cleanly via BlockMath
  const steps = trimmed
    .split(/\\\\|\n+/)
    .map((s) => s.replace(/&=/g, '=').replace(/&/g, ' ').trim())
    .filter(Boolean);

  if (steps.length === 0) return null;

  return (
    <div
      key={keyPrefix}
      className="my-2.5 px-4 py-3 rounded-xl bg-white dark:bg-[#111113] border border-neutral-200 dark:border-neutral-800 space-y-2 overflow-x-auto"
    >
      {steps.map((step, sIdx) => (
        <div
          key={`${keyPrefix}_st_${sIdx}`}
          className="text-black dark:text-neutral-100 border-b border-dashed border-neutral-200/80 dark:border-neutral-800/80 last:border-b-0 pb-1.5 last:pb-0"
        >
          <SafeBlockMath math={step} rawFallback={step} />
        </div>
      ))}
    </div>
  );
}

/**
 * Renders inline prose line with full `react-katex` support for:
 * - `$...$` and `\(...\)` inline math (`<InlineMath />`)
 * - `$$...$$` and `\[...\]` display math (`<BlockMath />`)
 * - Naked LaTeX commands (`\frac{...}{...}`, `\sqrt{...}`, `\times`, `\div`)
 * - Plain inline fractions, multiplication (`×` / `*`), and division (`÷` / `/`)
 * - Bold `**...**` markdown
 */
export function renderInlineProseAndMath(line: string, lineKey: string): React.ReactNode {
  const segments = line.split(
    /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$(?!\$)[^$\n]+\$|\\\([\s\S]+?\\\))/g
  );

  return segments.map((seg, idx) => {
    const segKey = `${lineKey}_s_${idx}`;
    if (!seg) return null;

    if (
      (seg.startsWith('$$') && seg.endsWith('$$') && seg.length > 4) ||
      (seg.startsWith('\\[') && seg.endsWith('\\]') && seg.length > 4)
    ) {
      const inner = seg.slice(2, -2);
      return renderDisplayMathCard(inner, segKey);
    }

    if (
      (seg.startsWith('$') && seg.endsWith('$') && seg.length > 2) ||
      (seg.startsWith('\\(') && seg.endsWith('\\)') && seg.length > 4)
    ) {
      const inner = seg.startsWith('$') ? seg.slice(1, -1) : seg.slice(2, -2);
      return <SafeInlineMath key={segKey} math={inner} rawFallback={inner} />;
    }

    return (
      <span key={segKey} className="inline">
        {renderBoldAndPlainMath(seg, segKey)}
      </span>
    );
  });
}

export const InlineMathProse: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  return <>{renderInlineProseAndMath(text, 'aimode')}</>;
};

export const NotebookMathRenderer: React.FC<NotebookMathRendererProps> = ({
  text,
  copiedKey,
  onCopyBlock,
}) => {
  // Close any unclosed trailing `$$` during live token streaming so equations render smoothly right away
  let streamSafeText = text;
  const doubleDollarMatches = streamSafeText.match(/\$\$/g);
  if (doubleDollarMatches && doubleDollarMatches.length % 2 === 1) {
    streamSafeText = `${streamSafeText}$$`;
  }

  // Split fenced code blocks first so code is never altered by math formatting
  const codeSegments = streamSafeText.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-1.5 leading-relaxed">
      {codeSegments.map((segment, index) => {
        if (segment.startsWith('```') && segment.endsWith('```')) {
          const inner = segment.slice(3, -3);
          const newlineIdx = inner.indexOf('\n');
          const lang = newlineIdx !== -1 ? inner.slice(0, newlineIdx).trim().toLowerCase() : '';
          const code = newlineIdx !== -1 ? inner.slice(newlineIdx + 1) : inner;
          const blockKey = `code_${index}`;

          // Special Notebook Column Math / Long Division block (` ```math-note `)
          if (lang === 'math-note' || lang === 'notebook' || lang === 'long-division') {
            return (
              <div
                key={blockKey}
                className="my-3 px-4 py-3 rounded-xl bg-white dark:bg-[#111113] border border-neutral-200 dark:border-neutral-800 overflow-x-auto"
              >
                <pre className="text-sm font-mono tabular-nums text-black dark:text-neutral-100 leading-relaxed whitespace-pre">
                  {code.trimEnd()}
                </pre>
              </div>
            );
          }

          return (
            <div
              key={blockKey}
              className="my-3 rounded-lg bg-neutral-50 dark:bg-black border border-neutral-200 dark:border-neutral-800 overflow-hidden"
            >
              <div className="px-3 py-1.5 bg-neutral-100 dark:bg-[#0e0e0e] border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-[11px] font-mono text-neutral-600 dark:text-neutral-400">
                <span>{lang || 'code'}</span>
                <button
                  type="button"
                  onClick={() => onCopyBlock(code, blockKey)}
                  className="inline-flex items-center gap-1 text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white transition cursor-pointer"
                >
                  {copiedKey === blockKey ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3 overflow-x-auto text-xs font-mono text-black dark:text-neutral-200 leading-relaxed">
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        // Split multi-line display math blocks (`$$ ... $$` or `\[ ... \]`) from surrounding paragraphs
        const displayBlocks = segment.split(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/g);

        return (
          <React.Fragment key={`seg_${index}`}>
            {displayBlocks.map((block, bIdx) => {
              const blockKey = `blk_${index}_${bIdx}`;
              if (!block) return null;

              if (
                (block.startsWith('$$') && block.endsWith('$$')) ||
                (block.startsWith('\\[') && block.endsWith('\\]'))
              ) {
                const inner = block.slice(2, -2);
                return renderDisplayMathCard(inner, blockKey);
              }

              // Render normal lines preserving paragraph & list line breaks cleanly
              const lines = block.split('\n');
              return (
                <React.Fragment key={blockKey}>
                  {lines.map((ln, lIdx) => {
                    const trimmed = ln.trim();
                    if (!trimmed) {
                      return lIdx < lines.length - 1 ? (
                        <div key={`${blockKey}_sp_${lIdx}`} className="h-1.5" />
                      ) : null;
                    }

                    // Clean Markdown headings (`### Step 1`) without showing raw `###`
                    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
                    if (headingMatch) {
                      return (
                        <div
                          key={`${blockKey}_hd_${lIdx}`}
                          className="font-display font-bold text-black dark:text-white pt-1.5 text-[15px]"
                        >
                          {renderInlineProseAndMath(headingMatch[2], `${blockKey}_hdc_${lIdx}`)}
                        </div>
                      );
                    }

                    return (
                      <div key={`${blockKey}_ln_${lIdx}`} className="whitespace-pre-wrap">
                        {renderInlineProseAndMath(ln, `${blockKey}_lnc_${lIdx}`)}
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/**
 * Converts LaTeX math notation (`\frac{3}{4}`, `\times`, `\div`) into natural spoken words
 * so Jarvis speaks math answers clearly instead of pronouncing raw backslashes.
 */
export function mathToSpokenPlainText(input: string): string {
  let out = input;
  for (let pass = 0; pass < 2; pass++) {
    out = out.replace(/\\(?:d|t)?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1 over $2');
  }
  return out
    .replace(/\$\$/g, ' ')
    .replace(/\$/g, ' ')
    .replace(/\\\[|\\\]|\\\(|\\\)/g, ' ')
    .replace(/\\times\b|×/g, ' times ')
    .replace(/\\div\b|÷/g, ' divided by ')
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, ' square root of $1 ')
    .replace(/\\(?:text|textbf|mathrm|cancel|boxed)\s*\{([^{}]+)\}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
