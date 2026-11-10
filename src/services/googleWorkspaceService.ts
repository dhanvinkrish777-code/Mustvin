/**
 * Google Workspace API Client Service
 * Covers Google Docs, Google Sheets, Google Slides, Gmail, and Google Drive.
 * All requests use Bearer Authorization with client-side access tokens from Firebase Auth.
 */

export interface WorkspaceFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  iconLink?: string;
}

export interface GoogleDocContent {
  id: string;
  title: string;
  bodyText: string;
  webViewLink?: string;
}

export interface GoogleSheetContent {
  id: string;
  title: string;
  sheets: Array<{ title: string; sheetId: number }>;
  values: any[][];
  webViewLink?: string;
}

export interface GoogleSlideItem {
  objectId: string;
  title: string;
  content: string[];
}

export interface GooglePresentationContent {
  id: string;
  title: string;
  slides: GoogleSlideItem[];
  webViewLink?: string;
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  to: string;
  isUnread: boolean;
}

export interface GmailMessageDetail extends GmailMessageSummary {
  bodyText: string;
}

// ---------------- Google Drive Helpers ----------------

export async function listDriveFiles(
  token: string,
  query?: string,
  pageSize = 20
): Promise<WorkspaceFileItem[]> {
  const qParts = ['trashed = false'];
  if (query) {
    qParts.push(query);
  }
  const qStr = encodeURIComponent(qParts.join(' and '));
  const url = `https://www.googleapis.com/drive/v3/files?q=${qStr}&fields=files(id,name,mimeType,modifiedTime,webViewLink,iconLink)&orderBy=modifiedTime desc&pageSize=${pageSize}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to list files (${res.status})`);
  }

  const data = await res.json();
  return data.files || [];
}

// ---------------- Google Docs API ----------------

export async function listGoogleDocs(token: string): Promise<WorkspaceFileItem[]> {
  return listDriveFiles(token, "mimeType = 'application/vnd.google-apps.document'");
}

export async function getGoogleDoc(token: string, documentId: string): Promise<GoogleDocContent> {
  const url = `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to read document (${res.status})`);
  }

  const doc = await res.json();
  let text = '';

  const extractTextFromElement = (element: any) => {
    if (element.textRun && element.textRun.content) {
      text += element.textRun.content;
    }
  };

  for (const structuralElement of doc.body?.content || []) {
    if (structuralElement.paragraph) {
      for (const el of structuralElement.paragraph.elements || []) {
        extractTextFromElement(el);
      }
    } else if (structuralElement.table) {
      for (const row of structuralElement.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          for (const cellElement of cell.content || []) {
            if (cellElement.paragraph) {
              for (const el of cellElement.paragraph.elements || []) {
                extractTextFromElement(el);
              }
            }
          }
          text += '\t';
        }
        text += '\n';
      }
    }
  }

  return {
    id: doc.documentId,
    title: doc.title,
    bodyText: text.trim(),
    webViewLink: `https://docs.google.com/document/d/${doc.documentId}/edit`,
  };
}

export async function createGoogleDoc(
  token: string,
  title: string,
  initialContent?: string
): Promise<GoogleDocContent> {
  // Step 1: Create Document
  const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to create document (${createRes.status})`);
  }

  const doc = await createRes.json();
  const documentId = doc.documentId;

  // Step 2: Insert Initial Content if provided
  if (initialContent && initialContent.trim()) {
    await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: initialContent,
            },
          },
        ],
      }),
    });
  }

  return {
    id: documentId,
    title: doc.title || title,
    bodyText: initialContent || '',
    webViewLink: `https://docs.google.com/document/d/${documentId}/edit`,
  };
}

export async function appendTextToGoogleDoc(
  token: string,
  documentId: string,
  textToAppend: string
): Promise<void> {
  // Get doc to find the end index
  const docRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!docRes.ok) throw new Error('Failed to retrieve document for appending');
  const docData = await docRes.json();

  const bodyContent = docData.body?.content || [];
  const lastElement = bodyContent[bodyContent.length - 1];
  const endIndex = Math.max(1, (lastElement?.endIndex || 2) - 1);

  const res = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            location: { index: endIndex },
            text: `\n\n${textToAppend}`,
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to append text to Google Doc');
  }
}

