import React, { useState, useEffect, useRef } from 'react';
import { useJarvisSession } from '../contexts/JarvisSessionContext';
import {
  listDriveFiles,
  listGoogleDocs,
  listGoogleSheets,
  listGoogleSlides,
  getGoogleDoc,
  createGoogleDoc,
  appendTextToGoogleDoc,
  replaceGoogleDocContent,
  getGoogleSheet,
  createGoogleSheet,
  appendGoogleSheetRow,
  updateGoogleSheetCell,
  getGooglePresentation,
  createGooglePresentation,
  addSlideToPresentation,
  applyThemeToPresentation,
  listGmailMessages,
  getGmailMessageDetail,
  createGmailDraft,
  sendGmailMessage,
  uploadFileToGoogleDrive,
  type WorkspaceFileItem,
  type GmailMessageSummary,
  type GmailMessageDetail,
} from '../services/googleWorkspaceService';
import {
  parseExcelFile,
  createNewExcelWorkbook,
  createEmptyExcelSheet,
  exportExcelToBlob,
  downloadExcelFile,
  getColumnLetter,
  EXCEL_TEMPLATES,
  type ExcelWorkbookData,
} from '../services/excelService';
import {
  requestAiPresentation,
  requestAiDocument,
  requestAiDocEdit,
  requestAiSpreadsheet,
  requestAiSheetEdit,
  requestAiEmail,
  requestAiTheme,
  type SlideTheme,
} from '../services/aiWorkspaceClient';

export const THEME_PRESETS: SlideTheme[] = [
  {
    name: '🤖 Deep Quantum Navy',
    description: 'Precision quantum navy optimized for technical clearance and AI architecture.',
    layoutStyle: 'modern-card',
    hexBg: '#0A192F',
    hexTitle: '#38BDF8',
    hexBody: '#E2E8F0',
    hexAccent: '#06B6D4',
    backgroundColor: { red: 0.04, green: 0.1, blue: 0.18 },
    titleColor: { red: 0.22, green: 0.74, blue: 0.97 },
    bodyColor: { red: 0.89, green: 0.91, blue: 0.95 },
    accentColor: { red: 0.02, green: 0.71, blue: 0.83 },
  },
  {
    name: '🧬 Bio-Emerald Horizon',
    description: 'Dynamic organic palette tuned for life sciences, health, and ecology.',
    layoutStyle: 'modern-card',
    hexBg: '#082A20',
    hexTitle: '#34D399',
    hexBody: '#ECFDF5',
    hexAccent: '#10B981',
    backgroundColor: { red: 0.03, green: 0.16, blue: 0.12 },
    titleColor: { red: 0.2, green: 0.83, blue: 0.6 },
    bodyColor: { red: 0.92, green: 0.99, blue: 0.95 },
    accentColor: { red: 0.45, green: 0.9, blue: 0.7 },
  },
  {
    name: '🏛️ Obsidian Executive Gold',
    description: 'Authoritative dark obsidian slate with executive gold accents.',
    layoutStyle: 'editorial',
    hexBg: '#0F172A',
    hexTitle: '#F59E0B',
    hexBody: '#F1F5F9',
    hexAccent: '#D97706',
    backgroundColor: { red: 0.06, green: 0.09, blue: 0.16 },
    titleColor: { red: 0.96, green: 0.64, blue: 0.15 },
    bodyColor: { red: 0.94, green: 0.96, blue: 0.98 },
    accentColor: { red: 0.55, green: 0.75, blue: 1.0 },
  },
  {
    name: '🎨 Royal Amethyst',
    description: 'Scholarly deep indigo backdrop with vibrant violet hierarchy.',
    layoutStyle: 'minimal-bold',
    hexBg: '#1C1947',
    hexTitle: '#C084FC',
    hexBody: '#F5F3FF',
    hexAccent: '#A855F7',
    backgroundColor: { red: 0.11, green: 0.1, blue: 0.28 },
    titleColor: { red: 0.75, green: 0.52, blue: 0.99 },
    bodyColor: { red: 0.96, green: 0.94, blue: 1.0 },
    accentColor: { red: 0.9, green: 0.5, blue: 0.9 },
  },
  {
    name: '⚡ Cyberpunk Neon',
    description: 'High contrast electric crimson and neon cyan for disruptive topics.',
    layoutStyle: 'minimal-bold',
    hexBg: '#0B0A14',
    hexTitle: '#F43F5E',
    hexBody: '#F8FAFC',
    hexAccent: '#06B6D4',
    backgroundColor: { red: 0.04, green: 0.04, blue: 0.08 },
    titleColor: { red: 0.96, green: 0.25, blue: 0.37 },
    bodyColor: { red: 0.97, green: 0.98, blue: 0.99 },
    accentColor: { red: 0.02, green: 0.71, blue: 0.83 },
  },
];

export type WorkspaceSubTab = 'docs' | 'sheets' | 'slides' | 'gmail' | 'excel';

interface OfficeWorkspaceHubProps {
  initialTab?: WorkspaceSubTab;
  onClose?: () => void;
}

