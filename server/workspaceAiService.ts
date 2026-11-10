import { GoogleGenAI } from '@google/genai';

function getAI(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({
    apiKey: key,
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

const WORKSPACE_MODEL_CASCADE = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
] as const;

/**
 * Extracts ONLY the core subject/topic from natural language user commands such as:
 * "Can you create a Google Slides presentation about Quantum Computing and apply theme?" -> "Quantum Computing"
 * "Write a Google Doc on Photosynthesis and paste it in Google Docs" -> "Photosynthesis"
 * "Make an Excel sheet for Startup Monthly Budget" -> "Startup Monthly Budget"
 */
export function extractCoreTopic(rawInput: string): string {
  if (!rawInput || !rawInput.trim()) return '';

  let s = rawInput.trim();

  // Remove wake words / polite prefixes
  s = s.replace(
    /^(?:(?:hey|ok|okay|hi)\s+)?(?:jarvis|javis)[\s,.:;-]+/i,
    ''
  );
  s = s.replace(
    /^(?:can you|could you|would you|will you|please|kindly|i want you to|i need you to|help me to?|let's)\s+/gi,
    ''
  );
  // Repeat once for stacked polite phrases ("can you please ...")
  s = s.replace(/^(?:please|just|quickly)\s+/i, '');

  // Remove trailing workspace routing clauses ("and paste it in google docs", "with a matching theme", etc.)
  s = s.replace(
    /\s+(?:and\s+)?(?:paste|put|save|insert|add|keep|store)\s+(?:it|this|that|everything|the\s+(?:content|thing|info|information))?\s*(?:in|into|to|on)\s+(?:a\s+|my\s+|new\s+)?(?:google\s*)?(?:docs?|documents?|slides?|presentations?|sheets?|spreadsheets?|excel(?:\s*file)?|drive)\b.*$/i,
    ''
  );
  s = s.replace(
    /\s+(?:and\s+)?(?:apply|with|using)\s+(?:a\s+|an\s+|the\s+)?(?:matching|proper|appropriate|custom|dynamic|cool|nice|topic)?\s*(?:theme|background|style|palette|colors?)\b.*$/i,
    ''
  );
  s = s.replace(
    /\s+(?:in|into|to)\s+(?:a\s+|new\s+)?(?:google\s*)?(?:docs?|documents?|slides?|presentations?|sheets?|spreadsheets?|excel)\s*$/i,
    ''
  );

  // Remove leading action verbs + stacked artifact nouns + connector prepositions
  const commandLeadRegex =
    /^(?:(?:search(?:\s+the\s+web)?|look\s*up|find|get|research|analyze|explain|tell\s+me)\s+(?:the\s+)?(?:right\s+|accurate\s+|detailed\s+)?(?:info|information|details|facts)\s+(?:about|on|for|regarding)\s+|(?:make|create|generate|build|prepare|design|draft|write|compose|produce|give\s+me|put|paste|save|insert|copy|add)\s+(?:(?:a|an|the|some|new|detailed|comprehensive|full|clear|proper|good)\s+)*(?:(?:google|microsoft|ms)\s+)?(?:(?:slides?|docs?|sheets?|excel)\s+)?(?:slides?\s*deck|presentations?|slide\s*decks?|slides?|pitch\s*decks?|ppt|powerpoint|docs?|documents?|reports?|proposals?|articles?|essays?|notes?|summaries|summary|sheets?|spreadsheets?|excel(?:\s+(?:sheets?|workbooks?|models?|tables?|files?))?|workbooks?|tables?|information|info|content)?\s*(?:about|on|regarding|covering|for|of|titled|called|named)?\s*)/i;

  let prev = '';
  let guard = 0;
  while (s !== prev && guard < 4) {
    prev = s;
    s = s.replace(commandLeadRegex, '').trim();
    guard++;
  }

  // Clean leftover leading artifact nouns or prepositions
  s = s
    .replace(
      /^(?:(?:presentation|slide\s*deck|slides?|document|docs?|spreadsheet|sheets?|excel|report|proposal)\s+)?(?:about|on|regarding|covering|for)\s+/i,
      ''
    )
    .trim();

  // Remove trailing politeness / filler words
  s = s
    .replace(/\s+(?:for me|please|right now|properly|with clearance|in detail)\s*[.?!]*$/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/[?!.]+$/g, '')
    .trim();

  // If stripping left almost nothing, fall back cleanly to cleaned original without punctuation
  if (s.length < 2) {
    return rawInput.trim().replace(/[?!]+$/g, '');
  }

  return s;
}

function cleanJsonText(raw: string): string {
  let cleaned = raw.trim();
  const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    cleaned = fencedMatch[1].trim();
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned.trim();
}

function parseJsonSafe(raw: string): any | null {
  try {
    return JSON.parse(cleanJsonText(raw));
  } catch {
    return null;
  }
}

/**
 * Generates accurate, topic-grounded structured JSON using live Google Search grounding
 * first, then falls back cleanly across the fast JSON-mode Gemini cascade.
 */
async function generateGroundedJson<T>(
  prompt: string,
  temperature: number,
  validate: (parsed: any) => T | null,
  preferSearch = true
): Promise<T | null> {
  const ai = getAI();

  // Pass 1: Live Google Search grounded models for accurate, real-world information
  if (preferSearch) {
    for (const model of ['gemini-3.8-flash', 'gemini-flash-latest']) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            temperature,
            abortSignal: AbortSignal.timeout(12000),
          },
        });
        const parsed = parseJsonSafe(response.text || '');
        if (parsed) {
          const valid = validate(parsed);
          if (valid) return valid;
        }
      } catch (err) {
        console.warn(`[workspaceAiService] Search-grounded ${model} error:`, (err as any)?.message || err);
      }
    }
  }

  // Pass 2: Strict JSON-mode fallback cascade across working models
  for (const model of WORKSPACE_MODEL_CASCADE) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature,
          abortSignal: AbortSignal.timeout(12000),
        },
      });
      const parsed = parseJsonSafe(response.text || '');
      if (parsed) {
        const valid = validate(parsed);
        if (valid) return valid;
      }
    } catch (err) {
      console.warn(`[workspaceAiService] JSON model ${model} error:`, (err as any)?.message || err);
    }
  }

  return null;
}