export async function replaceGoogleDocContent(
  token: string,
  documentId: string,
  newText: string
): Promise<void> {
  const docRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!docRes.ok) throw new Error('Failed to retrieve document for editing');
  const docData = await docRes.json();
  const bodyContent = docData.body?.content || [];
  const lastElement = bodyContent[bodyContent.length - 1];
  const endIndex = Math.max(1, (lastElement?.endIndex || 2) - 1);

  const requests: any[] = [];
  if (endIndex > 1) {
    requests.push({
      deleteContentRange: {
        range: {
          startIndex: 1,
          endIndex: endIndex,
        },
      },
    });
  }
  requests.push({
    insertText: {
      location: { index: 1 },
      text: newText,
    },
  });

  const res = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to update Google Doc content');
  }
}

// ---------------- Google Sheets API ----------------

export async function listGoogleSheets(token: string): Promise<WorkspaceFileItem[]> {
  return listDriveFiles(token, "mimeType = 'application/vnd.google-apps.spreadsheet'");
}

export async function getGoogleSheet(
  token: string,
  spreadsheetId: string,
  range = 'A1:Z100'
): Promise<GoogleSheetContent> {
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to read spreadsheet metadata');
  }
  const meta = await metaRes.json();

  const sheetNames = (meta.sheets || []).map((s: any) => ({
    title: s.properties?.title || 'Sheet1',
    sheetId: s.properties?.sheetId || 0,
  }));

  const activeSheetTitle = sheetNames[0]?.title || 'Sheet1';
  const effectiveRange = range.includes('!') ? range : `'${activeSheetTitle}'!${range}`;

  const valUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(effectiveRange)}`;

  const valRes = await fetch(valUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  let values: any[][] = [];
  if (valRes.ok) {
    const valData = await valRes.json();
    values = valData.values || [];
  }

  return {
    id: meta.spreadsheetId,
    title: meta.properties?.title || 'Untitled Spreadsheet',
    sheets: sheetNames,
    values,
    webViewLink: `https://docs.google.com/spreadsheets/d/${meta.spreadsheetId}/edit`,
  };
}

export async function createGoogleSheet(
  token: string,
  title: string,
  headers?: string[],
  initialRows?: any[][]
): Promise<GoogleSheetContent> {
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to create spreadsheet (${createRes.status})`);
  }

  const sheet = await createRes.json();
  const spreadsheetId = sheet.spreadsheetId;

  const dataRows: any[][] = [];
  if (headers && headers.length > 0) {
    dataRows.push(headers);
  }
  if (initialRows && initialRows.length > 0) {
    dataRows.push(...initialRows);
  }

  if (dataRows.length > 0) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          range: 'A1',
          values: dataRows,
        }),
      }
    );
  }

  return {
    id: spreadsheetId,
    title,
    sheets: [{ title: 'Sheet1', sheetId: 0 }],
    values: dataRows,
    webViewLink: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

export async function appendGoogleSheetRow(
  token: string,
  spreadsheetId: string,
  rowValues: any[],
  sheetTitle = 'Sheet1'
): Promise<void> {
  const range = `'${sheetTitle}'!A1`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range
    )}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowValues],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to append row to spreadsheet');
  }
}

export async function updateGoogleSheetCell(
  token: string,
  spreadsheetId: string,
  cellRange: string,
  value: any
): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      cellRange
    )}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: cellRange,
        values: [[value]],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to update spreadsheet cell');
  }
}

// ---------------- Google Slides API ----------------

export async function listGoogleSlides(token: string): Promise<WorkspaceFileItem[]> {
  return listDriveFiles(token, "mimeType = 'application/vnd.google-apps.presentation'");
}

export async function getGooglePresentation(
  token: string,
  presentationId: string
): Promise<GooglePresentationContent> {
  const url = `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to read presentation');
  }

  const pData = await res.json();
  const slides: GoogleSlideItem[] = [];

  for (const s of pData.slides || []) {
    let slideTitle = '';
    const contentLines: string[] = [];

    for (const pe of s.pageElements || []) {
      const shape = pe.shape;
      if (shape?.text) {
        let shapeText = '';
        for (const te of shape.text.textElements || []) {
          if (te.textRun?.content) {
            shapeText += te.textRun.content;
          }
        }
        shapeText = shapeText.trim();
        if (shapeText) {
          if (!slideTitle) {
            slideTitle = shapeText;
          } else {
            contentLines.push(shapeText);
          }
        }
      }
    }

    slides.push({
      objectId: s.objectId,
      title: slideTitle || 'Slide',
      content: contentLines,
    });
  }

  return {
    id: pData.presentationId,
    title: pData.title || 'Untitled Presentation',
    slides,
    webViewLink: `https://docs.google.com/presentation/d/${pData.presentationId}/edit`,
  };
}

