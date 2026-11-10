/**
 * Client-side interface to the Jarvis Workspace AI Copilot backend.
 * Generates presentations, documents, spreadsheets, and applies smart edits.
 */

export interface SlideThemeColor {
  red: number;
  green: number;
  blue: number;
}

export interface SlideTheme {
  name: string;
  description?: string;
  layoutStyle?: 'minimal-bold' | 'editorial' | 'data-heavy' | 'modern-card';
  backgroundColor: SlideThemeColor;
  titleColor: SlideThemeColor;
  bodyColor: SlideThemeColor;
  accentColor: SlideThemeColor;
  hexBg: string;
  hexTitle: string;
  hexBody: string;
  hexAccent?: string;
}

export interface AiSlideItem {
  title: string;
  subtitle?: string;
  bullets: string[];
}

export interface AiPresentationResult {
  title: string;
  subtitle: string;
  theme?: SlideTheme;
  slides: AiSlideItem[];
}

export interface AiEmailResult {
  to: string;
  subject: string;
  body: string;
}

export interface AiDocumentResult {
  title: string;
  bodyText: string;
}

export interface AiDocEditResult {
  summary: string;
  appendedText: string;
  updatedFullText: string;
}

export interface AiSpreadsheetResult {
  title: string;
  sheetName: string;
  headers: string[];
  rows: (string | number)[][];
}

export interface AiSheetEditResult {
  summary: string;
  newRows: (string | number)[][];
  updatedAllRows: (string | number)[][];
}

export async function requestAiPresentation(
  topic: string,
  slideCount = 5
): Promise<AiPresentationResult> {
  const res = await fetch('/api/jarvis/workspace/ai-copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'generate_presentation',
      topic,
      slideCount,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Failed to generate presentation (${res.status})`);
  }

  return await res.json();
}

export async function requestAiDocument(
  topic: string,
  docType = 'proposal'
): Promise<AiDocumentResult> {
  const res = await fetch('/api/jarvis/workspace/ai-copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'generate_doc',
      topic,
      docType,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Failed to generate document (${res.status})`);
  }

  return await res.json();
}

export async function requestAiDocEdit(
  currentText: string,
  instruction: string
): Promise<AiDocEditResult> {
  const res = await fetch('/api/jarvis/workspace/ai-copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'edit_doc',
      currentText,
      instruction,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Failed to edit document (${res.status})`);
  }

  return await res.json();
}

export async function requestAiSpreadsheet(topic: string): Promise<AiSpreadsheetResult> {
  const res = await fetch('/api/jarvis/workspace/ai-copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'generate_sheet',
      topic,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Failed to generate spreadsheet (${res.status})`);
  }

  return await res.json();
}

export async function requestAiSheetEdit(
  headers: string[],
  rows: (string | number)[][],
  instruction: string
): Promise<AiSheetEditResult> {
  const res = await fetch('/api/jarvis/workspace/ai-copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'edit_sheet',
      headers,
      rows,
      instruction,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Failed to edit spreadsheet (${res.status})`);
  }

  return await res.json();
}

export async function requestAiEmail(
  prompt: string,
  recipient?: string
): Promise<AiEmailResult> {
  const res = await fetch('/api/jarvis/workspace/ai-copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'generate_email',
      prompt,
      recipient,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Failed to compose email with AI (${res.status})`);
  }

  return await res.json();
}

export async function requestAiTheme(topic: string): Promise<SlideTheme> {
  const res = await fetch('/api/jarvis/workspace/ai-copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'analyze_theme',
      topic,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Failed to analyze theme with AI (${res.status})`);
  }

  return await res.json();
}