// ---------------- Presentation Generation ----------------

export interface GeneratedSlide {
  title: string;
  subtitle?: string;
  bullets: string[];
}

export interface SlideRgbColor {
  red: number;
  green: number;
  blue: number;
}

export interface SlideTheme {
  name: string;
  description?: string;
  layoutStyle?: 'minimal-bold' | 'editorial' | 'data-heavy' | 'modern-card';
  backgroundColor: SlideRgbColor;
  titleColor: SlideRgbColor;
  bodyColor: SlideRgbColor;
  accentColor: SlideRgbColor;
  hexBg: string;
  hexTitle: string;
  hexBody: string;
  hexAccent?: string;
}

export interface GeneratedPresentation {
  title: string;
  subtitle: string;
  theme: SlideTheme;
  slides: GeneratedSlide[];
}

// Topic-tailored color themes
function getTopicTheme(topic: string, aiTheme?: any): SlideTheme {
  const t = topic.toLowerCase();

  if (
    aiTheme &&
    aiTheme.backgroundColor &&
    typeof aiTheme.backgroundColor.red === 'number' &&
    aiTheme.hexBg
  ) {
    return {
      name: aiTheme.name || 'Custom Theme',
      backgroundColor: {
        red: Math.min(1, Math.max(0, aiTheme.backgroundColor.red)),
        green: Math.min(1, Math.max(0, aiTheme.backgroundColor.green)),
        blue: Math.min(1, Math.max(0, aiTheme.backgroundColor.blue)),
      },
      titleColor: {
        red: Math.min(1, Math.max(0, aiTheme.titleColor?.red ?? 1)),
        green: Math.min(1, Math.max(0, aiTheme.titleColor?.green ?? 1)),
        blue: Math.min(1, Math.max(0, aiTheme.titleColor?.blue ?? 1)),
      },
      bodyColor: {
        red: Math.min(1, Math.max(0, aiTheme.bodyColor?.red ?? 0.9)),
        green: Math.min(1, Math.max(0, aiTheme.bodyColor?.green ?? 0.9)),
        blue: Math.min(1, Math.max(0, aiTheme.bodyColor?.blue ?? 0.9)),
      },
      accentColor: {
        red: Math.min(1, Math.max(0, aiTheme.accentColor?.red ?? 0.3)),
        green: Math.min(1, Math.max(0, aiTheme.accentColor?.green ?? 0.7)),
        blue: Math.min(1, Math.max(0, aiTheme.accentColor?.blue ?? 1)),
      },
      hexBg: aiTheme.hexBg || '#0A192F',
      hexTitle: aiTheme.hexTitle || '#38BDF8',
      hexBody: aiTheme.hexBody || '#E2E8F0',
      hexAccent: aiTheme.hexAccent || '#38BDF8',
      description: aiTheme.description || 'AI analyzed color palette and visual styling.',
      layoutStyle: aiTheme.layoutStyle || 'modern-card',
    };
  }

  // 1. Biology, Health, Sustainability, Environment, Botany
  if (
    /\b(bio|biology|nature|green|eco|health|climate|medicine|dna|pharma|organic|photosynthesis|plant|cell|forest|ocean)\b/i.test(
      t
    )
  ) {
    return {
      name: 'Bio-Emerald Horizon',
      description: 'Dynamic organic palette tuned for life sciences, health, and ecology.',
      layoutStyle: 'modern-card',
      backgroundColor: { red: 0.03, green: 0.16, blue: 0.12 },
      titleColor: { red: 0.2, green: 0.83, blue: 0.6 },
      bodyColor: { red: 0.92, green: 0.99, blue: 0.95 },
      accentColor: { red: 0.45, green: 0.9, blue: 0.7 },
      hexBg: '#082A20',
      hexTitle: '#34D399',
      hexBody: '#ECFDF5',
      hexAccent: '#10B981',
    };
  }

  // 2. Finance, Strategy, Corporate, Business, Leadership
  if (/\b(finance|revenue|profit|business|strategy|market|sales|economy|invest|executive|budget)\b/i.test(t)) {
    return {
      name: 'Obsidian Executive Gold',
      description: 'Authoritative dark obsidian slate with executive gold accents.',
      layoutStyle: 'editorial',
      backgroundColor: { red: 0.06, green: 0.09, blue: 0.16 },
      titleColor: { red: 0.96, green: 0.64, blue: 0.15 },
      bodyColor: { red: 0.94, green: 0.96, blue: 0.98 },
      accentColor: { red: 0.55, green: 0.75, blue: 1.0 },
      hexBg: '#0F172A',
      hexTitle: '#F59E0B',
      hexBody: '#F1F5F9',
      hexAccent: '#D97706',
    };
  }

  // 3. Space, Astronomy, Physics, Cosmos
  if (/\b(space|astronomy|planet|mars|moon|galaxy|black hole|solar|universe|cosmos|nasa|rocket|star)\b/i.test(t)) {
    return {
      name: 'Cosmic Abyss Violet',
      description: 'Deep starfield obsidian with celestial indigo highlights.',
      layoutStyle: 'minimal-bold',
      backgroundColor: { red: 0.04, green: 0.04, blue: 0.1 },
      titleColor: { red: 0.51, green: 0.55, blue: 0.97 },
      bodyColor: { red: 0.93, green: 0.95, blue: 1.0 },
      accentColor: { red: 0.39, green: 0.4, blue: 0.95 },
      hexBg: '#090A1A',
      hexTitle: '#818CF8',
      hexBody: '#EEF2FF',
      hexAccent: '#6366F1',
    };
  }

  // 4. Education, Creative, Psychology, Philosophy, History, Culture
  if (/\b(education|art|design|psychology|history|culture|creative|literature|music|war|civilization)\b/i.test(t)) {
    return {
      name: 'Deep Royal Indigo',
      description: 'Scholarly deep indigo backdrop with vibrant violet hierarchy.',
      layoutStyle: 'minimal-bold',
      backgroundColor: { red: 0.11, green: 0.1, blue: 0.28 },
      titleColor: { red: 0.75, green: 0.52, blue: 0.99 },
      bodyColor: { red: 0.96, green: 0.94, blue: 1.0 },
      accentColor: { red: 0.9, green: 0.5, blue: 0.9 },
      hexBg: '#1C1947',
      hexTitle: '#C084FC',
      hexBody: '#F5F3FF',
      hexAccent: '#A855F7',
    };
  }

  // 5. Default: Deep Quantum Navy (AI, Quantum, Tech, Engineering)
  return {
    name: 'Deep Quantum Navy',
    description: 'Precision quantum navy optimized for technical clarity and systems depth.',
    layoutStyle: 'modern-card',
    backgroundColor: { red: 0.04, green: 0.1, blue: 0.18 },
    titleColor: { red: 0.22, green: 0.74, blue: 0.97 },
    bodyColor: { red: 0.89, green: 0.91, blue: 0.95 },
    accentColor: { red: 0.38, green: 0.92, blue: 0.8 },
    hexBg: '#0A192F',
    hexTitle: '#38BDF8',
    hexBody: '#E2E8F0',
    hexAccent: '#06B6D4',
  };
}