export interface SlideThemeInput {
  name?: string;
  backgroundColor?: { red: number; green: number; blue: number };
  titleColor?: { red: number; green: number; blue: number };
  bodyColor?: { red: number; green: number; blue: number };
  accentColor?: { red: number; green: number; blue: number };
}

export async function createGooglePresentation(
  token: string,
  title: string,
  slideItems?: Array<{ title: string; bullets: string[]; subtitle?: string }>,
  theme?: SlideThemeInput
): Promise<GooglePresentationContent> {
  // Step 1: Create presentation
  const createRes = await fetch('https://slides.googleapis.com/v1/presentations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to create presentation (${createRes.status})`);
  }

  const presentation = await createRes.json();
  const presentationId = presentation.presentationId;

  // Step 2: Add custom slides with topic-specific background fill and styled typography
  if (slideItems && slideItems.length > 0) {
    const requests: any[] = [];
    const bg = theme?.backgroundColor || { red: 0.04, green: 0.1, blue: 0.18 };
    const titleCol = theme?.titleColor || { red: 0.22, green: 0.74, blue: 0.97 };
    const bodyCol = theme?.bodyColor || { red: 0.89, green: 0.91, blue: 0.95 };
    const accentCol = theme?.accentColor || { red: 0.38, green: 0.92, blue: 0.8 };

    slideItems.forEach((slideData, idx) => {
      const slideId = `slide_gen_${idx}_${Date.now()}`;
      const titleBoxId = `title_box_${idx}_${Date.now()}`;
      const subBoxId = `sub_box_${idx}_${Date.now()}`;
      const bodyBoxId = `body_box_${idx}_${Date.now()}`;

      // 1. Create blank slide
      requests.push({
        createSlide: {
          objectId: slideId,
          insertionIndex: idx + 1,
          slideLayoutReference: { predefinedLayout: 'BLANK' },
        },
      });

      // 2. Set topic-tailored solid background color
      requests.push({
        updatePageProperties: {
          objectId: slideId,
          pageProperties: {
            pageBackgroundFill: {
              solidFill: {
                color: {
                  rgbColor: bg,
                },
              },
            },
          },
          fields: 'pageBackgroundFill',
        },
      });

      // 3. Title Box
      requests.push({
        createShape: {
          objectId: titleBoxId,
          shapeType: 'TEXT_BOX',
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: 600, unit: 'PT' },
              height: { magnitude: 50, unit: 'PT' },
            },
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: 60,
              translateY: 35,
              unit: 'PT',
            },
          },
        },
      });
      requests.push({
        insertText: {
          objectId: titleBoxId,
          text: slideData.title,
        },
      });
      requests.push({
        updateTextStyle: {
          objectId: titleBoxId,
          style: {
            foregroundColor: {
              opaqueColor: {
                rgbColor: titleCol,
              },
            },
            bold: true,
            fontSize: { magnitude: 22, unit: 'PT' },
            fontFamily: 'Trebuchet MS',
          },
          fields: 'foregroundColor,bold,fontSize,fontFamily',
        },
      });

      // 4. Subtitle / Core Insight Box (if provided)
      let bodyTranslateY = 95;
      if (slideData.subtitle) {
        requests.push({
          createShape: {
            objectId: subBoxId,
            shapeType: 'TEXT_BOX',
            elementProperties: {
              pageObjectId: slideId,
              size: {
                width: { magnitude: 600, unit: 'PT' },
                height: { magnitude: 30, unit: 'PT' },
              },
              transform: {
                scaleX: 1,
                scaleY: 1,
                translateX: 60,
                translateY: 88,
                unit: 'PT',
              },
            },
          },
        });
        requests.push({
          insertText: {
            objectId: subBoxId,
            text: slideData.subtitle,
          },
        });
        requests.push({
          updateTextStyle: {
            objectId: subBoxId,
            style: {
              foregroundColor: {
                opaqueColor: {
                  rgbColor: accentCol,
                },
              },
              italic: true,
              fontSize: { magnitude: 12, unit: 'PT' },
              fontFamily: 'Trebuchet MS',
            },
            fields: 'foregroundColor,italic,fontSize,fontFamily',
          },
        });
        bodyTranslateY = 125;
      }

      // 5. Body Box with structured bullet points
      if (slideData.bullets && slideData.bullets.length > 0) {
        requests.push({
          createShape: {
            objectId: bodyBoxId,
            shapeType: 'TEXT_BOX',
            elementProperties: {
              pageObjectId: slideId,
              size: {
                width: { magnitude: 600, unit: 'PT' },
                height: { magnitude: 240, unit: 'PT' },
              },
              transform: {
                scaleX: 1,
                scaleY: 1,
                translateX: 60,
                translateY: bodyTranslateY,
                unit: 'PT',
              },
            },
          },
        });
        const bulletText = slideData.bullets.map((b) => `• ${b}`).join('\n\n');
        requests.push({
          insertText: {
            objectId: bodyBoxId,
            text: bulletText,
          },
        });
        requests.push({
          updateTextStyle: {
            objectId: bodyBoxId,
            style: {
              foregroundColor: {
                opaqueColor: {
                  rgbColor: bodyCol,
                },
              },
              fontSize: { magnitude: 13, unit: 'PT' },
              fontFamily: 'Trebuchet MS',
            },
            fields: 'foregroundColor,fontSize,fontFamily',
          },
        });
      }
    });

    // 6. Delete initial default empty slide so deck starts directly on themed slides
    if (presentation.slides && presentation.slides.length > 0 && presentation.slides[0].objectId) {
      requests.push({
        deleteObject: {
          objectId: presentation.slides[0].objectId,
        },
      });
    }

    if (requests.length > 0) {
      await fetch(`https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      });
    }
  }

  return {
    id: presentationId,
    title,
    slides: (slideItems || []).map((s, i) => ({
      objectId: `slide_${i}`,
      title: s.title,
      content: s.bullets,
    })),
    webViewLink: `https://docs.google.com/presentation/d/${presentationId}/edit`,
  };
}

