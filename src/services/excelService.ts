/**
 * Microsoft Excel (.xlsx / .xls) Service
 * Provides in-browser workbook creation, cell-level editing, formula calculation,
 * file reading, template generation, and .xlsx binary export.
 */
import * as XLSX from 'xlsx';

export interface ExcelCellCoordinate {
  row: number; // 0-indexed
  col: number; // 0-indexed
}

export interface ExcelSheetData {
  name: string;
  headers: string[];
  rows: (string | number | boolean | null)[][];
}

export interface ExcelWorkbookData {
  fileName: string;
  sheets: ExcelSheetData[];
  activeSheetIndex: number;
}

export const EXCEL_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Parses an uploaded Excel (.xlsx, .xls, .csv) file into in-memory workbook structure
 */
export async function parseExcelFile(file: File | Blob): Promise<ExcelWorkbookData> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellNF: true });

  const fileName = (file as File).name || 'Spreadsheet.xlsx';
  const sheets: ExcelSheetData[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    // Convert to 2D array of rows
    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      blankrows: true,
    });

    const headers: string[] = [];
    const rows: (string | number | boolean | null)[][] = [];

    if (rawRows.length > 0) {
      // First row as headers, or generate A, B, C...
      const firstRow = rawRows[0] || [];
      const colCount = Math.max(
        firstRow.length,
        ...rawRows.map((r) => (r ? r.length : 0))
      );

      for (let i = 0; i < Math.max(colCount, 5); i++) {
        const val = firstRow[i];
        headers.push(val !== undefined && val !== '' ? String(val) : getColumnLetter(i));
      }

      for (let r = 1; r < rawRows.length; r++) {
        const row = rawRows[r] || [];
        const paddedRow: any[] = [];
        for (let c = 0; c < headers.length; c++) {
          paddedRow.push(row[c] !== undefined ? row[c] : '');
        }
        rows.push(paddedRow);
      }
    } else {
      // Default empty grid
      for (let i = 0; i < 5; i++) {
        headers.push(getColumnLetter(i));
      }
      for (let r = 0; r < 6; r++) {
        rows.push(new Array(headers.length).fill(''));
      }
    }

    sheets.push({
      name: sheetName,
      headers,
      rows,
    });
  }

  return {
    fileName,
    sheets: sheets.length > 0 ? sheets : [createEmptyExcelSheet('Sheet1')],
    activeSheetIndex: 0,
  };
}

/**
 * Creates an empty starter Excel workbook
 */
export function createNewExcelWorkbook(
  fileName = 'New_Workbook.xlsx',
  sheetName = 'Sheet1',
  headers = ['Item', 'Category', 'Quantity', 'Unit Price', 'Total'],
  initialRows?: any[][]
): ExcelWorkbookData {
  const rows: any[][] = initialRows || [
    ['Product Alpha', 'Hardware', 10, 150, 1500],
    ['Service Beta', 'Consulting', 4, 300, 1200],
    ['License Gamma', 'Software', 25, 45, 1125],
    ['Support Retainer', 'Operations', 1, 800, 800],
  ];

  return {
    fileName,
    sheets: [
      {
        name: sheetName,
        headers,
        rows,
      },
    ],
    activeSheetIndex: 0,
  };
}

export function createEmptyExcelSheet(name = 'Sheet1', cols = 6, rowCount = 8): ExcelSheetData {
  const headers = Array.from({ length: cols }, (_, i) => getColumnLetter(i));
  const rows = Array.from({ length: rowCount }, () => new Array(cols).fill(''));
  return { name, headers, rows };
}

/**
 * Exports current in-memory workbook to a binary Excel .xlsx Blob
 */
export function exportExcelToBlob(workbookData: ExcelWorkbookData): Blob {
  const wb = XLSX.utils.book_new();

  for (const sheet of workbookData.sheets) {
    const fullTable = [sheet.headers, ...sheet.rows];
    const ws = XLSX.utils.aoa_to_sheet(fullTable);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: EXCEL_MIME_TYPE });
}

/**
 * Triggers browser download of current Excel workbook
 */
export function downloadExcelFile(workbookData: ExcelWorkbookData): void {
  const blob = exportExcelToBlob(workbookData);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = workbookData.fileName.endsWith('.xlsx')
    ? workbookData.fileName
    : `${workbookData.fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Converts 0-indexed column integer to Excel letter (0 -> A, 25 -> Z, 26 -> AA)
 */
export function getColumnLetter(colIndex: number): string {
  let letter = '';
  let temp = colIndex;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Pre-built Microsoft Excel templates designed for high-productivity business & financial analysis
 */
export const EXCEL_TEMPLATES = [
  {
    id: 'financial_budget',
    title: 'Financial Budget & Operating Model',
    description: '12-month revenue, expense categories, profit margins, and net income forecast.',
    headers: ['Quarter', 'Revenue ($)', 'Cost of Goods ($)', 'Operating Expenses ($)', 'Net Profit ($)', 'Margin %'],
    rows: [
      ['Q1 2026', 125000, 38000, 42000, 45000, '36.0%'],
      ['Q2 2026', 148000, 44000, 46000, 58000, '39.2%'],
      ['Q3 2026', 172000, 52000, 50000, 70000, '40.7%'],
      ['Q4 2026', 210000, 61000, 56000, 93000, '44.3%'],
      ['Total', 655000, 195000, 194000, 266000, '40.6%'],
    ],
  },
  {
    id: 'sales_pipeline',
    title: 'B2B Sales Pipeline & Deal Tracker',
    description: 'Client leads, expected contract values, win probability, and weighted forecast.',
    headers: ['Account Name', 'Lead Owner', 'Stage', 'Deal Value ($)', 'Probability', 'Weighted Value ($)'],
    rows: [
      ['Apex Cloud Dynamics', 'Sarah Jenkins', 'Negotiation', 85000, '80%', 68000],
      ['Global Meridian Logistics', 'David Chen', 'Proposal Sent', 120000, '60%', 72000],
      ['NovaHealth Systems', 'Elena Rostova', 'Discovery', 45000, '30%', 13500],
      ['Quantum Financial Corp', 'Sarah Jenkins', 'Contract Review', 210000, '90%', 189000],
      ['Vanguard Media Group', 'David Chen', 'Qualified', 35000, '40%', 14000],
    ],
  },
  {
    id: 'project_tracker',
    title: 'Engineering Milestone & Sprint Plan',
    description: 'Feature workstreams, assignees, effort estimates, and delivery status.',
    headers: ['Milestone / Epic', 'Workstream', 'Owner', 'Story Points', 'Status', 'Due Date'],
    rows: [
      ['OAuth Workspace Integration', 'Platform & Cloud', 'Dhanvin K.', 13, 'Completed', '2026-11-08'],
      ['Excel .xlsx Engine & Editor', 'Core App Suite', 'Engineering Team', 8, 'Active', '2026-11-10'],
      ['Multi-Tab Presentation Engine', 'Frontend Architecture', 'UI Lead', 5, 'In Review', '2026-11-12'],
      ['Real-Time Collaboration Sync', 'Realtime Services', 'Backend Team', 8, 'Planned', '2026-11-15'],
      ['Mobile Viewport Optimization', 'Design & Polish', 'Mobile Team', 5, 'Active', '2026-11-18'],
    ],
  },
];