export async function analyzeThemeForTopic(rawTopic: string): Promise<SlideTheme> {
  const cleanTopic = extractCoreTopic(rawTopic) || rawTopic;
  const prompt = `You are a visual design director and presentation architect.
Analyze the core presentation subject: "${cleanTopic}".
Determine the most aesthetically fitting dark-mode presentation theme, color palette, and layout style specifically suited for "${cleanTopic}".
Ensure high contrast between backgroundColor and titleColor/bodyColor (WCAG AA readability).

Return ONLY valid JSON matching this schema:
{
  "name": "Descriptive Theme Name",
  "description": "Brief 1-sentence design rationale specific to ${cleanTopic}",
  "layoutStyle": "minimal-bold",
  "hexBg": "#0A192F",
  "hexTitle": "#38BDF8",
  "hexBody": "#E2E8F0",
  "hexAccent": "#06B6D4",
  "backgroundColor": { "red": 0.04, "green": 0.10, "blue": 0.18 },
  "titleColor": { "red": 0.22, "green": 0.74, "blue": 0.97 },
  "bodyColor": { "red": 0.89, "green": 0.91, "blue": 0.95 },
  "accentColor": { "red": 0.02, "green": 0.71, "blue": 0.83 }
}`;

  const result = await generateGroundedJson<SlideTheme>(
    prompt,
    0.3,
    (parsed) => {
      if (parsed && parsed.name && parsed.hexBg) {
        return getTopicTheme(cleanTopic, parsed);
      }
      return null;
    },
    false
  );

  return result || getTopicTheme(cleanTopic);
}