export async function addSlideToPresentation(
  token: string,
  presentationId: string,
  title: string,
  bullets?: string[],
  subtitleOrTheme?: string | SlideThemeInput,
  themeArg?: SlideThemeInput
): Promise<void> {
  const subtitle = typeof subtitleOrTheme === 'string' ? subtitleOrTheme : undefined;
  const theme = (typeof subtitleOrTheme === 'object' ? subtitleOrTheme : themeArg) as SlideThemeInput | undefined;
  const slideId = `slide_add_${Date.now()}`;
  const titleBoxId = `title_box_${Date.now()}`;
  const subBoxId = `sub_box_${Date.now()}`;
  const bodyBoxId = `body_box_${Date.now()}`;

  const bg = theme?.backgroundColor || { red: 0.04, green: 0.1, blue: 0.18 };
  const titleCol = theme?.titleColor || { red: 0.22, green: 0.74, blue: 0.97 };
  const bodyCol = theme?.bodyColor || { red: 0.89, green: 0.91, blue: 0.95 };
  const accentCol = theme?.accentColor || { red: 0.38, green: 0.92, blue: 0.8 };

  const requests: any[] = [
    {
      createSlide: {
        objectId: slideId,
        slideLayoutReference: { predefinedLayout: 'BLANK' },
      },
    },
    {
      updatePageProperties: {
        objectId: slideId,
        pageProperties: {
          pageBackgroundFill: {
            solidFill: {
              color: {
                rgbColor: bg,
              },
            },
          },
        },
        fields: 'pageBackgroundFill',
      },
    },
    {
      createShape: {
        objectId: titleBoxId,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: slideId,
          size: {
            width: { magnitude: 600, unit: 'PT' },
            height: { magnitude: 50, unit: 'PT' },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: 60,
            translateY: 35,
            unit: 'PT',
          },
        },
      },
    },
    {
      insertText: {
        objectId: titleBoxId,
        text: title,
      },
    },
    {
      updateTextStyle: {
        objectId: titleBoxId,
        style: {
          foregroundColor: {
            opaqueColor: {
              rgbColor: titleCol,
            },
          },
          bold: true,
          fontSize: { magnitude: 22, unit: 'PT' },
          fontFamily: 'Trebuchet MS',
        },
        fields: 'foregroundColor,bold,fontSize,fontFamily',
      },
    },
  ];

  let bodyTranslateY = 95;
  if (subtitle) {
    requests.push(
      {
        createShape: {
          objectId: subBoxId,
          shapeType: 'TEXT_BOX',
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: 600, unit: 'PT' },
              height: { magnitude: 30, unit: 'PT' },
            },
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: 60,
              translateY: 88,
              unit: 'PT',
            },
          },
        },
      },
      {
        insertText: {
          objectId: subBoxId,
          text: subtitle,
        },
      },
      {
        updateTextStyle: {
          objectId: subBoxId,
          style: {
            foregroundColor: {
              opaqueColor: {
                rgbColor: accentCol,
              },
            },
            italic: true,
            fontSize: { magnitude: 12, unit: 'PT' },
            fontFamily: 'Trebuchet MS',
          },
          fields: 'foregroundColor,italic,fontSize,fontFamily',
        },
      }
    );
    bodyTranslateY = 125;
  }

  if (bullets && bullets.length > 0) {
    requests.push(
      {
        createShape: {
          objectId: bodyBoxId,
          shapeType: 'TEXT_BOX',
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: 600, unit: 'PT' },
              height: { magnitude: 240, unit: 'PT' },
            },
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: 60,
              translateY: bodyTranslateY,
              unit: 'PT',
            },
          },
        },
      },
      {
        insertText: {
          objectId: bodyBoxId,
          text: bullets.map((b) => `• ${b}`).join('\n\n'),
        },
      },
      {
        updateTextStyle: {
          objectId: bodyBoxId,
          style: {
            foregroundColor: {
              opaqueColor: {
                rgbColor: bodyCol,
              },
            },
            fontSize: { magnitude: 13, unit: 'PT' },
            fontFamily: 'Trebuchet MS',
          },
          fields: 'foregroundColor,fontSize,fontFamily',
        },
      }
    );
  }

  const res = await fetch(
    `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to add slide to presentation');
  }
}

export async function applyThemeToPresentation(
  token: string,
  presentationId: string,
  theme: SlideThemeInput
): Promise<void> {
  const getUrl = `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}`;
  const getRes = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!getRes.ok) {
    const err = await getRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to inspect presentation');
  }

  const pData = await getRes.json();
  const requests: any[] = [];
  const bg = theme.backgroundColor || { red: 0.04, green: 0.1, blue: 0.18 };
  const titleCol = theme.titleColor || { red: 0.22, green: 0.74, blue: 0.97 };
  const bodyCol = theme.bodyColor || { red: 0.89, green: 0.91, blue: 0.95 };

  for (const slide of pData.slides || []) {
    // 1. Update slide background fill
    requests.push({
      updatePageProperties: {
        objectId: slide.objectId,
        pageProperties: {
          pageBackgroundFill: {
            solidFill: {
              color: { rgbColor: bg },
            },
          },
        },
        fields: 'pageBackgroundFill',
      },
    });

    // 2. Update typography styles for existing shapes
    const shapes = (slide.pageElements || []).filter((pe: any) => pe.shape?.text);
    shapes.forEach((pe: any, idx: number) => {
      const isTitle = idx === 0 || (pe.transform?.translateY && pe.transform.translateY < 120);
      requests.push({
        updateTextStyle: {
          objectId: pe.objectId,
          style: {
            foregroundColor: {
              opaqueColor: {
                rgbColor: isTitle ? titleCol : bodyCol,
              },
            },
            fontFamily: 'Trebuchet MS',
            bold: isTitle,
          },
          fields: 'foregroundColor,fontFamily,bold',
        },
      });
    });
  }

  if (requests.length === 0) return;

  const res = await fetch(
    `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to apply theme to presentation');
  }
}