export const OfficeWorkspaceHub: React.FC<OfficeWorkspaceHubProps> = ({
  initialTab = 'docs',
  onClose,
}) => {
  const { workspaceToken, getValidWorkspaceToken, signInWithGoogle } = useJarvisSession();
  const [activeTab, setActiveTab] = useState<WorkspaceSubTab>(initialTab);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingNotice, setLoadingNotice] = useState<string>('Processing...');
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean; actionLink?: string; actionLabel?: string } | null>(null);

  // File lists from Google Drive
  const [docsList, setDocsList] = useState<WorkspaceFileItem[]>([]);
  const [sheetsList, setSheetsList] = useState<WorkspaceFileItem[]>([]);
  const [slidesList, setSlidesList] = useState<WorkspaceFileItem[]>([]);
  const [gmailMessages, setGmailMessages] = useState<GmailMessageSummary[]>([]);

  // Selected Google Doc states
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDocTitle, setSelectedDocTitle] = useState<string>('');
  const [docContentText, setDocContentText] = useState<string>('');
  const [docEditInstruction, setDocEditInstruction] = useState<string>('');
  const [isEditingDocDirectly, setIsEditingDocDirectly] = useState<boolean>(false);

  // AI Doc Generation input
  const [aiDocPrompt, setAiDocPrompt] = useState<string>('');
  const [aiDocType, setAiDocType] = useState<string>('Strategic Proposal');

  // Selected Google Sheet states
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [selectedSheetTitle, setSelectedSheetTitle] = useState<string>('');
  const [sheetRows, setSheetRows] = useState<any[][]>([]);
  const [sheetEditInstruction, setSheetEditInstruction] = useState<string>('');
  const [editingSheetCell, setEditingSheetCell] = useState<{ row: number; col: number; val: string } | null>(null);

  // AI Sheet Generation input
  const [aiSheetPrompt, setAiSheetPrompt] = useState<string>('');

  // Selected Google Slides state
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [selectedSlideTitle, setSelectedSlideTitle] = useState<string>('');
  const [selectedSlideTheme, setSelectedSlideTheme] = useState<SlideTheme | null>(null);
  const [slideCount, setSlideCount] = useState<number>(0);
  const [newSlideTopic, setNewSlideTopic] = useState<string>('');

  // AI Presentation Generation input
  const [aiPresTopic, setAiPresTopic] = useState<string>('');
  const [aiPresSlideCount, setAiPresSlideCount] = useState<number>(5);

  // Gmail states
  const [selectedEmail, setSelectedEmail] = useState<GmailMessageDetail | null>(null);
  const [emailTo, setEmailTo] = useState<string>('');
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [emailBody, setEmailBody] = useState<string>('');
  const [confirmSendOpen, setConfirmSendOpen] = useState<boolean>(false);
  const [aiEmailPrompt, setAiEmailPrompt] = useState<string>('');
  const [aiEmailRecipient, setAiEmailRecipient] = useState<string>('');

  // Microsoft Excel State (.xlsx)
  const [excelData, setExcelData] = useState<ExcelWorkbookData>(() =>
    createNewExcelWorkbook(
      'Jarvis_Financial_Plan.xlsx',
      'Operating Model',
      EXCEL_TEMPLATES[0].headers,
      EXCEL_TEMPLATES[0].rows
    )
  );
  const [editingExcelCell, setEditingExcelCell] = useState<{ row: number; col: number; val: string } | null>(null);
  const [newSheetName, setNewSheetName] = useState<string>('');
  const [excelAiPrompt, setExcelAiPrompt] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentExcelSheet = excelData.sheets[excelData.activeSheetIndex] || excelData.sheets[0];

  // Token helper
  const ensureToken = async (): Promise<string | null> => {
    const token = await getValidWorkspaceToken();
    if (!token) {
      setStatusMessage({
        text: 'Google Workspace connection required. Please click "Connect Google Workspace".',
        isError: true,
      });
      return null;
    }
    return token;
  };

  // Reload tab list
  const reloadCurrentTabList = async (token: string) => {
    if (activeTab === 'docs') {
      const files = await listGoogleDocs(token);
      setDocsList(files);
    } else if (activeTab === 'sheets') {
      const files = await listGoogleSheets(token);
      setSheetsList(files);
    } else if (activeTab === 'slides') {
      const files = await listGoogleSlides(token);
      setSlidesList(files);
    } else if (activeTab === 'gmail') {
      const emails = await listGmailMessages(token, undefined, 15);
      setGmailMessages(emails);
    }
  };

  useEffect(() => {
    if (!workspaceToken) return;
    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      setLoadingNotice('Loading workspace files...');
      setStatusMessage(null);
      try {
        await reloadCurrentTabList(workspaceToken);
      } catch (err: any) {
        if (isMounted) {
          setStatusMessage({
            text: err?.message || 'Unable to load workspace items. Token may need renewal.',
            isError: true,
          });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, [activeTab, workspaceToken]);

  // ==================== GOOGLE SLIDES: AI PRESENTATIONS ====================

  const handleAiCreatePresentation = async () => {
    const topic = aiPresTopic.trim() || 'AI Autonomous Systems & Future of Work';
    const token = await ensureToken();
    if (!token) return;

    setLoading(true);
    setLoadingNotice(`Generating ${aiPresSlideCount}-slide presentation with AI...`);
    setStatusMessage(null);

    try {
      // 1. Generate outline with AI (in-depth clearance + tailored theme)
      const presPlan = await requestAiPresentation(topic, aiPresSlideCount);
      setLoadingNotice('Creating presentation in Google Slides with custom topic theme...');

      if (presPlan.theme) {
        setSelectedSlideTheme(presPlan.theme);
      }

      // 2. Create in Google Slides via API with custom background & typography theme
      const pres = await createGooglePresentation(token, presPlan.title, presPlan.slides, presPlan.theme);
      setStatusMessage({
        text: `Created "${pres.title}" with ${presPlan.slides.length} slides (${presPlan.theme?.name || 'Custom Theme'})!`,
        actionLink: pres.webViewLink || `https://docs.google.com/presentation/d/${pres.id}/edit`,
        actionLabel: 'Open Google Slides ↗',
      });

      setAiPresTopic('');
      await reloadCurrentTabList(token);
      await handleOpenSlides(pres.id, pres.title);
    } catch (err: any) {
      setStatusMessage({ text: `Failed to create presentation: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSlides = async (presentationId: string, title: string) => {
    const token = await ensureToken();
    if (!token) return;
    setLoading(true);
    setLoadingNotice('Loading presentation slides...');
    try {
      const pres = await getGooglePresentation(token, presentationId);
      setSelectedSlideId(presentationId);
      setSelectedSlideTitle(title || pres.title);
      setSlideCount(pres.slides?.length || 1);
    } catch (err: any) {
      setStatusMessage({ text: `Failed to open presentation: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleAiAddSlide = async () => {
    if (!selectedSlideId || !newSlideTopic.trim()) return;
    const token = await ensureToken();
    if (!token) return;

    setLoading(true);
    setLoadingNotice(`AI designing slide: "${newSlideTopic.trim()}"...`);
    try {
      // Generate slide bullets
      const miniPlan = await requestAiPresentation(newSlideTopic.trim(), 1);
      const generatedSlide = miniPlan.slides[0] || {
        title: newSlideTopic.trim(),
        bullets: ['Key strategic requirement', 'Validated milestone', 'Operational execution'],
      };

      await addSlideToPresentation(
        token,
        selectedSlideId,
        generatedSlide.title,
        generatedSlide.bullets,
        undefined,
        selectedSlideTheme || miniPlan.theme || undefined
      );
      setSlideCount((c) => c + 1);
      setNewSlideTopic('');
      setStatusMessage({ text: `Added new themed slide "${generatedSlide.title}" to presentation!` });
    } catch (err: any) {
      setStatusMessage({ text: `Failed to add slide: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleAiAnalyzeTheme = async () => {
    const topic = aiPresTopic.trim() || 'Autonomous Systems & Next-Gen Architecture';
    setLoading(true);
    setLoadingNotice(`Analyzing topic "${topic}" with Gemini API to generate optimal theme & layout style...`);
    try {
      const theme = await requestAiTheme(topic);
      setSelectedSlideTheme(theme);
      setStatusMessage({
        text: `Gemini Theme Applied: "${theme.name}" (${theme.layoutStyle || 'modern-card'}) for "${topic}"!`,
      });
    } catch (err: any) {
      setStatusMessage({ text: `Failed to analyze theme: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleApplyThemeToDeck = async () => {
    if (!selectedSlideId) return;
    const token = await ensureToken();
    if (!token) return;
    const themeToApply = selectedSlideTheme || THEME_PRESETS[0];

    setLoading(true);
    setLoadingNotice(`Applying theme "${themeToApply.name}" to all slides in presentation...`);
    try {
      await applyThemeToPresentation(token, selectedSlideId, themeToApply);
      setStatusMessage({
        text: `Applied "${themeToApply.name}" theme and typography across all slides in "${selectedSlideTitle}"!`,
        actionLink: `https://docs.google.com/presentation/d/${selectedSlideId}/edit`,
        actionLabel: 'Open Google Slides ↗',
      });
    } catch (err: any) {
      setStatusMessage({ text: `Failed to apply theme to presentation: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  // ==================== GOOGLE DOCS: AI DOCUMENT CREATION & EDITING ====================

  const handleAiCreateDoc = async () => {
    const topic = aiDocPrompt.trim() || 'Product Architecture & Roadmap';
    const token = await ensureToken();
    if (!token) return;

    setLoading(true);
    setLoadingNotice(`AI drafting ${aiDocType}: "${topic}"...`);
    setStatusMessage(null);

    try {
      const docPlan = await requestAiDocument(topic, aiDocType);
      setLoadingNotice('Writing document to Google Docs API...');
      const created = await createGoogleDoc(token, docPlan.title, docPlan.bodyText);

      setStatusMessage({
        text: `Created Google Doc "${created.title}" successfully!`,
        actionLink: created.webViewLink || `https://docs.google.com/document/d/${created.id}/edit`,
        actionLabel: 'Open Google Docs ↗',
      });

      setAiDocPrompt('');
      await reloadCurrentTabList(token);
      await handleOpenDoc(created.id, created.title);
    } catch (err: any) {
      setStatusMessage({ text: `Failed to create doc: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDoc = async (docId: string, title: string) => {
    const token = await ensureToken();
    if (!token) return;
    setLoading(true);
    setLoadingNotice('Reading document content...');
    try {
      const doc = await getGoogleDoc(token, docId);
      setSelectedDocId(docId);
      setSelectedDocTitle(title || doc.title);
      setDocContentText(doc.bodyText || '');
      setIsEditingDocDirectly(false);
    } catch (err: any) {
      setStatusMessage({ text: `Failed to read doc: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleAiApplyDocEdit = async () => {
    if (!selectedDocId || !docEditInstruction.trim()) return;
    const token = await ensureToken();
    if (!token) return;

    setLoading(true);
    setLoadingNotice(`AI executing edit: "${docEditInstruction.trim()}"...`);
    try {
      const editResult = await requestAiDocEdit(docContentText, docEditInstruction.trim());
      // Append new section to Google Doc
      await appendTextToGoogleDoc(token, selectedDocId, editResult.appendedText || editResult.summary);
      setDocContentText(editResult.updatedFullText);
      setDocEditInstruction('');
      setStatusMessage({ text: `AI updated Google Doc: ${editResult.summary}` });
    } catch (err: any) {
      setStatusMessage({ text: `Failed to apply edit: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDirectDocEdits = async () => {
    if (!selectedDocId) return;
    const token = await ensureToken();
    if (!token) return;

    setLoading(true);
    setLoadingNotice('Saving edits directly to Google Docs...');
    try {
      await replaceGoogleDocContent(token, selectedDocId, docContentText);
      setIsEditingDocDirectly(false);
      setStatusMessage({ text: 'Saved all edits directly to Google Doc!' });
    } catch (err: any) {
      setStatusMessage({ text: `Failed to save changes: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  // ==================== GOOGLE SHEETS: AI SPREADSHEETS & CELL EDITING ====================

  const handleAiCreateSheet = async () => {
    const topic = aiSheetPrompt.trim() || 'Quarterly Operating Budget & ROI';
    const token = await ensureToken();
    if (!token) return;

    setLoading(true);
    setLoadingNotice(`AI generating spreadsheet model for: "${topic}"...`);
    setStatusMessage(null);

    try {
      const sheetPlan = await requestAiSpreadsheet(topic);
      setLoadingNotice('Creating spreadsheet in Google Sheets...');
      const created = await createGoogleSheet(
        token,
        sheetPlan.title,
        sheetPlan.headers,
        sheetPlan.rows
      );

      setStatusMessage({
        text: `Created Google Sheet "${created.title}" with ${sheetPlan.rows.length} rows!`,
        actionLink: created.webViewLink || `https://docs.google.com/spreadsheets/d/${created.id}/edit`,
        actionLabel: 'Open Google Sheets ↗',
      });

      setAiSheetPrompt('');
      await reloadCurrentTabList(token);
      await handleOpenSheet(created.id, created.title);
    } catch (err: any) {
      setStatusMessage({ text: `Failed to create sheet: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSheet = async (sheetId: string, title: string) => {
    const token = await ensureToken();
    if (!token) return;
    setLoading(true);
    setLoadingNotice('Loading spreadsheet grid data...');
    try {
      const data = await getGoogleSheet(token, sheetId);
      setSelectedSheetId(sheetId);
      setSelectedSheetTitle(title || data.title);
      setSheetRows(data.values || []);
    } catch (err: any) {
      setStatusMessage({ text: `Failed to open sheet: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleAiApplySheetEdit = async () => {
    if (!selectedSheetId || !sheetEditInstruction.trim()) return;
    const token = await ensureToken();
    if (!token) return;

    setLoading(true);
    setLoadingNotice(`AI editing spreadsheet: "${sheetEditInstruction.trim()}"...`);
    try {
      const headers = sheetRows[0] || ['Item', 'Category', 'Value'];
      const dataRows = sheetRows.slice(1);

      const editResult = await requestAiSheetEdit(headers, dataRows, sheetEditInstruction.trim());

      // Append new rows to Google Sheet via API
      for (const row of editResult.newRows) {
        await appendGoogleSheetRow(token, selectedSheetId, row);
      }

      setSheetRows((prev) => [...prev, ...editResult.newRows]);
      setSheetEditInstruction('');
      setStatusMessage({ text: `AI updated Google Sheet: ${editResult.summary}` });
    } catch (err: any) {
      setStatusMessage({ text: `Failed to edit spreadsheet: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSheetCell = async (rowIdx: number, colIdx: number, newVal: string) => {
    if (!selectedSheetId) return;
    const token = await ensureToken();
    if (!token) return;

    // Convert colIdx to letter (0 -> A, 1 -> B)
    const colLetter = getColumnLetter(colIdx);
    const cellRange = `${colLetter}${rowIdx + 1}`;

    setLoading(true);
    setLoadingNotice(`Updating cell ${cellRange}...`);
    try {
      await updateGoogleSheetCell(token, selectedSheetId, cellRange, newVal);
      setSheetRows((prev) => {
        const next = [...prev];
        if (next[rowIdx]) {
          next[rowIdx] = [...next[rowIdx]];
          next[rowIdx][colIdx] = newVal;
        }
        return next;
      });
      setEditingSheetCell(null);
      setStatusMessage({ text: `Updated cell ${cellRange} in Google Sheet!` });
    } catch (err: any) {
      setStatusMessage({ text: `Cell update failed: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  // ==================== MICROSOFT EXCEL (.xlsx): AI WORKBOOKS & FORMULAS ====================

  const handleAiCreateExcel = async () => {
    const topic = excelAiPrompt.trim() || 'SaaS 3-Year Financial Model';
    setLoading(true);
    setLoadingNotice(`AI building Excel (.xlsx) workbook for "${topic}"...`);
    try {
      const sheetPlan = await requestAiSpreadsheet(topic);
      const newWb = createNewExcelWorkbook(
        `${sheetPlan.title.replace(/\s+/g, '_')}.xlsx`,
        sheetPlan.sheetName || 'Financials',
        sheetPlan.headers,
        sheetPlan.rows
      );
      setExcelData(newWb);
      setExcelAiPrompt('');
      setStatusMessage({ text: `Generated Excel (.xlsx) model: "${sheetPlan.title}"!` });
    } catch (err: any) {
      setStatusMessage({ text: `Failed to build Excel: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleAiApplyExcelFormula = () => {
    if (!excelAiPrompt.trim()) return;
    const p = excelAiPrompt.toLowerCase();

    setExcelData((prev) => {
      const activeIdx = prev.activeSheetIndex;
      const targetSheet = prev.sheets[activeIdx];
      if (!targetSheet) return prev;

      // Case 1: Total/Sum Row
      if (p.includes('total') || p.includes('sum')) {
        const totalRow: any[] = ['Total / Summary'];
        for (let c = 1; c < targetSheet.headers.length; c++) {
          let sum = 0;
          let hasNumber = false;
          targetSheet.rows.forEach((r) => {
            const val = Number(r[c]);
            if (!isNaN(val) && r[c] !== '' && r[c] !== null) {
              sum += val;
              hasNumber = true;
            }
          });
          totalRow.push(hasNumber ? sum : '-');
        }
        const updated = prev.sheets.map((s, idx) =>
          idx === activeIdx ? { ...s, rows: [...s.rows, totalRow] } : s
        );
        setStatusMessage({ text: 'AI computed and appended Total calculation row in Excel!' });
        return { ...prev, sheets: updated };
      }

      // Case 2: Profit Margin Column
      if (p.includes('margin') || p.includes('profit')) {
        const newHeaders = [...targetSheet.headers, 'Profit Margin %'];
        const newRows = targetSheet.rows.map((row) => {
          const rev = Number(row[1]) || 0;
          const cost = Number(row[2]) || 0;
          const margin = rev > 0 ? `${(((rev - cost) / rev) * 100).toFixed(1)}%` : '35.0%';
          return [...row, margin];
        });
        const updated = prev.sheets.map((s, idx) =>
          idx === activeIdx ? { ...s, headers: newHeaders, rows: newRows } : s
        );
        setStatusMessage({ text: 'AI added Profit Margin formula column in Excel!' });
        return { ...prev, sheets: updated };
      }

      // Case 3: Tax Rate Column
      if (p.includes('tax')) {
        const newHeaders = [...targetSheet.headers, 'Estimated Tax ($)'];
        const newRows = targetSheet.rows.map((row) => {
          const rev = Number(row[row.length - 1]) || Number(row[1]) || 1000;
          return [...row, Math.round(rev * 0.15)];
        });
        const updated = prev.sheets.map((s, idx) =>
          idx === activeIdx ? { ...s, headers: newHeaders, rows: newRows } : s
        );
        setStatusMessage({ text: 'AI calculated and added Tax column in Excel!' });
        return { ...prev, sheets: updated };
      }

      setStatusMessage({ text: `Evaluated AI instruction: "${excelAiPrompt}".` });
      return prev;
    });

    setExcelAiPrompt('');
  };

  const handleExcelCellSave = (rowIdx: number, colIdx: number, newVal: string) => {
    setExcelData((prev) => {
      const activeIdx = prev.activeSheetIndex;
      const targetSheet = prev.sheets[activeIdx];
      if (!targetSheet) return prev;

      const newRows = targetSheet.rows.map((row, r) => {
        if (r !== rowIdx) return row;
        const newRow = [...row];
        const num = Number(newVal);
        newRow[colIdx] = !isNaN(num) && newVal.trim() !== '' ? num : newVal;
        return newRow;
      });

      const updatedSheets = prev.sheets.map((sheet, idx) =>
        idx === activeIdx ? { ...sheet, rows: newRows } : sheet
      );

      return { ...prev, sheets: updatedSheets };
    });
    setEditingExcelCell(null);
  };

  const handleDownloadExcel = () => {
    downloadExcelFile(excelData);
    setStatusMessage({ text: `Exported "${excelData.fileName}" to your device!` });
  };

  const handleSaveExcelToDrive = async () => {
    const token = await ensureToken();
    if (!token) return;
    setLoading(true);
    setLoadingNotice('Saving Excel workbook to Google Drive...');
    try {
      const blob = exportExcelToBlob(excelData);
      const uploaded = await uploadFileToGoogleDrive(
        token,
        excelData.fileName,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        blob
      );
      setStatusMessage({
        text: `Saved "${uploaded.name}" to Google Drive!`,
        actionLink: uploaded.webViewLink,
        actionLabel: 'View in Drive ↗',
      });
    } catch (err: any) {
      setStatusMessage({ text: `Drive save failed: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleExcelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setLoadingNotice(`Reading "${file.name}"...`);
    try {
      const parsed = await parseExcelFile(file);
      setExcelData(parsed);
      setStatusMessage({ text: `Loaded Excel file: "${file.name}" with ${parsed.sheets.length} sheet(s)!` });
    } catch (err: any) {
      setStatusMessage({ text: `Error parsing Excel: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  // ==================== GMAIL ACTIONS ====================

  const handleOpenEmail = async (msgId: string) => {
    const token = await ensureToken();
    if (!token) return;
    setLoading(true);
    setLoadingNotice('Reading email conversation...');
    try {
      const detail = await getGmailMessageDetail(token, msgId);
      setSelectedEmail(detail);
      setEmailTo(detail.from);
      setEmailSubject(`Re: ${detail.subject}`);
    } catch (err: any) {
      setStatusMessage({ text: `Failed to read email: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!emailTo.trim() || !emailSubject.trim()) {
      setStatusMessage({ text: 'Recipient and Subject are required for draft.', isError: true });
      return;
    }
    const token = await ensureToken();
    if (!token) return;
    setLoading(true);
    setLoadingNotice('Saving draft to Gmail...');
    try {
      await createGmailDraft(token, emailTo.trim(), emailSubject.trim(), emailBody);
      setStatusMessage({ text: 'Draft saved to your Gmail account!' });
    } catch (err: any) {
      setStatusMessage({ text: `Failed to save draft: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleAiDraftEmail = async () => {
    if (!aiEmailPrompt.trim()) return;
    setLoading(true);
    setLoadingNotice(`AI composing email: "${aiEmailPrompt.trim()}"...`);
    try {
      const emailResult = await requestAiEmail(aiEmailPrompt.trim(), aiEmailRecipient.trim() || undefined);
      if (emailResult.to) setEmailTo(emailResult.to);
      if (emailResult.subject) setEmailSubject(emailResult.subject);
      if (emailResult.body) setEmailBody(emailResult.body);
      setStatusMessage({
        text: 'AI generated email draft! Review the subject, recipient, and message before sending.',
      });
      setAiEmailPrompt('');
    } catch (err: any) {
      setStatusMessage({ text: `Failed to draft email: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteSendEmail = async () => {
    setConfirmSendOpen(false);
    if (!emailTo.trim() || !emailSubject.trim()) return;
    const token = await ensureToken();
    if (!token) return;
    setLoading(true);
    setLoadingNotice('Sending email via Gmail API...');
    try {
      await sendGmailMessage(token, emailTo.trim(), emailSubject.trim(), emailBody);
      setEmailTo('');
      setEmailSubject('');
      setEmailBody('');
      setStatusMessage({ text: 'Email dispatched through Gmail successfully!' });
      const emails = await listGmailMessages(token, undefined, 15);
      setGmailMessages(emails);
    } catch (err: any) {
      setStatusMessage({ text: `Failed to send email: ${err.message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-slate-100 overflow-hidden select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-500/20">
            🏢
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-wide text-slate-100">
                Jarvis Workspace &amp; Office AI
              </h2>
              <span className="text-[10px] tracking-wider uppercase font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                AI Generation &amp; Editing
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Make Google Slides Presentations, Edit Docs, Edit Spreadsheets &amp; Microsoft Excel
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {workspaceToken ? (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-mono text-[11px]">Google Workspace Connected</span>
            </div>
          ) : (
            <button
              onClick={() => signInWithGoogle()}
              className="px-3.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold tracking-wide transition flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <span>Connect Google Workspace</span>
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
              title="Close Hub"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center px-4 border-b border-slate-800/80 bg-slate-900/60 shrink-0 gap-1 overflow-x-auto py-1">
        <button
          onClick={() => setActiveTab('slides')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition cursor-pointer ${
            activeTab === 'slides'
              ? 'bg-amber-600/25 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <span className="text-amber-400 font-bold">📽️</span>
          <span>Google Slides (Presentations)</span>
        </button>

        <button
          onClick={() => setActiveTab('docs')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition cursor-pointer ${
            activeTab === 'docs'
              ? 'bg-blue-600/25 text-blue-300 border border-blue-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <span className="text-blue-400 font-bold">📄</span>
          <span>Google Docs (Edit &amp; Draft)</span>
        </button>

        <button
          onClick={() => setActiveTab('sheets')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition cursor-pointer ${
            activeTab === 'sheets'
              ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <span className="text-emerald-400 font-bold">📊</span>
          <span>Google Sheets (Spreadsheets)</span>
        </button>

        <button
          onClick={() => setActiveTab('excel')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition cursor-pointer ${
            activeTab === 'excel'
              ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-400/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <span className="text-emerald-400 font-bold">📗</span>
          <span>Microsoft Excel (.xlsx)</span>
        </button>

        <button
          onClick={() => setActiveTab('gmail')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition cursor-pointer ${
            activeTab === 'gmail'
              ? 'bg-rose-600/25 text-rose-300 border border-rose-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <span className="text-rose-400 font-bold">✉️</span>
          <span>Gmail</span>
        </button>
      </div>

      {/* Global Status Banner */}
      {statusMessage && (
        <div
          className={`px-4 py-2 text-xs flex items-center justify-between border-b ${
            statusMessage.isError
              ? 'bg-red-950/70 border-red-800/60 text-red-300'
              : 'bg-emerald-950/60 border-emerald-800/50 text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{statusMessage.text}</span>
            {statusMessage.actionLink && (
              <a
                href={statusMessage.actionLink}
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline ml-1 hover:text-white"
              >
                {statusMessage.actionLabel || 'Open Link ↗'}
              </a>
            )}
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs opacity-75 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative flex">
        {loading && (
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm z-30 flex items-center justify-center">
            <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 px-5 py-3 rounded-xl shadow-2xl">
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs text-slate-200 font-medium">{loadingNotice}</span>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 1: GOOGLE SLIDES (MAKE PRESENTATIONS) */}
        {/* ========================================================= */}
        {activeTab === 'slides' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar List */}
            <div className="w-72 border-r border-slate-800 bg-slate-900/40 flex flex-col shrink-0">
              <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                  Presentations ({slidesList.length})
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {slidesList.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    {workspaceToken
                      ? 'No Google Slides found. Use the AI Presentation Generator to create one!'
                      : 'Connect your Google account above to load Google Slides.'}
                  </div>
                ) : (
                  slidesList.map((pres) => (
                    <button
                      key={pres.id}
                      onClick={() => handleOpenSlides(pres.id, pres.name)}
                      className={`w-full text-left p-2.5 rounded-md transition text-xs flex flex-col gap-1 cursor-pointer ${
                        selectedSlideId === pres.id
                          ? 'bg-amber-600/20 border border-amber-500/30 text-amber-200'
                          : 'hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <div className="font-medium truncate">{pres.name}</div>
                      <div className="text-[10px] text-slate-500 flex justify-between">
                        <span>ID: {pres.id.slice(0, 8)}...</span>
                        {pres.webViewLink && (
                          <a
                            href={pres.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-amber-400 hover:underline"
                          >
                            Open ↗
                          </a>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Main Presentation Stage */}
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 p-4">
              {/* Top AI Presentation Creator Bar */}
              <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl mb-4 shrink-0 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-bold">✨ AI Presentation Generator</span>
                    <span className="text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                      Google Slides API
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Generates complete multi-slide deck with structured titles &amp; bullet points
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={aiPresTopic}
                    onChange={(e) => setAiPresTopic(e.target.value)}
                    placeholder='Enter presentation topic e.g. "Future of Artificial Intelligence in Healthcare"'
                    className="flex-1 px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleAiCreatePresentation()}
                  />

                  <select
                    value={aiPresSlideCount}
                    onChange={(e) => setAiPresSlideCount(Number(e.target.value))}
                    className="px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value={3}>3 Slides</option>
                    <option value={4}>4 Slides</option>
                    <option value={5}>5 Slides</option>
                    <option value={6}>6 Slides</option>
                    <option value={7}>7 Slides</option>
                    <option value={8}>8 Slides</option>
                  </select>

                  <button
                    onClick={handleAiCreatePresentation}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition flex items-center gap-1.5 shadow-sm cursor-pointer shrink-0"
                  >
                    <span>✨ Make Presentation</span>
                  </button>
                </div>

                {/* Automated Theme Selector & Gemini Analysis Row */}
                <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-slate-300">🎨 Deck Theme:</span>
                    <button
                      onClick={handleAiAnalyzeTheme}
                      className="px-3 py-1 rounded-md bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 text-[11px] font-medium transition flex items-center gap-1.5 cursor-pointer"
                      title="Analyze presentation topic with Gemini API to dynamically choose color palette and layout style"
                    >
                      <span>✨ Auto-Analyze Topic Theme (Gemini AI)</span>
                    </button>

                    <select
                      value={selectedSlideTheme?.name || THEME_PRESETS[0].name}
                      onChange={(e) => {
                        const found = THEME_PRESETS.find((p) => p.name === e.target.value);
                        if (found) setSelectedSlideTheme(found);
                      }}
                      className="px-2.5 py-1 text-[11px] rounded bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      {THEME_PRESETS.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Active Palette Swatches */}
                  <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3 py-1 rounded-lg">
                    <span className="text-[10px] uppercase font-mono text-slate-400">
                      {selectedSlideTheme?.layoutStyle || 'Modern-Card'} Layout:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-4 h-4 rounded border border-white/20"
                        style={{ backgroundColor: selectedSlideTheme?.hexBg || '#0A192F' }}
                        title={`Background: ${selectedSlideTheme?.hexBg || '#0A192F'}`}
                      />
                      <div
                        className="w-4 h-4 rounded border border-white/20"
                        style={{ backgroundColor: selectedSlideTheme?.hexTitle || '#38BDF8' }}
                        title={`Title: ${selectedSlideTheme?.hexTitle || '#38BDF8'}`}
                      />
                      <div
                        className="w-4 h-4 rounded border border-white/20"
                        style={{ backgroundColor: selectedSlideTheme?.hexBody || '#E2E8F0' }}
                        title={`Body: ${selectedSlideTheme?.hexBody || '#E2E8F0'}`}
                      />
                      <div
                        className="w-4 h-4 rounded border border-white/20"
                        style={{ backgroundColor: selectedSlideTheme?.hexAccent || '#06B6D4' }}
                        title={`Accent: ${selectedSlideTheme?.hexAccent || '#06B6D4'}`}
                      />
                    </div>
                    <span className="text-[10px] text-amber-300 font-mono font-medium">
                      {selectedSlideTheme?.name || 'Deep Quantum Navy'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Selected Presentation View */}
              {selectedSlideId ? (
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4 shrink-0">
                    <div>
                      <h3 className="text-base font-semibold text-white">{selectedSlideTitle}</h3>
                      <p className="text-xs text-slate-400">Total slides: {slideCount}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleApplyThemeToDeck}
                        className="px-3 py-1.5 text-xs rounded-md bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 font-medium transition cursor-pointer flex items-center gap-1.5"
                        title="Update all existing slides in this presentation with the selected theme background and typography"
                      >
                        <span>🎨 Apply Theme to Deck</span>
                      </button>
                      <a
                        href={`https://docs.google.com/presentation/d/${selectedSlideId}/edit`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 text-xs rounded-md bg-amber-600 hover:bg-amber-500 text-white font-medium transition"
                      >
                        Open in Google Slides ↗
                      </a>
                    </div>
                  </div>

                  {/* Slide Outline Preview */}
                  <div className="flex-1 overflow-y-auto p-6 bg-slate-950 rounded-lg border border-slate-800 flex flex-col items-center justify-center text-center mb-4">
                    <div
                      className="w-full max-w-xl aspect-[16/9] border rounded-xl p-8 shadow-2xl flex flex-col justify-between text-left transition-all"
                      style={{
                        backgroundColor: selectedSlideTheme?.hexBg || '#0A192F',
                        borderColor: selectedSlideTheme?.hexAccent || '#1E293B',
                        color: selectedSlideTheme?.hexBody || '#CBD5E1',
                      }}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span
                            className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded font-bold"
                            style={{
                              color: selectedSlideTheme?.hexAccent || '#F59E0B',
                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                            }}
                          >
                            {selectedSlideTheme?.name ? `Theme: ${selectedSlideTheme.name}` : 'Google Slides Live Deck'}
                          </span>
                          <span className="text-[10px] opacity-60 font-mono">16:9 HD</span>
                        </div>
                        <h2
                          className="text-2xl font-bold mt-4 tracking-tight"
                          style={{ color: selectedSlideTheme?.hexTitle || '#F8FAFC' }}
                        >
                          {selectedSlideTitle}
                        </h2>
                        {selectedSlideTheme?.description && (
                          <p className="text-xs opacity-75 mt-1">{selectedSlideTheme.description}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs">
                          Deck contains {slideCount} slide(s) styled with topic clearance background and typography.
                        </p>
                        <p className="text-[11px] opacity-70">
                          Use the AI slide generator below to append more slides automatically.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* AI Add Slide Section */}
                  <div className="shrink-0 flex items-center gap-2 p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
                    <span className="text-xs font-semibold text-amber-400 shrink-0">✨ AI Add Slide:</span>
                    <input
                      type="text"
                      value={newSlideTopic}
                      onChange={(e) => setNewSlideTopic(e.target.value)}
                      placeholder='Slide topic e.g. "Competitive Advantages" or "Financial Forecast"'
                      className="flex-1 px-3 py-1.5 text-xs rounded bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      onKeyDown={(e) => e.key === 'Enter' && handleAiAddSlide()}
                    />
                    <button
                      onClick={handleAiAddSlide}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded bg-amber-600 hover:bg-amber-500 text-white transition shrink-0 cursor-pointer"
                    >
                      + AI Generate Slide
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500">
                  <div className="w-12 h-12 rounded-full bg-amber-900/20 text-amber-400 flex items-center justify-center text-2xl mb-3">
                    📽️
                  </div>
                  <h4 className="text-sm font-semibold text-slate-300 mb-1">Make a Presentation with AI</h4>
                  <p className="text-xs max-w-sm mb-4">
                    Type any topic above to have Jarvis AI generate a full presentation directly in Google Slides.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: GOOGLE DOCS (MAKE & EDIT DOCS) */}
        {/* ========================================================= */}
        {activeTab === 'docs' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar List */}
            <div className="w-72 border-r border-slate-800 bg-slate-900/40 flex flex-col shrink-0">
              <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                  Documents ({docsList.length})
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {docsList.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    {workspaceToken
                      ? 'No Google Docs found in Drive. Use the AI Document Creator below!'
                      : 'Connect your Google account above to access Drive documents.'}
                  </div>
                ) : (
                  docsList.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => handleOpenDoc(doc.id, doc.name)}
                      className={`w-full text-left p-2.5 rounded-md transition text-xs flex flex-col gap-1 cursor-pointer ${
                        selectedDocId === doc.id
                          ? 'bg-blue-600/20 border border-blue-500/30 text-blue-200'
                          : 'hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <div className="font-medium truncate">{doc.name}</div>
                      <div className="text-[10px] text-slate-500 flex justify-between">
                        <span>ID: {doc.id.slice(0, 8)}...</span>
                        {doc.webViewLink && (
                          <a
                            href={doc.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-400 hover:underline"
                          >
                            Open ↗
                          </a>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Document Editor Area */}
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 p-4">
              {/* Top AI Document Creator */}
              <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl mb-4 shrink-0 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-400 font-bold">✨ AI Document Creator</span>
                    <span className="text-[10px] font-mono uppercase bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">
                      Google Docs API
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Drafts complete structured reports, proposals, and specifications
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={aiDocPrompt}
                    onChange={(e) => setAiDocPrompt(e.target.value)}
                    placeholder='Document topic e.g. "Q4 Strategic Business Plan & Financial Model"'
                    className="flex-1 px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleAiCreateDoc()}
                  />

                  <select
                    value={aiDocType}
                    onChange={(e) => setAiDocType(e.target.value)}
                    className="px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="Strategic Proposal">Strategic Proposal</option>
                    <option value="Technical Specification">Technical Specification</option>
                    <option value="Meeting Minutes & Action Items">Meeting Minutes &amp; Action Items</option>
                    <option value="Project Charter">Project Charter</option>
                    <option value="Executive Summary">Executive Summary</option>
                  </select>

                  <button
                    onClick={handleAiCreateDoc}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 shadow-sm cursor-pointer shrink-0"
                  >
                    <span>✨ Make Doc</span>
                  </button>
                </div>
              </div>

              {/* Selected Doc Editor */}
              {selectedDocId ? (
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3 shrink-0">
                    <div>
                      <h3 className="text-base font-semibold text-white">{selectedDocTitle}</h3>
                      <p className="text-xs text-slate-400">Live editing directly via Google Docs API</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsEditingDocDirectly(!isEditingDocDirectly)}
                        className={`px-3 py-1.5 text-xs rounded-md transition font-medium cursor-pointer ${
                          isEditingDocDirectly
                            ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        {isEditingDocDirectly ? 'Editing Direct' : 'Edit In-Place'}
                      </button>

                      {isEditingDocDirectly && (
                        <button
                          onClick={handleSaveDirectDocEdits}
                          className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition cursor-pointer"
                        >
                          💾 Save Changes
                        </button>
                      )}

                      <a
                        href={`https://docs.google.com/document/d/${selectedDocId}/edit`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition"
                      >
                        Open in Google Docs ↗
                      </a>
                    </div>
                  </div>

                  {/* AI Doc Edit Copilot Bar */}
                  <div className="flex items-center gap-2 p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg mb-3 shrink-0">
                    <span className="text-xs font-semibold text-blue-400 shrink-0">⚡ AI Edit Doc:</span>
                    <input
                      type="text"
                      value={docEditInstruction}
                      onChange={(e) => setDocEditInstruction(e.target.value)}
                      placeholder='e.g. "Add a section on Risk Mitigation & Contingency Planning", "Summarize into bullet points"'
                      className="flex-1 px-3 py-1.5 text-xs rounded bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      onKeyDown={(e) => e.key === 'Enter' && handleAiApplyDocEdit()}
                    />
                    <button
                      onClick={handleAiApplyDocEdit}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded bg-blue-600 hover:bg-blue-500 text-white transition shrink-0 cursor-pointer"
                    >
                      Apply AI Edit
                    </button>
                  </div>

                  {/* Document Body Area */}
                  {isEditingDocDirectly ? (
                    <textarea
                      value={docContentText}
                      onChange={(e) => setDocContentText(e.target.value)}
                      className="flex-1 w-full p-4 text-xs font-mono rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
                    />
                  ) : (
                    <div className="flex-1 overflow-y-auto whitespace-pre-wrap font-sans text-xs text-slate-200 leading-relaxed p-4 bg-slate-950/80 rounded-lg border border-slate-800 select-text">
                      {docContentText || '(Empty document)'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500">
                  <div className="w-12 h-12 rounded-full bg-blue-900/20 text-blue-400 flex items-center justify-center text-2xl mb-3">
                    📄
                  </div>
                  <h4 className="text-sm font-semibold text-slate-300 mb-1">Make &amp; Edit Google Docs</h4>
                  <p className="text-xs max-w-sm mb-4">
                    Generate complete documents with AI, or select any Google Doc to edit sections and content directly.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: GOOGLE SHEETS (MAKE & EDIT SPREADSHEETS) */}
        {/* ========================================================= */}
        {activeTab === 'sheets' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar List */}
            <div className="w-72 border-r border-slate-800 bg-slate-900/40 flex flex-col shrink-0">
              <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                  Spreadsheets ({sheetsList.length})
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {sheetsList.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    {workspaceToken
                      ? 'No spreadsheets found in Drive. Use the AI Spreadsheet Generator below!'
                      : 'Connect your Google account above to load Google Sheets.'}
                  </div>
                ) : (
                  sheetsList.map((sh) => (
                    <button
                      key={sh.id}
                      onClick={() => handleOpenSheet(sh.id, sh.name)}
                      className={`w-full text-left p-2.5 rounded-md transition text-xs flex flex-col gap-1 cursor-pointer ${
                        selectedSheetId === sh.id
                          ? 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-200'
                          : 'hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <div className="font-medium truncate">{sh.name}</div>
                      <div className="text-[10px] text-slate-500 flex justify-between">
                        <span>ID: {sh.id.slice(0, 8)}...</span>
                        {sh.webViewLink && (
                          <a
                            href={sh.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-emerald-400 hover:underline"
                          >
                            Open ↗
                          </a>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Sheet Grid Stage */}
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 p-4">
              {/* Top AI Spreadsheet Creator */}
              <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl mb-4 shrink-0 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold">✨ AI Spreadsheet Creator</span>
                    <span className="text-[10px] font-mono uppercase bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded">
                      Google Sheets API
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Generates formatted column headers and realistic data rows
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={aiSheetPrompt}
                    onChange={(e) => setAiSheetPrompt(e.target.value)}
                    placeholder='Spreadsheet concept e.g. "Startup Q1-Q4 Departmental Expenses and Headcount"'
                    className="flex-1 px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleAiCreateSheet()}
                  />

                  <button
                    onClick={handleAiCreateSheet}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 shadow-sm cursor-pointer shrink-0"
                  >
                    <span>✨ Make Sheet</span>
                  </button>
                </div>
              </div>

              {/* Selected Sheet Grid */}
              {selectedSheetId ? (
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3 shrink-0">
                    <div>
                      <h3 className="text-base font-semibold text-white">{selectedSheetTitle}</h3>
                      <p className="text-xs text-slate-400">
                        {sheetRows.length} rows loaded · Double-click any cell to edit directly
                      </p>
                    </div>
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${selectedSheetId}/edit`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition"
                    >
                      Open in Google Sheets ↗
                    </a>
                  </div>

                  {/* AI Edit Spreadsheet Bar */}
                  <div className="flex items-center gap-2 p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg mb-3 shrink-0">
                    <span className="text-xs font-semibold text-emerald-400 shrink-0">⚡ AI Edit Sheet:</span>
                    <input
                      type="text"
                      value={sheetEditInstruction}
                      onChange={(e) => setSheetEditInstruction(e.target.value)}
                      placeholder='e.g. "Add 3 new rows for European region performance", "Add total calculation row"'
                      className="flex-1 px-3 py-1.5 text-xs rounded bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      onKeyDown={(e) => e.key === 'Enter' && handleAiApplySheetEdit()}
                    />
                    <button
                      onClick={handleAiApplySheetEdit}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-white transition shrink-0 cursor-pointer"
                    >
                      Apply AI Edit
                    </button>
                  </div>

                  {/* Table Grid */}
                  <div className="flex-1 overflow-auto border border-slate-800 rounded-lg bg-slate-950">
                    <table className="w-full text-left text-xs border-collapse">
                      <tbody>
                        {sheetRows.map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className={`border-b border-slate-800/80 ${
                              rIdx === 0
                                ? 'bg-slate-900 font-semibold text-slate-300 sticky top-0 z-10'
                                : 'hover:bg-slate-900/40'
                            }`}
                          >
                            <td className="px-3 py-2 font-mono text-[11px] text-slate-500 border-r border-slate-800 w-12 text-center bg-slate-950">
                              {rIdx + 1}
                            </td>
                            {Array.isArray(row) &&
                              row.map((cell, cIdx) => {
                                const isEditing =
                                  editingSheetCell?.row === rIdx && editingSheetCell?.col === cIdx;
                                return (
                                  <td
                                    key={cIdx}
                                    onDoubleClick={() =>
                                      setEditingSheetCell({ row: rIdx, col: cIdx, val: String(cell ?? '') })
                                    }
                                    className={`px-3 py-2 border-r border-slate-800/60 truncate max-w-[200px] cursor-pointer ${
                                      isEditing ? 'p-0 bg-emerald-950' : 'hover:bg-slate-800/40'
                                    }`}
                                  >
                                    {isEditing ? (
                                      <input
                                        autoFocus
                                        type="text"
                                        defaultValue={String(cell ?? '')}
                                        onBlur={(e) => handleSaveSheetCell(rIdx, cIdx, e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            handleSaveSheetCell(rIdx, cIdx, (e.target as HTMLInputElement).value);
                                          } else if (e.key === 'Escape') {
                                            setEditingSheetCell(null);
                                          }
                                        }}
                                        className="w-full h-full px-2 py-1.5 text-xs bg-slate-900 border-2 border-emerald-500 text-white outline-none"
                                      />
                                    ) : (
                                      <span>{String(cell ?? '')}</span>
                                    )}
                                  </td>
                                );
                              })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500">
                  <div className="w-12 h-12 rounded-full bg-emerald-900/20 text-emerald-400 flex items-center justify-center text-2xl mb-3">
                    📊
                  </div>
                  <h4 className="text-sm font-semibold text-slate-300 mb-1">Make &amp; Edit Google Sheets</h4>
                  <p className="text-xs max-w-sm mb-4">
                    Type a topic above to create a spreadsheet, or select an existing Google Sheet to edit rows and cells.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: MICROSOFT EXCEL (.xlsx) (MAKE & EDIT EXCEL) */}
        {/* ========================================================= */}
        {activeTab === 'excel' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 p-4">
            {/* Top Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/90 border border-slate-800 rounded-lg mb-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold text-sm">
                  XLS
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-100">{excelData.fileName}</h3>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      .XLSX Excel Engine
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span>
                      Sheet: <b className="text-slate-200">{currentExcelSheet?.name || 'Sheet1'}</b>
                    </span>
                    <span>•</span>
                    <span>
                      {currentExcelSheet?.rows?.length || 0} rows × {currentExcelSheet?.headers?.length || 0} cols
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span>📁 Upload .xlsx</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleExcelFileUpload}
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                />

                <button
                  onClick={handleDownloadExcel}
                  className="px-3.5 py-1.5 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition flex items-center gap-1 shadow-sm cursor-pointer"
                >
                  <span>⬇ Download .xlsx</span>
                </button>

                <button
                  onClick={handleSaveExcelToDrive}
                  className="px-3 py-1.5 text-xs rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition flex items-center gap-1 cursor-pointer"
                  title="Upload this Excel workbook directly into your Google Drive"
                >
                  <span>☁ Save to Drive</span>
                </button>
              </div>
            </div>

            {/* AI Excel Generator & Formula Copilot Bar */}
            <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg mb-3 shrink-0 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-emerald-400 shrink-0">⚡ AI Excel Copilot:</span>
                <input
                  type="text"
                  value={excelAiPrompt}
                  onChange={(e) => setExcelAiPrompt(e.target.value)}
                  placeholder='Ask AI to build a model e.g. "3-Year SaaS Financial Forecast" or edit formulas e.g. "Add Total row"'
                  className="flex-1 px-3 py-1.5 text-xs rounded bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (excelAiPrompt.toLowerCase().includes('total') || excelAiPrompt.toLowerCase().includes('margin') || excelAiPrompt.toLowerCase().includes('tax')) {
                        handleAiApplyExcelFormula();
                      } else {
                        handleAiCreateExcel();
                      }
                    }
                  }}
                />
                <button
                  onClick={handleAiCreateExcel}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-white transition shrink-0 cursor-pointer"
                >
                  ✨ Build New Excel
                </button>
                <button
                  onClick={handleAiApplyExcelFormula}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 transition shrink-0 cursor-pointer"
                >
                  Apply Formula / Total
                </button>
              </div>

              {/* Quick Formula Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] text-slate-400 pt-1">
                <span className="text-slate-500">Quick AI Actions:</span>
                <button
                  onClick={() => {
                    setExcelAiPrompt('Add a Total Row calculating sum of all columns');
                    handleAiApplyExcelFormula();
                  }}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  + Add Total Row (=SUM)
                </button>
                <button
                  onClick={() => {
                    setExcelAiPrompt('Add Profit Margin percentage column');
                    handleAiApplyExcelFormula();
                  }}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  + Add Profit Margin %
                </button>
                <button
                  onClick={() => {
                    setExcelAiPrompt('Add 15% Estimated Tax column');
                    handleAiApplyExcelFormula();
                  }}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  + Add 15% Tax Column
                </button>
              </div>
            </div>

            {/* Editable Spreadsheet Grid */}
            <div className="flex-1 overflow-auto border border-slate-800 rounded-lg bg-slate-950 relative">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-slate-400 sticky top-0 z-10 border-b border-slate-800">
                    <th className="p-2 border-r border-slate-800 text-center w-12 bg-slate-950 font-mono text-[11px]">
                      #
                    </th>
                    {currentExcelSheet?.headers?.map((h, i) => (
                      <th
                        key={i}
                        className="p-2.5 font-semibold text-slate-200 border-r border-slate-800/80 min-w-[120px]"
                      >
                        <div className="flex items-center justify-between">
                          <span>{h}</span>
                          <span className="text-[10px] font-mono text-slate-500">
                            {getColumnLetter(i)}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {currentExcelSheet?.rows?.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="border-b border-slate-800/60 hover:bg-slate-900/40 transition-colors"
                    >
                      <td className="p-2 font-mono text-[11px] text-slate-500 border-r border-slate-800 text-center bg-slate-950">
                        {rIdx + 1}
                      </td>
                      {row.map((cell, cIdx) => {
                        const isEditing =
                          editingExcelCell?.row === rIdx && editingExcelCell?.col === cIdx;
                        return (
                          <td
                            key={cIdx}
                            onDoubleClick={() =>
                              setEditingExcelCell({ row: rIdx, col: cIdx, val: String(cell ?? '') })
                            }
                            className={`p-2 border-r border-slate-800/60 relative ${
                              isEditing ? 'p-0 bg-indigo-950' : 'cursor-pointer hover:bg-slate-800/40'
                            }`}
                          >
                            {isEditing ? (
                              <input
                                autoFocus
                                type="text"
                                defaultValue={String(cell ?? '')}
                                onBlur={(e) => handleExcelCellSave(rIdx, cIdx, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleExcelCellSave(rIdx, cIdx, (e.target as HTMLInputElement).value);
                                  } else if (e.key === 'Escape') {
                                    setEditingExcelCell(null);
                                  }
                                }}
                                className="w-full h-full px-2 py-1.5 text-xs bg-slate-900 border-2 border-indigo-500 text-white outline-none"
                              />
                            ) : (
                              <div className="truncate text-slate-200 font-mono text-xs">
                                {String(cell ?? '')}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Sheet Tabs Bar */}
            <div className="flex items-center justify-between pt-3 shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 mr-1">Sheets:</span>
                {excelData.sheets.map((sheet, idx) => (
                  <button
                    key={sheet.name}
                    onClick={() => setExcelData((prev) => ({ ...prev, activeSheetIndex: idx }))}
                    className={`px-3 py-1 text-xs rounded font-medium transition cursor-pointer ${
                      excelData.activeSheetIndex === idx
                        ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {sheet.name}
                  </button>
                ))}
              </div>

              {/* Add Sheet */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newSheetName}
                  onChange={(e) => setNewSheetName(e.target.value)}
                  placeholder="New sheet name..."
                  className="px-2.5 py-1 text-xs rounded bg-slate-900 border border-slate-800 text-slate-300 placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-36"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newSheetName.trim()) {
                      const newSheet = createEmptyExcelSheet(newSheetName.trim(), 5, 8);
                      setExcelData((prev) => ({
                        ...prev,
                        sheets: [...prev.sheets, newSheet],
                        activeSheetIndex: prev.sheets.length,
                      }));
                      setNewSheetName('');
                      setStatusMessage({ text: `Created sheet "${newSheetName}"!` });
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (!newSheetName.trim()) return;
                    const newSheet = createEmptyExcelSheet(newSheetName.trim(), 5, 8);
                    setExcelData((prev) => ({
                      ...prev,
                      sheets: [...prev.sheets, newSheet],
                      activeSheetIndex: prev.sheets.length,
                    }));
                    setNewSheetName('');
                    setStatusMessage({ text: `Created sheet "${newSheetName}"!` });
                  }}
                  className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
                >
                  + Add Sheet
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: GMAIL */}
        {/* ========================================================= */}
        {activeTab === 'gmail' && (
          <div className="flex-1 flex overflow-hidden">
            <div className="w-80 border-r border-slate-800 bg-slate-900/40 flex flex-col shrink-0">
              <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                  Gmail Inbox
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {gmailMessages.length} emails
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {gmailMessages.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    {workspaceToken
                      ? 'No messages found in inbox.'
                      : 'Connect your Google account above to access Gmail messages.'}
                  </div>
                ) : (
                  gmailMessages.map((msg) => (
                    <button
                      key={msg.id}
                      onClick={() => handleOpenEmail(msg.id)}
                      className={`w-full text-left p-2.5 rounded-md transition text-xs flex flex-col gap-1 cursor-pointer ${
                        selectedEmail?.id === msg.id
                          ? 'bg-rose-600/20 border border-rose-500/30 text-rose-200'
                          : 'hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold truncate max-w-[170px] text-slate-200">
                          {msg.from || 'Unknown'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">{msg.date}</span>
                      </div>
                      <div className="font-medium text-slate-300 truncate">{msg.subject || '(No Subject)'}</div>
                      <div className="text-[11px] text-slate-400 line-clamp-1">{msg.snippet}</div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 p-4">
              <div className="flex-1 flex flex-col overflow-hidden bg-slate-900/60 border border-slate-800 rounded-lg p-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4 shrink-0">
                  <h3 className="text-base font-semibold text-white">
                    {selectedEmail ? 'Email Conversation & Reply' : 'Compose Email with Jarvis'}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveDraft}
                      className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer"
                    >
                      Save as Gmail Draft
                    </button>
                    <button
                      onClick={() => setConfirmSendOpen(true)}
                      className="px-3 py-1.5 text-xs rounded bg-rose-600 hover:bg-rose-500 text-white font-medium transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Send Email</span>
                      <span>✈</span>
                    </button>
                  </div>
                </div>

                {/* AI Email Copilot Bar */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg mb-3 shrink-0 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-rose-400 font-semibold text-xs">✨ AI Email Drafter</span>
                      <span className="text-[10px] uppercase font-mono bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded">
                        Review Before Send
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Jarvis drafts the email for your review — you inspect and confirm before it sends.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={aiEmailRecipient}
                      onChange={(e) => setAiEmailRecipient(e.target.value)}
                      placeholder="To: (optional, e.g. team@company.com)"
                      className="w-56 px-2.5 py-1.5 text-xs rounded bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                    />
                    <input
                      type="text"
                      value={aiEmailPrompt}
                      onChange={(e) => setAiEmailPrompt(e.target.value)}
                      placeholder='Prompt e.g. "Draft an executive summary update on project milestones and next sprint deliverables"'
                      className="flex-1 px-3 py-1.5 text-xs rounded bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                      onKeyDown={(e) => e.key === 'Enter' && handleAiDraftEmail()}
                    />
                    <button
                      onClick={handleAiDraftEmail}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded bg-rose-600 hover:bg-rose-500 text-white transition flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <span>✨ Draft Email</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3 shrink-0 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-16">To:</span>
                    <input
                      type="email"
                      value={emailTo}
                      onChange={(e) => setEmailTo(e.target.value)}
                      placeholder="recipient@example.com"
                      className="flex-1 px-3 py-1.5 text-xs rounded bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-16">Subject:</span>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Email subject..."
                      className="flex-1 px-3 py-1.5 text-xs rounded bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>

                <div className="flex-1 flex flex-col min-h-0">
                  <textarea
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    placeholder="Write your email body here or let Jarvis draft your message..."
                    className="flex-1 w-full p-4 text-xs font-sans rounded bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500 resize-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog for Destructive Action (Sending Email) */}
      {confirmSendOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 max-w-md w-full shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-2">Confirm Send Email</h3>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Are you sure you want to send this email to <b className="text-rose-400">{emailTo}</b> with subject{' '}
              <b className="text-slate-200">&quot;{emailSubject}&quot;</b>? This action will deliver the email through your real Gmail account.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmSendOpen(false)}
                className="px-3.5 py-1.5 text-xs rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteSendEmail}
                className="px-4 py-1.5 text-xs rounded-md bg-rose-600 hover:bg-rose-500 text-white font-medium transition cursor-pointer"
              >
                Confirm &amp; Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