export async function generateAiPresentation(
  rawTopic: string,
  slideCount = 5
): Promise<GeneratedPresentation> {
  const cleanTopic = extractCoreTopic(rawTopic) || rawTopic;
  const count = Math.max(1, Math.min(8, slideCount));

  const prompt = `You are Jarvis Presentation AI.
Core Subject / Topic: "${cleanTopic}"
(Original request context: "${rawTopic}")

INSTRUCTIONS:
1. Focus STRICTLY on the core topic "${cleanTopic}". Do NOT include meta-instructions like "make slides", "create presentation", "apply theme", or "paste in docs" anywhere in the presentation title, slide titles, or bullet text.
2. Provide accurate, authoritative, factually verified information about "${cleanTopic}" (real facts, key principles, quantitative figures/dates, concrete examples, and clear domain terminology). Never invent placeholder slogans.
3. Also select an authentic dark-mode background theme and high-contrast color palette tailored to "${cleanTopic}".

Generate exactly ${count} structured, informative slides.
Each slide must contain:
- title: concise, topic-focused slide title (under 8 words)
- subtitle: crisp core takeaway (1 clear sentence)
- bullets: 4 to 5 substantive, fact-rich bullet points specifically explaining "${cleanTopic}" (under 28 words each).

Return ONLY valid JSON adhering strictly to this schema:
{
  "title": "Clean Topic Title",
  "subtitle": "Clear subtitle summarizing ${cleanTopic}",
  "theme": {
    "name": "Theme Name",
    "description": "Design rationale for ${cleanTopic}",
    "layoutStyle": "modern-card",
    "hexBg": "#0A192F",
    "hexTitle": "#38BDF8",
    "hexBody": "#E2E8F0",
    "hexAccent": "#06B6D4",
    "backgroundColor": { "red": 0.04, "green": 0.10, "blue": 0.18 },
    "titleColor": { "red": 0.22, "green": 0.74, "blue": 0.97 },
    "bodyColor": { "red": 0.89, "green": 0.91, "blue": 0.95 },
    "accentColor": { "red": 0.38, "green": 0.92, "blue": 0.80 }
  },
  "slides": [
    {
      "title": "Slide Title",
      "subtitle": "Key takeaway",
      "bullets": [
        "Accurate fact or mechanism about ${cleanTopic}",
        "Specific quantitative detail, benchmark, or milestone",
        "Key technical or conceptual breakdown",
        "Real-world application or significance"
      ]
    }
  ]
}`;

  const generated = await generateGroundedJson<GeneratedPresentation>(
    prompt,
    0.3,
    (parsed) => {
      if (parsed?.title && Array.isArray(parsed.slides) && parsed.slides.length > 0) {
        const theme = getTopicTheme(cleanTopic, parsed.theme);
        return {
          title: String(parsed.title).trim(),
          subtitle: String(parsed.subtitle || cleanTopic).trim(),
          theme,
          slides: parsed.slides.map((s: any) => ({
            title: String(s.title || cleanTopic).trim(),
            subtitle: s.subtitle ? String(s.subtitle).trim() : undefined,
            bullets: Array.isArray(s.bullets)
              ? s.bullets.map(String).filter((b: string) => b.trim().length > 0)
              : [],
          })),
        };
      }
      return null;
    },
    true
  );

  if (generated) return generated;

  // Fallback only if every online model call failed
  const fallbackTheme = getTopicTheme(cleanTopic);
  const niceTitle = cleanTopic.replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: niceTitle,
    subtitle: `Comprehensive Analysis & Overview of ${niceTitle}`,
    theme: fallbackTheme,
    slides: [
      {
        title: `Overview of ${niceTitle}`,
        subtitle: `Core definition, background, and fundamental significance`,
        bullets: [
          `Foundational definition and primary principles behind ${niceTitle}`,
          `Historical evolution and key milestones shaping modern understanding`,
          `Primary components, structure, and essential terminology`,
          `Why ${niceTitle} matters across real-world applications today`,
        ],
      },
      {
        title: 'Core Mechanisms & Structure',
        subtitle: `How ${niceTitle} operates at a detailed level`,
        bullets: [
          `Primary processes and underlying interactions driving ${niceTitle}`,
          'Key stages, inputs, outputs, and structural dependencies',
          'Critical factors governing efficiency, stability, and performance',
          'Standard methodologies and frameworks used for analysis',
        ],
      },
      {
        title: 'Real-World Applications & Impact',
        subtitle: `Practical implementations and measurable outcomes`,
        bullets: [
          `Leading real-world use cases powered by ${niceTitle}`,
          'Industry, scientific, and everyday societal impact',
          'Comparative advantages over traditional alternatives',
          'Current constraints, edge cases, and active areas of improvement',
        ],
      },
      {
        title: 'Future Trajectory & Key Takeaways',
        subtitle: `Emerging innovations and concluding synthesis`,
        bullets: [
          `Current research frontiers and next-generation advancements`,
          'Anticipated breakthroughs over the coming decade',
          `Summary of core facts and principles for ${niceTitle}`,
          'Recommended areas for deeper study and exploration',
        ],
      },
    ].slice(0, count),
  };
}