// ---------------- Gmail API ----------------

export async function listGmailMessages(
  token: string,
  searchQuery?: string,
  maxResults = 12
): Promise<GmailMessageSummary[]> {
  const qStr = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}${qStr}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to list emails');
  }

  const data = await res.json();
  const rawList = data.messages || [];

  // Fetch headers for each message concurrently
  const summaries = await Promise.all(
    rawList.slice(0, maxResults).map(async (item: any) => {
      try {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date&metadataHeaders=To`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!detailRes.ok) return null;
        const detail = await detailRes.json();
        const headers: Record<string, string> = {};
        for (const h of detail.payload?.headers || []) {
          headers[h.name.toLowerCase()] = h.value;
        }

        return {
          id: detail.id,
          threadId: detail.threadId,
          snippet: detail.snippet || '',
          subject: headers['subject'] || '(No Subject)',
          from: headers['from'] || 'Unknown Sender',
          to: headers['to'] || 'Me',
          date: headers['date'] ? new Date(headers['date']).toLocaleDateString() : '',
          isUnread: Boolean(detail.labelIds?.includes('UNREAD')),
        };
      } catch {
        return null;
      }
    })
  );

  return summaries.filter((s): s is GmailMessageSummary => s !== null);
}

export async function getGmailMessageDetail(
  token: string,
  messageId: string
): Promise<GmailMessageDetail> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
    messageId
  )}?format=full`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to get email details');
  }

  const detail = await res.json();
  const headers: Record<string, string> = {};
  for (const h of detail.payload?.headers || []) {
    headers[h.name.toLowerCase()] = h.value;
  }

  let body = '';
  const decodeBase64 = (b64: string) => {
    try {
      const clean = b64.replace(/-/g, '+').replace(/_/g, '/');
      return decodeURIComponent(escape(atob(clean)));
    } catch {
      return '';
    }
  };

  const traverseParts = (parts: any[]) => {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        body += decodeBase64(part.body.data);
      } else if (part.parts) {
        traverseParts(part.parts);
      }
    }
  };

  if (detail.payload?.body?.data) {
    body = decodeBase64(detail.payload.body.data);
  } else if (detail.payload?.parts) {
    traverseParts(detail.payload.parts);
  }

  return {
    id: detail.id,
    threadId: detail.threadId,
    snippet: detail.snippet || '',
    subject: headers['subject'] || '(No Subject)',
    from: headers['from'] || 'Unknown Sender',
    to: headers['to'] || 'Me',
    date: headers['date'] || '',
    isUnread: Boolean(detail.labelIds?.includes('UNREAD')),
    bodyText: body.trim() || detail.snippet || '',
  };
}

function makeRfc822Email(to: string, subject: string, messageText: string): string {
  const emailLines = [
    `To: ${to}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    '',
    messageText,
  ];
  const email = emailLines.join('\r\n');
  return btoa(unescape(encodeURIComponent(email)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function createGmailDraft(
  token: string,
  to: string,
  subject: string,
  bodyText: string
): Promise<{ draftId: string }> {
  const raw = makeRfc822Email(to, subject, bodyText);
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: { raw },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to save email draft');
  }

  const data = await res.json();
  return { draftId: data.id };
}

export async function sendGmailMessage(
  token: string,
  to: string,
  subject: string,
  bodyText: string
): Promise<{ messageId: string }> {
  const raw = makeRfc822Email(to, subject, bodyText);
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to send email');
  }

  const data = await res.json();
  return { messageId: data.id };
}

// ---------------- Google Drive File Upload (Supports Excel .xlsx to Drive) ----------------

export async function uploadFileToGoogleDrive(
  token: string,
  fileName: string,
  mimeType: string,
  blobContent: Blob
): Promise<WorkspaceFileItem> {
  const metadata = {
    name: fileName,
    mimeType: mimeType,
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blobContent);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to upload file to Google Drive');
  }

  return await res.json();
}
