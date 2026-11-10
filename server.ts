import 'dotenv/config';
import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import multer from 'multer';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  createLiveVoiceBridge,
  jarvisChat,
  jarvisChatStream,
  jarvisGenerateSpeech,
  jarvisMeasureObject,
  jarvisTranscribeAudio,
  uploadLargeFileToGemini,
} from './server/geminiService.ts';
import { generateOrModifyImage } from './server/visualStudio.ts';
import { generateJarvisMusic } from './server/musicService.ts';
import { registerScienceProxyRoutes } from './server/scienceProxy.ts';
import {
  generateAiPresentation,
  generateAiDocument,
  editAiDocument,
  generateAiSpreadsheet,
  editAiSpreadsheet,
  generateAiEmail,
  analyzeThemeForTopic,
} from './server/workspaceAiService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: 250 * 1024 * 1024, // Up to 250MB large file uploads
  },
});

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const port = Number(process.env.PORT) || 3000;

  // Allow up to 65MB JSON payloads for up to 15 compressed photos or audio recordings
  app.use(express.json({ limit: '65mb' }));

  // Health / status endpoint
  app.get('/api/jarvis/status', (_req, res) => {
    res.json({
      status: 'online',
      system: 'Jarvis 2.5 Multimodal & Bioscience Hub',
      version: '2.5.0',
      models: {
        complex: 'gemini-4-argon',
        general: 'gemini-3.8-flash',
        fast: 'gemini-3.1-flash-lite',
        image: 'gemini-nano-banana-2.1',
        musicClip: 'lyria-3-clip-preview',
        musicPro: 'lyria-3-pro-preview',
        live: 'gemini-3.8-live',
        transcribe: 'gemini-3.5-transcribe',
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Register Science Skill CORS proxy routes (arXiv, dbSNP, JASPAR, UniBind)
  registerScienceProxyRoutes(app);

  // Google AI Mode Location Resolution (GPS reverse-geocoding + client IP fallback with 30m cache)
  const reverseGeoCache = new Map<
    string,
    { latitude: number; longitude: number; label: string; source: 'gps' | 'ip'; expiresAt: number }
  >();

  app.get('/api/jarvis/location', async (req, res) => {
    try {
      const latParam = req.query.lat !== undefined ? Number(req.query.lat) : NaN;
      const lngParam = req.query.lng !== undefined ? Number(req.query.lng) : NaN;

      if (Number.isFinite(latParam) && Number.isFinite(lngParam)) {
        const roundedKey = `gps:${latParam.toFixed(3)},${lngParam.toFixed(3)}`;
        const cached = reverseGeoCache.get(roundedKey);
        if (cached && cached.expiresAt > Date.now()) {
          res.json(cached);
          return;
        }

        let label = `${latParam.toFixed(3)}, ${lngParam.toFixed(3)}`;
        try {
          const nomRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
              String(latParam)
            )}&lon=${encodeURIComponent(String(lngParam))}&zoom=12&accept-language=en`,
            {
              headers: {
                'User-Agent': 'Jarvis2GoogleAiMode/2.3 (https://aistudio.google.com)',
              },
              signal: AbortSignal.timeout(3500),
            }
          );
          if (nomRes.ok) {
            const nomJson: any = await nomRes.json();
            const addr = nomJson?.address || {};
            const locality =
              addr.suburb ||
              addr.neighbourhood ||
              addr.city ||
              addr.town ||
              addr.village ||
              addr.county ||
              '';
            const city = addr.city || addr.town || addr.state_district || '';
            const state = addr.state || '';
            const country = addr.country || '';
            const parts = Array.from(
              new Set([locality, city, state, country].map((s) => String(s || '').trim()).filter(Boolean))
            );
            if (parts.length > 0) {
              label = parts.slice(0, 3).join(', ');
            }
          }
        } catch {}

        const payload = {
          latitude: latParam,
          longitude: lngParam,
          label,
          source: 'gps' as const,
          expiresAt: Date.now() + 30 * 60 * 1000,
        };
        reverseGeoCache.set(roundedKey, payload);
        res.json(payload);
        return;
      }

      // Approximate IP-based location fallback (mirrors Google Search / AI Mode "From your IP address")
      const forwardedFor = String(req.headers['x-forwarded-for'] || '')
        .split(',')[0]
        .trim();
      const clientIp =
        forwardedFor && !forwardedFor.startsWith('127.') && !forwardedFor.startsWith('10.') && forwardedFor !== '::1'
          ? forwardedFor
          : '';
      const ipKey = `ip:${clientIp || 'default'}`;
      const cachedIp = reverseGeoCache.get(ipKey);
      if (cachedIp && cachedIp.expiresAt > Date.now()) {
        res.json(cachedIp);
        return;
      }

      const ipEndpoint = clientIp ? `https://ipwho.is/${encodeURIComponent(clientIp)}` : 'https://ipwho.is/';
      const ipRes = await fetch(ipEndpoint, {
        headers: { 'User-Agent': 'Jarvis2GoogleAiMode/2.3' },
        signal: AbortSignal.timeout(3000),
      });
      if (ipRes.ok) {
        const ipData: any = await ipRes.json();
        if (ipData && ipData.success !== false && Number.isFinite(Number(ipData.latitude))) {
          const parts = [ipData.city, ipData.region, ipData.country]
            .map((p) => String(p || '').trim())
            .filter(Boolean);
          const payload = {
            latitude: Number(ipData.latitude),
            longitude: Number(ipData.longitude),
            label: parts.join(', ') || 'Approximate location',
            source: 'ip' as const,
            expiresAt: Date.now() + 30 * 60 * 1000,
          };
          reverseGeoCache.set(ipKey, payload);
          res.json(payload);
          return;
        }
      }

      res.status(204).end();
    } catch {
      res.status(204).end();
    }
  });

  // Large File Upload endpoint -> Gemini Files API
  app.post('/api/jarvis/files/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file attached.' });
        return;
      }

      const uploaded = await uploadLargeFileToGemini(
        req.file.path,
        req.file.mimetype || 'application/octet-stream',
        req.file.originalname || 'uploaded-file'
      );

      res.json({
        uri: uploaded.uri,
        mimeType: uploaded.mimeType,
        name: uploaded.name,
        size: req.file.size,
      });
    } catch (error: any) {
      res.status(500).json({
        error: error?.message || 'Unable to process large file upload.',
      });
    }
  });

  // Image Creation & Editing endpoint (`gemini-nano-banana-2.1`)
  app.post('/api/jarvis/image', async (req, res) => {
    try {
      const {
        prompt,
        sourceImageBase64,
        sourceMimeType,
        aspectRatio,
        imageSize,
        useImageSearch,
      } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        res
          .status(400)
          .json({ error: 'Please provide an image description or modification prompt.' });
        return;
      }
      const result = await generateOrModifyImage({
        prompt,
        sourceImageBase64,
        sourceMimeType,
        aspectRatio,
        imageSize,
        useImageSearch: Boolean(useImageSearch),
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        error: error?.message || 'Image generation failed.',
      });
    }
  });

  // Music Generation endpoint (`lyria-3-clip-preview` & `lyria-3-pro-preview`)
  app.post('/api/jarvis/music', async (req, res) => {
    try {
      const { prompt, model, imageBase64, imageMimeType } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Please provide a music prompt.' });
        return;
      }
      const music = await generateJarvisMusic({
        prompt,
        model: model === 'lyria-3-pro-preview' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview',
        imageBase64,
        imageMimeType,
      });
      res.json(music);
    } catch (error: any) {
      res.status(500).json({
        error: error?.message || 'Music generation failed.',
      });
    }
  });

  // Audio Transcription endpoint (`gemini-3.5-transcribe`)
  app.post('/api/jarvis/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType, language } = req.body || {};
      if (!audioBase64 || typeof audioBase64 !== 'string') {
        res.status(400).json({ error: 'Please provide recorded audio data.' });
        return;
      }
      const result = await jarvisTranscribeAudio({
        audioBase64,
        mimeType,
        language,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        error: error?.message || 'Audio transcription failed.',
      });
    }
  });

  // AI Voice Text-to-Speech endpoint (`gemini-3.8-flash-lite-tts`)
  app.post('/api/jarvis/tts', async (req, res) => {
    try {
      const { text, voiceName, language } = req.body || {};
      const audio = await jarvisGenerateSpeech(
        text || '',
        voiceName || 'Puck',
        language || 'English'
      );
      if (!audio) {
        res.status(204).end();
        return;
      }
      res.json(audio);
    } catch {
      res.status(204).end();
    }
  });

  // Google Workspace & Microsoft Excel AI Copilot Endpoint
  app.post('/api/jarvis/workspace/ai-copilot', async (req, res) => {
    try {
      const { action, topic, slideCount, currentText, instruction, headers, rows, docType } =
        req.body || {};

      if (action === 'generate_presentation') {
        const pres = await generateAiPresentation(topic || 'AI Innovation', Number(slideCount) || 5);
        res.json(pres);
        return;
      }

      if (action === 'generate_doc') {
        const doc = await generateAiDocument(topic || 'Project Plan', docType || 'proposal');
        res.json(doc);
        return;
      }

      if (action === 'edit_doc') {
        const editRes = await editAiDocument(currentText || '', instruction || 'Improve document clarity');
        res.json(editRes);
        return;
      }

      if (action === 'generate_sheet') {
        const sheet = await generateAiSpreadsheet(topic || 'Operations Tracker');
        res.json(sheet);
        return;
      }

      if (action === 'edit_sheet') {
        const editRes = await editAiSpreadsheet(headers || [], rows || [], instruction || 'Add summary rows');
        res.json(editRes);
        return;
      }

      if (action === 'generate_email') {
        const { prompt: emailPrompt, recipient } = req.body || {};
        const email = await generateAiEmail(emailPrompt || topic || 'Project Update', recipient);
        res.json(email);
        return;
      }

      if (action === 'analyze_theme') {
        const theme = await analyzeThemeForTopic(topic || 'Deep Learning & Systems Architecture');
        res.json(theme);
        return;
      }

      res.status(400).json({ error: `Unknown action: ${action}` });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Workspace AI copilot failed' });
    }
  });

  // IP & Network Configuration Endpoint for 10m Radar
  app.get('/api/jarvis/network-config', (req, res) => {
    try {
      const forwarded = req.headers['x-forwarded-for'];
      const clientIp =
        typeof forwarded === 'string'
          ? forwarded.split(',')[0].trim()
          : req.socket.remoteAddress || '127.0.0.1';

      const osNetInterfaces = os.networkInterfaces();
      let localIp = '192.168.1.105';
      let mac = 'F0:2F:74:9C:12:44';
      let netmask = '255.255.255.0';

      for (const [, ifaceDetails] of Object.entries(osNetInterfaces)) {
        if (ifaceDetails) {
          for (const item of ifaceDetails) {
            if (!item.internal && item.family === 'IPv4') {
              localIp = item.address;
              mac = item.mac;
              netmask = item.netmask;
              break;
            }
          }
        }
      }

      res.json({
        clientIp,
        localIp,
        mac,
        netmask,
        gateway: localIp.replace(/\.\d+$/, '.1'),
        dns: ['8.8.8.8', '1.1.1.1'],
        hostname: os.hostname(),
        platform: os.platform(),
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to get network config' });
    }
  });

  // Real-time Server-Sent Events (SSE) Streaming Chat + Google AI Mode endpoint
  app.post('/api/jarvis/chat/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sendEvent = (payload: Record<string, unknown>) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    try {
      const {
        prompt,
        history,
        customInstruction,
        rolePersona,
        modelTier,
        language,
        photos,
        largeFiles,
        lastImageDataUrl,
        lastImageMimeType,
        forceModifyImage,
        imageAspectRatio,
        imageSize,
        groundingPreference,
        userLocation,
      } = req.body || {};

      const result = await jarvisChatStream(
        {
          prompt: prompt || '',
          history: history || [],
          customInstruction,
          rolePersona,
          modelTier,
          language,
          photos: Array.isArray(photos) ? photos.slice(0, 15) : [],
          largeFiles: Array.isArray(largeFiles) ? largeFiles : [],
          lastImageDataUrl,
          lastImageMimeType,
          forceModifyImage: Boolean(forceModifyImage),
          imageAspectRatio,
          imageSize,
          groundingPreference,
          userLocation,
        },
        [],
        (delta) => {
          sendEvent({ type: 'chunk', delta });
        }
      );

      sendEvent({
        type: 'done',
        text: result.text,
        sources: result.sources,
        searchQueries: result.searchQueries,
        followUpQuestions: result.followUpQuestions,
        modelUsed: result.modelUsed,
        aiMode: result.aiMode,
        generatedImage: result.generatedImage,
        generatedMusic: result.generatedMusic,
      });
      res.end();
    } catch (error: any) {
      const message = error?.message || 'Chat generation failed';
      const isQuota =
        String(message).toLowerCase().includes('quota') || String(message).includes('429');
      sendEvent({
        type: 'error',
        code: isQuota ? 'RATE_LIMIT' : 'STREAM_ERROR',
        error: message,
      });
      res.end();
    }
  });

  // Standard JSON Chat endpoint (fallback / compatibility)
  app.post('/api/jarvis/chat', async (req, res) => {
    try {
      const {
        prompt,
        history,
        customInstruction,
        rolePersona,
        modelTier,
        language,
        photos,
        largeFiles,
        lastImageDataUrl,
        lastImageMimeType,
        forceModifyImage,
        imageAspectRatio,
        imageSize,
        groundingPreference,
        userLocation,
      } = req.body || {};

      const result = await jarvisChat({
        prompt: prompt || '',
        history: history || [],
        customInstruction,
        rolePersona,
        modelTier,
        language,
        photos: Array.isArray(photos) ? photos.slice(0, 15) : [],
        largeFiles: Array.isArray(largeFiles) ? largeFiles : [],
        lastImageDataUrl,
        lastImageMimeType,
        forceModifyImage: Boolean(forceModifyImage),
        imageAspectRatio,
        imageSize,
        groundingPreference,
        userLocation,
      });
      res.json(result);
    } catch (error: any) {
      const message = error?.message || 'Chat generation failed';
      const isQuota =
        String(message).toLowerCase().includes('quota') || String(message).includes('429');
      res.status(isQuota ? 429 : 500).json({
        code: isQuota ? 'RATE_LIMIT' : 'CHAT_ERROR',
        error: message,
      });
    }
  });

  // Fast 3D Dimension Measurement endpoint
  app.post('/api/jarvis/measure', async (req, res) => {
    try {
      const { imageBase64, mimeType, userContextPrompt } = req.body || {};
      const result = await jarvisMeasureObject(imageBase64 || '', mimeType, userContextPrompt);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        error: error?.message || 'Measurement failed',
      });
    }
  });

  // Gemini Live API Real-Time Voice Conversation WebSocket Bridge (`/ws/live`)
  const liveWss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const reqUrl = request.url || '';
    if (reqUrl.startsWith('/ws/live')) {
      liveWss.handleUpgrade(request, socket, head, (ws) => {
        liveWss.emit('connection', ws, request);
      });
    }
  });

  liveWss.on('connection', async (clientWs, request) => {
    const urlObj = new URL(
      request.url || '/ws/live',
      `http://${request.headers.host || 'localhost'}`
    );
    const voiceName = urlObj.searchParams.get('voice') || 'Puck';
    const language = urlObj.searchParams.get('lang') || 'English';
    const latRaw = urlObj.searchParams.get('lat');
    const lngRaw = urlObj.searchParams.get('lng');
    const locationLabel = urlObj.searchParams.get('loc') || '';
    const timeZone = urlObj.searchParams.get('tz') || '';
    const parsedLat = latRaw !== null ? Number(latRaw) : NaN;
    const parsedLng = lngRaw !== null ? Number(lngRaw) : NaN;

    const sendSafe = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === clientWs.OPEN) {
        try {
          clientWs.send(JSON.stringify(payload));
        } catch {}
      }
    };

    if (!process.env.GEMINI_API_KEY) {
      sendSafe({ type: 'error', error: 'Live voice service unavailable.' });
      clientWs.close();
      return;
    }

    let sessionPromise: Promise<any> | null = null;
    try {
      sessionPromise = createLiveVoiceBridge({
        voiceName,
        language,
        userLocation:
          Number.isFinite(parsedLat) && Number.isFinite(parsedLng)
            ? {
                latitude: parsedLat,
                longitude: parsedLng,
                label: locationLabel || undefined,
                timeZone: timeZone || undefined,
              }
            : locationLabel
            ? { label: locationLabel, timeZone: timeZone || undefined }
            : undefined,
        sendToClient: sendSafe,
      });
      await sessionPromise;
    } catch (err: any) {
      sendSafe({
        type: 'error',
        error: err?.message || 'Unable to initialize live voice session.',
      });
      clientWs.close();
      return;
    }

    clientWs.on('message', (raw) => {
      if (!sessionPromise) return;
      try {
        const msg = JSON.parse(raw.toString());
        sessionPromise
          .then((session) => {
            if (msg.audio) {
              session.sendRealtimeInput({
                audio: {
                  data: msg.audio,
                  mimeType: 'audio/pcm;rate=16000',
                },
              });
            } else if (msg.video) {
              session.sendRealtimeInput({
                video: {
                  data: msg.video,
                  mimeType: msg.mimeType || 'image/jpeg',
                },
              });
            } else if (msg.text) {
              session.sendRealtimeInput({
                text: String(msg.text),
              });
            }
          })
          .catch(() => {});
      } catch {}
    });

    clientWs.on('close', () => {
      if (sessionPromise) {
        sessionPromise
          .then((session) => {
            try {
              session.close();
            } catch {}
          })
          .catch(() => {});
      }
    });
  });

  const distPath = path.resolve(__dirname, 'dist');
  const distIndexHtml = path.join(distPath, 'index.html');
  const hasDist = fs.existsSync(distIndexHtml);

  // Serve pre-built static bundle only if dist exists AND we are in production
  const serveStaticDist =
    hasDist &&
    (process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE));

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  if (serveStaticDist) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found.' });
        return;
      }
      res.sendFile(distIndexHtml, (err) => {
        if (err && !res.headersSent) {
          res.status(500).send('Application bundle could not be loaded.');
        }
      });
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: {
          server: httpServer,
        },
        allowedHosts: true,
        ws: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Jarvis 2.5 Server online and listening on http://0.0.0.0:${port}`);
  });
}

startServer();