// ---------------- Document Generation & Editing ----------------

export interface GeneratedDocument {
  title: string;
  bodyText: string;
}

export async function generateAiDocument(
  rawTopic: string,
  docType = 'auto'
): Promise<GeneratedDocument> {
  const cleanTopic = extractCoreTopic(rawTopic) || rawTopic;
  const isBusinessDoc =
    docType !== 'auto' && docType !== 'article'
      ? /\b(proposal|plan|memo|contract|brief|business|budget|strategy|roadmap)\b/i.test(
          `${docType} ${rawTopic}`
        )
      : /\b(proposal|business\s*plan|memo|contract|roadmap|strategy|project\s*plan|budget)\b/i.test(
          rawTopic
        );

  const structureHint = isBusinessDoc
    ? `Structure the document professionally with:
1. Clear Document Title
2. Executive Summary
3. Core Objectives & Scope
4. Technical / Operational Plan
5. Action Items, Timeline & Success Metrics`
    : `Adapt the document structure organically to fit the subject "${cleanTopic}" (NOT a generic business KPI template unless appropriate):
1. Clear Document Title & Concise Introduction / Definition
2. Core Concepts, Mechanisms, or Historical Background
3. Detailed Breakdown / Key Components / Analysis (with accurate facts, examples, figures, or equations where relevant)
4. Real-World Applications & Significance
5. Key Takeaways & Summary`;

  const prompt = `You are Jarvis Document AI.
Core Subject / Topic: "${cleanTopic}"
(Original request: "${rawTopic}")

INSTRUCTIONS:
1. Extract and focus strictly on "${cleanTopic}". Never include command phrases like "write a google doc about" or "paste in google docs" inside the document title or body.
2. Get accurate, factual, well-verified information about "${cleanTopic}" with real explanations, details, examples, and domain terminology.
3. ${structureHint}

Use clean Markdown headings (#, ##, ###), well-formatted paragraphs, and bullet points.
Return ONLY valid JSON:
{
  "title": "Clean Descriptive Document Title (without quotes or command words)",
  "bodyText": "Complete, well-researched document text..."
}`;

  const generated = await generateGroundedJson<GeneratedDocument>(
    prompt,
    0.35,
    (parsed) => {
      if (parsed?.title && parsed?.bodyText) {
        return {
          title: String(parsed.title).trim(),
          bodyText: String(parsed.bodyText).trim(),
        };
      }
      return null;
    },
    true
  );

  if (generated) return generated;

  // Topic-aware fallback
  const niceTitle = cleanTopic.replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: niceTitle,
    bodyText: `# ${niceTitle}\n\n## Overview\n${niceTitle} encompasses the foundational principles, mechanisms, and practical applications associated with this subject.\n\n## Key Concepts & Details\n- Core principles and structural characteristics of ${niceTitle}.\n- Essential terminology and underlying processes.\n- Key factors, drivers, and real-world behavior.\n\n## Applications & Significance\n- How ${niceTitle} is applied across science, technology, and society.\n- Measurable impact and real-world relevance.\n\n## Summary\n${niceTitle} remains a key area of study with significant practical implications.`,
  };
}

