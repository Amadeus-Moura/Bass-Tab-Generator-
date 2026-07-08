import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { db } from '../src/infrastructure/database/db';
import {
  songs, audioFiles, processingJobs, tablatures, measures,
  type MeasureEvent,
} from '../src/infrastructure/database/schema';
import { processMidi } from './pipeline';

const app  = express();
const PORT = Number(process.env.PORT ?? 3001);
const ROOT = path.resolve(__dirname, '..');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const MOCK_USER_ID = process.env.MOCK_USER_ID ?? '00000000-0000-0000-0000-000000000001';

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }));
app.use(express.json());
app.use('/audio', express.static(UPLOADS_DIR));

// ── Multer ────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, `${unique}${path.extname(file.originalname) || '.mp3'}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

// ── Active job store (audio path lives only in-memory during processing) ──────
const activeJobs = new Map<string, { audioPath: string; songId: string }>();

// ────────────────────────────────────────────────────────────────────────────
// POST /api/upload — saves file + creates DB records
// ────────────────────────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('audio'), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: 'Nenhum arquivo enviado.' }); return; }

  const file  = req.file;
  const title = path.basename(file.originalname, path.extname(file.originalname));

  const [song] = await db.insert(songs).values({
    userId:           MOCK_USER_ID,
    title,
    originalFilename: file.filename,
  }).returning();

  await db.insert(audioFiles).values({
    songId:        song.id,
    storagePath:   file.filename,
    fileSizeBytes: file.size,
    mimeType:      file.mimetype,
  });

  const [job] = await db.insert(processingJobs).values({ songId: song.id }).returning();

  activeJobs.set(job.id, { audioPath: file.path, songId: song.id });

  res.json({ jobId: job.id, songId: song.id, audioUrl: `/audio/${file.filename}` });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/process/:jobId — SSE progress stream + persists results