export interface EditedDocumentResult {
  summary: string;
  appendedText: string;
  updatedFullText: string;
}

export async function editAiDocument(
  currentText: string,
  instruction: string
): Promise<EditedDocumentResult> {
  const prompt = `You are Jarvis Document Copilot. The user wants to edit an existing Google Doc.
Current Document Text:
"""
${currentText.slice(0, 4500)}
"""

User Edit Instruction: "${instruction}"

Execute the edit with accurate, high-quality factual content matching the document's subject. Return ONLY valid JSON:
{
  "summary": "Brief 1-sentence explanation of what was added or changed",
  "appendedText": "The specific new section or text that was created for this instruction",
  "updatedFullText": "The complete updated document text incorporating the edit seamlessly"
}`;

  const generated = await generateGroundedJson<EditedDocumentResult>(
    prompt,
    0.35,
    (parsed) => {
      if (parsed?.updatedFullText) {
        return {
          summary: String(parsed.summary || 'Document updated based on your instruction.'),
          appendedText: String(parsed.appendedText || ''),
          updatedFullText: String(parsed.updatedFullText),
        };
      }
      return null;
    },
    false
  );

  if (generated) return generated;

  const addition = `\n\n### Updated Section: ${instruction}\n- Updated based on instruction: "${instruction}".`;
  return {
    summary: `Appended section: "${instruction}"`,
    appendedText: addition,
    updatedFullText: `${currentText}${addition}`,
  };
}

// ---------------- Spreadsheet & Excel Generation & Editing ----------------

export interface GeneratedSpreadsheet {
  title: string;
  sheetName: string;
  headers: string[];
  rows: (string | number)[][];
}

export async function generateAiSpreadsheet(rawTopic: string): Promise<GeneratedSpreadsheet> {
  const cleanTopic = extractCoreTopic(rawTopic) || rawTopic;
  const prompt = `You are Jarvis Spreadsheet AI.
Core Subject / Topic: "${cleanTopic}"
(Original user request: "${rawTopic}")

INSTRUCTIONS:
1. Focus STRICTLY on "${cleanTopic}". Do NOT copy command words like "make an excel sheet" or "create spreadsheet" into the title or cells.
2. Populate accurate, realistic, factually correct data for "${cleanTopic}" (if it asks for real-world statistics, comparisons, scientific data, countries, planets, budgets, etc., provide accurate numbers and facts).
3. Requirements:
   - title: clean concise descriptive title for "${cleanTopic}"
   - sheetName: short tab name (under 24 chars, e.g. "Data", "Comparison", "Budget")
   - headers: 4 to 7 clear column headers
   - rows: 6 to 12 rows of accurate, realistic data (use actual numbers for numeric columns, strings for text columns).

Return ONLY valid JSON:
{
  "title": "Clean Spreadsheet Title",
  "sheetName": "Data",
  "headers": ["Col 1", "Col 2", "Col 3"],
  "rows": [
    ["Val 1", "Val 2", 100]
  ]
}`;

  const generated = await generateGroundedJson<GeneratedSpreadsheet>(
    prompt,
    0.25,
    (parsed) => {
      if (parsed?.headers && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
        return {
          title: String(parsed.title || cleanTopic).trim(),
          sheetName: String(parsed.sheetName || 'Sheet1').slice(0, 31),
          headers: parsed.headers.map(String),
          rows: parsed.rows,
        };
      }
      return null;
    },
    true
  );

  if (generated) return generated;

  const niceTitle = cleanTopic.replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: niceTitle,
    sheetName: 'Data',
    headers: ['Item / Entry', 'Category', 'Quantity / Value', 'Metric / Unit', 'Notes / Status'],
    rows: [
      [`${niceTitle} - Primary Entry`, 'Core', 1, 'Standard', 'Active'],
      [`${niceTitle} - Secondary Entry`, 'Reference', 2, 'Standard', 'Verified'],
      [`${niceTitle} - Comparative Entry`, 'Analysis', 3, 'Standard', 'Pending Review'],
    ],
  };
}