// ────────────────────────────────────────────────────────────────────────────
app.get('/api/process/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const jobInfo   = activeJobs.get(jobId);

  if (!jobInfo) { res.status(404).json({ error: 'Job não encontrado ou sessão expirada.' }); return; }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const updateJob = async (stage: string, message: string, progress: number) => {
    const entry = { ts: new Date().toISOString(), stage, message, progress };
    await db.update(processingJobs)
      .set({
        progressPct:  progress,
        currentStage: stage,
        logEntries:   sql`${processingJobs.logEntries} || ${JSON.stringify([entry])}::jsonb`,
      })
      .where(eq(processingJobs.id, jobId));
  };

  await db.update(processingJobs).set({ status: 'running' }).where(eq(processingJobs.id, jobId));

  try {
    send({ stage: 'start', message: 'Iniciando pipeline…', progress: 3 });
    await updateJob('start', 'Iniciando pipeline…', 3);

    await runPython(jobInfo.audioPath, async (data: { stage: string; message: string; progress: number }) => {
      send(data);
      await updateJob(data.stage, data.message, data.progress);
    });

    send({ stage: 'mapping', message: 'Mapeando notas no braço…', progress: 88 });
    await updateJob('mapping', 'Mapeando notas no braço…', 88);

    const tabJson = await processMidi(path.join(ROOT, 'test.mid'));

    send({ stage: 'saving', message: 'Salvando tablatura no banco…', progress: 95 });

    // Persist tablature
    const [tab] = await db.insert(tablatures).values({
      songId:       jobInfo.songId,
      jobId,
      tuning:       tabJson.meta.tuning,
      stringCount:  tabJson.meta.stringCount,
      fretCount:    tabJson.meta.fretCount,
      bpm:          tabJson.meta.bpm,
      totalNotes:   tabJson.meta.totalNotes,
      totalMeasures: tabJson.meta.totalMeasures,
    }).returning();

    // Batch insert measures
    await db.insert(measures).values(
      tabJson.measures.map((m) => ({
        tablatureId:   tab.id,
        measureNumber: m.measureNumber,
        startTime:     m.startTime,
        duration:      m.duration,
        noteCount:     m.events.filter((e) => e.type === 'note').length,
        restCount:     m.events.filter((e) => e.type === 'rest').length,
        events: m.events as unknown as MeasureEvent[],
      })),
    );

    await db.update(processingJobs)
      .set({ status: 'done', completedAt: new Date() })
      .where(eq(processingJobs.id, jobId));

    send({ stage: 'done', message: 'Tablatura pronta! 🎸', progress: 100, tabJson });
  } catch (err) {
    console.error('[server] Pipeline error:', err);
    await db.update(processingJobs)
      .set({ status: 'error', errorMessage: String(err) })
      .where(eq(processingJobs.id, jobId));
    send({ stage: 'error', message: String(err) });
  } finally {
    activeJobs.delete(jobId);
    res.end();
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/library — returns all saved songs with latest tablature metadata
// ────────────────────────────────────────────────────────────────────────────
app.get('/api/library', async (_req, res) => {
  const rows = await db
    .select({
      songId:        songs.id,
      title:         songs.title,
      artist:        songs.artist,
      originalFilename: songs.originalFilename,
      createdAt:     songs.createdAt,
      bpm:           tablatures.bpm,
      totalNotes:    tablatures.totalNotes,
      totalMeasures: tablatures.totalMeasures,
      tuning:        tablatures.tuning,
      tabId:         tablatures.id,
    })
    .from(songs)
    .leftJoin(
      tablatures,
      and(eq(tablatures.songId, songs.id), eq(tablatures.isLatest, true)),
    )
    .where(eq(songs.userId, MOCK_USER_ID))
    .orderBy(desc(songs.createdAt));

  res.json(rows);
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/songs/:songId/tablature — loads full tab from DB
// ────────────────────────────────────────────────────────────────────────────
app.get('/api/songs/:songId/tablature', async (req, res) => {
  const { songId } = req.params;

  const [songRow] = await db
    .select({ title: songs.title, storagePath: audioFiles.storagePath })
    .from(songs)
    .leftJoin(audioFiles, eq(audioFiles.songId, songs.id))
    .where(eq(songs.id, songId))
    .limit(1);

  if (!songRow) { res.status(404).json({ error: 'Música não encontrada.' }); return; }

  const [tab] = await db
    .select()
    .from(tablatures)
    .where(and(eq(tablatures.songId, songId), eq(tablatures.isLatest, true)))
    .limit(1);

  if (!tab) { res.status(404).json({ error: 'Tablatura não encontrada.' }); return; }

  const measureRows = await db
    .select()
    .from(measures)
    .where(eq(measures.tablatureId, tab.id))
    .orderBy(asc(measures.measureNumber));

  res.json({
    title:    songRow.title,
    audioUrl: `/audio/${songRow.storagePath}`,
    tabJson: {
      meta: {
        tuning:        tab.tuning,
        stringCount:   tab.stringCount,
        fretCount:     tab.fretCount,
        bpm:           tab.bpm,
        totalNotes:    tab.totalNotes,
        totalMeasures: tab.totalMeasures,
      },
      measures: measureRows.map((m) => ({
        measureNumber: m.measureNumber,
        startTime:     m.startTime,
        duration:      m.duration,
        events:        m.events,
      })),
    },
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function runPython(
  audioPath: string,
  onProgress: (data: { stage: string; message: string; progress: number }) => Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const venvPython = path.join(ROOT, '.venv', 'Scripts', 'python.exe');
    const pythonBin  = fs.existsSync(venvPython) ? venvPython : 'python';
    const proc = spawn(pythonBin, [path.join(ROOT, 'bass_extractor.py'), audioPath], { cwd: ROOT });

    let lastProgress = 8;
    void onProgress({ stage: 'separating', message: 'Separando frequências com Demucs…', progress: 8 });

    const parse = (raw: string) => {
      for (const line of raw.split('\n')) {
        if (line.includes('Source separation') && lastProgress < 12) {
          lastProgress = 12;
          void onProgress({ stage: 'separating', message: 'Demucs carregado, separando trilhas…', progress: 12 });
        } else if (line.includes('Running Demucs') && lastProgress < 15) {
          lastProgress = 15;
          void onProgress({ stage: 'demucs', message: 'Demucs processando (~30s)…', progress: 15 });
        } else if (line.match(/\d+%/) && lastProgress < 50) {
          lastProgress = Math.min(50, lastProgress + 4);
          void onProgress({ stage: 'demucs', message: 'Separação em progresso…', progress: lastProgress });
        } else if (line.includes('Bass stem isolated') && lastProgress < 55) {
          lastProgress = 55;
          void onProgress({ stage: 'transcribing', message: 'Baixo isolado! Transcrevendo com Basic Pitch…', progress: 55 });
        } else if (line.includes('Transcribed') && lastProgress < 80) {
          lastProgress = 80;
          const n = line.match(/(\d+)\s+note/)?.[1] ?? '?';
          void onProgress({ stage: 'transcribed', message: `${n} eventos transcritos. Gerando MIDI…`, progress: 80 });
        } else if (line.includes('MIDI saved') && lastProgress < 85) {
          lastProgress = 85;
          void onProgress({ stage: 'midi_done', message: 'MIDI gerado com sucesso!', progress: 85 });
        }
      }
    };

    proc.stdout.on('data', (d: Buffer) => parse(d.toString()));
    proc.stderr.on('data',  (d: Buffer) => parse(d.toString()));
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`bass_extractor.py saiu com código ${code}`)));
    proc.on('error', reject);
  });
}

app.listen(PORT, () => console.log(`🎸  Bass Tab API → http://localhost:${PORT}`));