export interface EditedSpreadsheetResult {
  summary: string;
  newRows: (string | number)[][];
  updatedAllRows: (string | number)[][];
}

export async function editAiSpreadsheet(
  headers: string[],
  existingRows: (string | number)[][],
  instruction: string
): Promise<EditedSpreadsheetResult> {
  const prompt = `You are Jarvis Spreadsheet Copilot. The user wants to edit or add rows to a spreadsheet.
Columns: ${JSON.stringify(headers)}
Existing Rows (sample):
${JSON.stringify(existingRows.slice(-6))}

User Edit Instruction: "${instruction}"

Generate accurate new or modified rows conforming strictly to the columns [${headers.join(', ')}].
Return ONLY valid JSON:
{
  "summary": "Brief 1-sentence summary of the added/modified data",
  "newRows": [
    ["Val 1", "Val 2", 123]
  ]
}`;

  const generated = await generateGroundedJson<EditedSpreadsheetResult>(
    prompt,
    0.25,
    (parsed) => {
      if (Array.isArray(parsed?.newRows) && parsed.newRows.length > 0) {
        return {
          summary: String(parsed.summary || `Applied: ${instruction}`),
          newRows: parsed.newRows,
          updatedAllRows: [...existingRows, ...parsed.newRows],
        };
      }
      return null;
    },
    false
  );

  if (generated) return generated;

  const fallbackRow: any[] = headers.map((h, i) => {
    const hl = h.toLowerCase();
    if (i === 0) return `Update: ${instruction.slice(0, 24)}`;
    if (hl.includes('cost') || hl.includes('price') || hl.includes('$') || hl.includes('total')) return 500;
    if (hl.includes('qty') || hl.includes('quantity')) return 1;
    if (hl.includes('status')) return 'Active';
    return 'General';
  });

  return {
    summary: `Appended row for "${instruction}"`,
    newRows: [fallbackRow],
    updatedAllRows: [...existingRows, fallbackRow],
  };
}

// ---------------- Email Generation & Composition (Gmail Copilot) ----------------

export interface GeneratedEmail {
  to: string;
  subject: string;
  body: string;
}

export async function generateAiEmail(
  prompt: string,
  recipient?: string
): Promise<GeneratedEmail> {
  const systemPrompt = `You are Jarvis Email Copilot. The user wants to compose an email via Gmail.
User Request / Context: "${prompt}"
${recipient ? `Specified Recipient: "${recipient}"` : ''}

Draft a polished, courteous, and articulate email:
1. Extract the recipient email address if mentioned in the prompt (otherwise leave "" if unknown).
2. Formulate a clear, relevant subject line focused strictly on the message topic (without command words like "draft an email").
3. Write a well-structured email body with a polite greeting, accurate concise body paragraphs conveying the right details, clear call to action, and professional sign-off.

Return ONLY valid JSON adhering strictly to this schema:
{
  "to": "recipient@example.com",
  "subject": "Clear and relevant subject line",
  "body": "Hi [Name],\\n\\n[First paragraph]\\n\\n[Second paragraph]\\n\\nBest regards,\\nJarvis AI"
}`;

  const generated = await generateGroundedJson<GeneratedEmail>(
    systemPrompt,
    0.3,
    (parsed) => {
      if (parsed?.subject && parsed?.body) {
        return {
          to: String(parsed.to || recipient || '').trim(),
          subject: String(parsed.subject).trim(),
          body: String(parsed.body).trim(),
        };
      }
      return null;
    },
    false
  );

  if (generated) return generated;

  const cleanTopic = extractCoreTopic(prompt);
  return {
    to: recipient || '',
    subject: `Regarding: ${cleanTopic.slice(0, 50)}`,
    body: `Hello,\n\nI am writing to share details regarding ${cleanTopic}.\n\nPlease review at your convenience and let me know if you have any questions.\n\nBest regards,\nJarvis Assistant`,
  };
}
