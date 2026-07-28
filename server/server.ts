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
  songs, mediaFiles, processingJobs, tablatures, measures,
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

// ── Tipos de intenção do usuário ──────────────────────────────────────────────
type Intent = 'download_video' | 'download_audio' | 'generate_tab';

// ── Multer (uploads locais) ───────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, `${unique}${path.extname(file.originalname) || '.mp3'}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

// ── Active job store (processamento individual) ──────────────────────────────
const activeJobs = new Map<string, {
  audioPath:    string;
  songId:       string;
  intents:      Intent[];
  youtubeUrl?:  string;
  audioQuality?: string;
  videoQuality?: string;
}>();

// ── Playlist job store ────────────────────────────────────────────────────────
const playlistJobs = new Map<string, {
  url:          string;
  downloadType: 'audio' | 'video';
  audioQuality: string;
  videoQuality: string;
  outputDir:    string;
}>();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/upload  — Upload de arquivo local (intenção: generate_tab)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('audio'), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: 'Nenhum arquivo enviado.' }); return; }

  const file  = req.file;
  const title = path.basename(file.originalname, path.extname(file.originalname));

  const [song] = await db.insert(songs).values({
    userId: MOCK_USER_ID,
    title,
    originalFilename: file.filename,
  }).returning();

  const [media] = await db.insert(mediaFiles).values({
    songId:          song.id,
    storagePath:     file.filename,
    fileSizeBytes:   file.size,
    mimeType:        file.mimetype,
    mediaType:       'audio',
    // Upload local → sempre permanente (usuário já tem o arquivo)
    retentionPolicy: 'permanent',
  }).returning();

  const [job] = await db.insert(processingJobs).values({
    songId:      song.id,
    mediaFileId: media.id,
    jobType:     'generate_tab',
  }).returning();

  activeJobs.set(job.id, {
    audioPath: file.path,
    songId:    song.id,
    intents:   ['generate_tab'],
  });

  res.json({ jobId: job.id, songId: song.id, audioUrl: `/audio/${file.filename}` });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/process-url  — Pipeline via URL do YouTube
//
// Body: {
//   url:     string           URL do YouTube
//   intents: Intent[]         ex: ["generate_tab"] ou ["download_audio", "generate_tab"]
// }
//
// Regra de retenção:
//   • Se intents incluir "download_audio" ou "download_video" → permanent
//   • Se intents for EXCLUSIVAMENTE ["generate_tab"]          → temporary
//     (arquivo deletado no bloco finally após salvar a tablatura)
// ─────────────────────────────────────────────────────────────────────────────
// Valores válidos para o campo Intent — usados para sanitizar o body da requisição
const VALID_INTENTS = new Set<Intent>(['download_video', 'download_audio', 'generate_tab']);

app.post('/api/process-url', async (req, res) => {
  const { url, intents, audioQuality, videoQuality } = req.body as {
    url?: string; intents?: unknown[];
    audioQuality?: string; videoQuality?: string;
  };

  if (!url?.trim()) {
    res.status(400).json({ error: 'Campo "url" é obrigatório.' });
    return;
  }

  // Filtra apenas valores válidos — rejeita strings arbitrárias vindas do body
  const sanitized = Array.isArray(intents)
    ? (intents as string[]).filter((i): i is Intent => VALID_INTENTS.has(i as Intent))
    : [];

  const resolvedIntents: Intent[] = sanitized.length > 0
    ? sanitized
    : ['generate_tab'];

  // Determina o tipo de download baseado nas intenções
  const wantsVideo   = resolvedIntents.includes('download_video');
  const wantsAudio   = resolvedIntents.includes('download_audio');
  const wantsTab     = resolvedIntents.includes('generate_tab');
  const downloadType = wantsVideo ? 'video' : 'audio';

  // Define a política de retenção
  const retentionPolicy = (wantsVideo || wantsAudio) ? 'permanent' : 'temporary';

  // Cria a música no banco (título provisório — será atualizado pelo Python)
  const urlTitle = url.split('v=')[1]?.slice(0, 20) ?? 'YouTube Video';
  const [song] = await db.insert(songs).values({
    userId:           MOCK_USER_ID,
    title:            urlTitle,
    originalFilename: `youtube_${Date.now()}.${downloadType === 'video' ? 'mp4' : 'mp3'}`,
    sourceUrl:        url,
  }).returning();

  // Calcula o caminho de destino da mídia
  const timestamp    = Date.now();
  const mediaFilename = `${timestamp}-yt.${downloadType === 'video' ? 'mp4' : 'mp3'}`;
  const mediaDestBase = path.join(UPLOADS_DIR, `${timestamp}-yt`);

  const [media] = await db.insert(mediaFiles).values({
    songId:          song.id,
    storagePath:     mediaFilename,
    fileSizeBytes:   0,
    mimeType:        downloadType === 'video' ? 'video/mp4' : 'audio/mpeg',
    mediaType:       downloadType === 'video' ? 'video' : 'audio',
    retentionPolicy,
    youtubeUrl:      url,
  }).returning();

  // Determina o jobType primário
  let primaryJobType: 'generate_tab' | 'download_audio' | 'download_video' = 'generate_tab';
  if (!wantsTab && wantsVideo)  primaryJobType = 'download_video';
  if (!wantsTab && wantsAudio && !wantsVideo) primaryJobType = 'download_audio';

  const [job] = await db.insert(processingJobs).values({
    songId:      song.id,
    mediaFileId: media.id,
    jobType:     primaryJobType,
  }).returning();

  activeJobs.set(job.id, {
    audioPath:    path.join(UPLOADS_DIR, mediaFilename),
    songId:       song.id,
    intents:      resolvedIntents,
    youtubeUrl:   url,
    audioQuality: audioQuality ?? '192',
    videoQuality: videoQuality ?? 'best',
  });

  res.json({
    jobId:           job.id,
    songId:          song.id,
    mediaDestBase,
    retentionPolicy,
    intents:         resolvedIntents,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/process/:jobId  — SSE: executa o pipeline e transmite progresso
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/process/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const jobInfo   = activeJobs.get(jobId);

  if (!jobInfo) {
    res.status(404).json({ error: 'Job não encontrado ou sessão expirada.' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection:      'keep-alive',
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

  const intents       = jobInfo.intents;
  const wantsVideo    = intents.includes('download_video');
  const wantsAudio    = intents.includes('download_audio');
  const wantsTab      = intents.includes('generate_tab');
  const onlyTab       = wantsTab && !wantsVideo && !wantsAudio;
  const downloadType  = wantsVideo ? 'video' : 'audio';

  // Caminho final do arquivo de mídia (preenchido após download Python)
  let resolvedMediaPath: string | null = null;

  try {
    send({ stage: 'start', message: 'Iniciando pipeline…', progress: 3 });
    await updateJob('start', 'Iniciando pipeline…', 3);

    // ── FASE 1: Download via yt-dlp (se veio de URL) ──────────────────────
    if (jobInfo.youtubeUrl) {
      send({ stage: 'downloading', message: 'Baixando mídia do YouTube…', progress: 5 });
      await updateJob('downloading', 'Baixando mídia do YouTube…', 5);

      // Calcula destino base sem extensão (Python adiciona a extensão)
      const destBase = jobInfo.audioPath.replace(/\.[^.]+$/, '');

      const pythonArgs = [
        path.join(ROOT, 'bass_extractor.py'),
        '--url', jobInfo.youtubeUrl,
        '--download-type', downloadType,
        '--output-media', destBase,
        '--audio-quality', jobInfo.audioQuality ?? '192',
        '--video-quality', jobInfo.videoQuality ?? 'best',
      ];

      // Se a intenção é APENAS download (sem tablatura), passa --skip-tab
      if (!wantsTab) pythonArgs.push('--skip-tab');

      // Se há tablatura, também passa o caminho do MIDI de saída
      if (wantsTab) pythonArgs.push('--output', path.join(ROOT, 'test.mid'));

      // Para download puro, a barra vai de 5% a 90% (depois 95% ao terminar conversão)
      // Para tab, reservamos 5-28% para download e o restante para Demucs/Basic Pitch
      const maxDlProgress = wantsTab ? 28 : 90;

      resolvedMediaPath = await runPythonWithUrl(pythonArgs, async (data) => {
        send(data);
        await updateJob(data.stage, data.message, data.progress);
      }, maxDlProgress);

      // Atualiza o storagePath real no banco após download
      if (resolvedMediaPath) {
        const filename = path.basename(resolvedMediaPath);
        await db.update(mediaFiles)
          .set({ storagePath: filename, fileSizeBytes: fs.statSync(resolvedMediaPath).size })
          .where(eq(mediaFiles.songId, jobInfo.songId));
      }

      // Se não quer tablatura, encerra aqui (apenas download)
      if (!wantsTab) {
        await db.update(processingJobs)
          .set({ status: 'done', completedAt: new Date() })
          .where(eq(processingJobs.id, jobId));

        const dlFilename = resolvedMediaPath ? path.basename(resolvedMediaPath) : null;
        send({
          stage:       'done',
          message:     `Mídia baixada com sucesso! 🎬`,
          progress:    100,
          mediaPath:   resolvedMediaPath,
          audioUrl:    dlFilename ? `/audio/${dlFilename}` : null,
          downloadUrl: dlFilename ? `/api/download/${encodeURIComponent(dlFilename)}` : null,
        });
        return;
      }

    } else {
      // ── Upload local: roda Demucs/Basic Pitch diretamente ────────────────
      await runPython(jobInfo.audioPath, async (data) => {
        send(data);
        await updateJob(data.stage, data.message, data.progress);
      });
    }

    // ── FASE 2: Mapear notas e salvar tablatura ───────────────────────────
    send({ stage: 'mapping', message: 'Mapeando notas no braço…', progress: 88 });
    await updateJob('mapping', 'Mapeando notas no braço…', 88);

    const tabJson = await processMidi(path.join(ROOT, 'test.mid'));

    send({ stage: 'saving', message: 'Salvando tablatura no banco…', progress: 95 });

    const [tab] = await db.insert(tablatures).values({
      songId:        jobInfo.songId,
      jobId,
      tuning:        tabJson.meta.tuning,
      stringCount:   tabJson.meta.stringCount,
      fretCount:     tabJson.meta.fretCount,
      bpm:           tabJson.meta.bpm,
      totalNotes:    tabJson.meta.totalNotes,
      totalMeasures: tabJson.meta.totalMeasures,
    }).returning();

    await db.insert(measures).values(
      tabJson.measures.map((m) => ({
        tablatureId:   tab.id,
        measureNumber: m.measureNumber,
        startTime:     m.startTime,
        duration:      m.duration,
        noteCount:     m.events.filter((e) => e.type === 'note').length,
        restCount:     m.events.filter((e) => e.type === 'rest').length,
        events:        m.events as unknown as MeasureEvent[],
      })),
    );

    await db.update(processingJobs)
      .set({ status: 'done', completedAt: new Date() })
      .where(eq(processingJobs.id, jobId));

    // Inclui downloadUrl para o usuário poder salvar a mídia no dispositivo.
    // Para upload local: usa jobInfo.audioPath. Para YouTube: usa resolvedMediaPath.
    const doneMediaPath = resolvedMediaPath ?? (jobInfo.youtubeUrl ? null : jobInfo.audioPath);
    const doneFilename  = doneMediaPath && fs.existsSync(doneMediaPath) ? path.basename(doneMediaPath) : null;
    send({
      stage:       'done',
      message:     'Tablatura pronta! 🎸',
      progress:    100,
      tabJson,
      downloadUrl: doneFilename ? `/api/download/${encodeURIComponent(doneFilename)}` : null,
    });

  } catch (err) {
    console.error('[server] Pipeline error:', err);
    await db.update(processingJobs)
      .set({ status: 'error', errorMessage: String(err) })
      .where(eq(processingJobs.id, jobId));
    send({ stage: 'error', message: String(err) });

  } finally {
    // ── Regra de Ciclo de Vida dos Arquivos ───────────────────────────────
    // Se a intenção for EXCLUSIVAMENTE generate_tab (sem download permanente),
    // o arquivo é deletado — MAS com 90 segundos de grace period para que o
    // usuário ainda consiga clicar em "Salvar no Dispositivo" após o done event.
    // Caso contrário (download_audio / download_video), o arquivo é permanente.

    if (onlyTab && resolvedMediaPath) {
      const pathToClean = resolvedMediaPath;
      const songIdToClean = jobInfo.songId;
      setTimeout(async () => {
        if (!fs.existsSync(pathToClean)) return;
        try {
          fs.unlinkSync(pathToClean);
          console.log(`[cleanup] Arquivo temporário removido (grace period): ${pathToClean}`);
          await db.update(mediaFiles)
            .set({ storagePath: null })
            .where(eq(mediaFiles.songId, songIdToClean));
        } catch (unlinkErr) {
          console.warn('[cleanup] Falha ao deletar arquivo temporário:', unlinkErr);
        }
      }, 90_000); // 90 segundos de janela para download pelo usuário
    }

    activeJobs.delete(jobId);
    res.end();
  }
});

// ── GET /api/download/:filename  — serve arquivo com Content-Disposition: attachment ──
// Permite que o browser abra o diálogo nativo de "Salvar como".
app.get('/api/download/:filename', (req, res) => {
  const filename  = path.basename(req.params.filename); // segurança: evita path traversal
  const filePath  = path.join(UPLOADS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Arquivo não encontrado ou já foi removido.' });
    return;
  }

  // Força download no browser com o nome original do arquivo
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type',
    filename.endsWith('.mp4') ? 'video/mp4'
    : filename.endsWith('.zip') ? 'application/zip'
    : 'audio/mpeg'
  );
  res.sendFile(filePath);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/start-playlist  — registra um job de playlist e retorna o ID
// Body: { url, downloadType?, audioQuality?, videoQuality? }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/start-playlist', (req, res) => {
  const { url, downloadType, audioQuality, videoQuality } = req.body as {
    url?: string; downloadType?: string;
    audioQuality?: string; videoQuality?: string;
  };
  if (!url?.trim()) { res.status(400).json({ error: '"url" é obrigatório.' }); return; }

  const jobId    = `pl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const outputDir = path.join(UPLOADS_DIR, `playlist_${Date.now()}`);

  playlistJobs.set(jobId, {
    url:          url.trim(),
    downloadType: downloadType === 'video' ? 'video' : 'audio',
    audioQuality: audioQuality ?? '192',
    videoQuality: videoQuality ?? 'best',
    outputDir,
  });

  res.json({ jobId });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/playlist-stream/:jobId  — SSE: executa playlist_downloader.py
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/playlist-stream/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = playlistJobs.get(jobId);

  if (!job) { res.status(404).json({ error: 'Job de playlist não encontrado.' }); return; }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const venvPython = path.join(ROOT, '.venv', 'Scripts', 'python.exe');
  const pythonBin  = fs.existsSync(venvPython) ? venvPython : 'python';

  const proc = spawn(pythonBin, [
    path.join(ROOT, 'playlist_downloader.py'),
    job.url,
    job.outputDir,
    '--download-type', job.downloadType,
    '--audio-quality', job.audioQuality,
    '--video-quality', job.videoQuality,
  ], {
    cwd: ROOT,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });

  let total = 0;
  let current = 0;
  let zipPath: string | null = null;

  const parseLine = (line: string) => {
    const t = line.trim();
    if (!t) return;

    // [playlist] N vídeos | título
    const plMatch = t.match(/^\[playlist\]\s+(\d+)\s+vídeos/);
    if (plMatch) {
      total = parseInt(plMatch[1], 10);
      const title = t.split('|')[1]?.trim() ?? 'Playlist';
      send({ stage: 'info', message: `📋 ${title} — ${total} vídeos`, total, progress: 2 });
      return;
    }

    // [video] idx/total | título
    const vidMatch = t.match(/^\[video\]\s+(\d+)\/(\d+)\s*\|(.*)/);
    if (vidMatch) {
      current = parseInt(vidMatch[1], 10);
      const videoTitle = vidMatch[3].trim();
      const pct = total > 0 ? Math.round(2 + (current / total) * 88) : 5;
      send({ stage: 'downloading', message: `⬇ ${current}/${total}: ${videoTitle}`, current, total, progress: pct });
      return;
    }

    // [download] XX.X% | idx/total | título
    const dlMatch = t.match(/^\[download\]\s+([\d.]+)%/);
    if (dlMatch && total > 0) {
      const videoPct = parseFloat(dlMatch[1]);
      // Fatia do vídeo atual dentro do intervalo 2-90%
      const base = 2 + ((current - 1) / total) * 88;
      const slice = (1 / total) * 88;
      const mapped = Math.round(base + (videoPct / 100) * slice);
      send({ stage: 'downloading', message: t.replace('[download]', '').trim(), progress: Math.min(90, mapped) });
      return;
    }

    // [downloaded] filename
    if (t.startsWith('[downloaded]')) {
      const fname = t.replace('[downloaded]', '').trim();
      send({ stage: 'downloaded', message: `✅ ${fname}`, progress: Math.round(2 + (current / Math.max(total, 1)) * 88) });
      return;
    }

    // [zipping] N arquivos
    if (t.startsWith('[zipping]')) {
      send({ stage: 'zipping', message: '📦 Compactando em ZIP…', progress: 92 });
      return;
    }

    // ZIP_PATH:<path>
    if (t.startsWith('ZIP_PATH:')) {
      zipPath = t.replace('ZIP_PATH:', '').trim();
      return;
    }

    // [done]
    if (t.startsWith('[done]')) {
      const zipFilename = zipPath ? path.basename(zipPath) : null;
      send({
        stage:       'done',
        message:     '✅ Playlist baixada com sucesso!',
        progress:    100,
        zipUrl:      zipFilename ? `/api/download/${encodeURIComponent(zipFilename)}` : null,
        zipFilename,
      });
      playlistJobs.delete(jobId);
      res.end();
    }
  };

  let buf = '';
  const onData = (d: Buffer) => {
    buf += d.toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    lines.forEach(parseLine);
  };

  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData); // logs do Python também vêm pelo stderr

  proc.on('close', (code) => {
    if (code !== 0 && !res.writableEnded) {
      send({ stage: 'error', message: `Falha no download (código ${code}). Verifique se o ffmpeg está instalado.`, progress: 0 });
      res.end();
    }
    playlistJobs.delete(jobId);
  });

  proc.on('error', (err) => {
    send({ stage: 'error', message: `Erro ao iniciar Python: ${err.message}`, progress: 0 });
    res.end();
  });

  req.on('close', () => { if (!proc.killed) proc.kill(); });
});



// ── PATCH /api/songs/:songId ──────────────────────────────────────────────────
app.patch('/api/songs/:songId', async (req, res) => {
  const { songId } = req.params;
  const { title }  = req.body as { title?: string };
  if (!title?.trim()) { res.status(400).json({ error: 'Título inválido.' }); return; }
  await db.update(songs).set({ title: title.trim() }).where(eq(songs.id, songId));
  res.json({ songId, title: title.trim() });
});

// ── DELETE /api/songs/:songId ─────────────────────────────────────────────────
app.delete('/api/songs/:songId', async (req, res) => {
  const { songId } = req.params;

  // Busca o arquivo físico antes de deletar o registro (cascade limpa o resto)
  const [media] = await db
    .select({ storagePath: mediaFiles.storagePath })
    .from(mediaFiles)
    .where(eq(mediaFiles.songId, songId))
    .limit(1);

  // Remove o registro do banco — cascade deleta mediaFiles, jobs, tablatures e measures
  await db.delete(songs).where(eq(songs.id, songId));

  // Deleta o arquivo físico do disco (se existir)
  if (media?.storagePath) {
    const filePath = path.join(UPLOADS_DIR, media.storagePath);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`[delete] Arquivo removido: ${filePath}`);
      } catch (e) {
        console.warn('[delete] Falha ao remover arquivo:', e);
      }
    }
  }

  res.json({ ok: true, songId });
});

// ── GET /api/playlist-info?url=... ────────────────────────────────────────────
// Enumera os vídeos de uma playlist sem baixar nada.
// Retorna: { count: number, entries: { id, url, title, duration }[] }
app.get('/api/playlist-info', async (req, res) => {
  const url = (req.query.url as string | undefined)?.trim();
  if (!url) { res.status(400).json({ error: 'Parâmetro "url" é obrigatório.' }); return; }

  const venvPython = path.join(ROOT, '.venv', 'Scripts', 'python.exe');
  const pythonBin  = fs.existsSync(venvPython) ? venvPython : 'python';

  const entries: { id: string; url: string; title: string; duration?: number }[] = [];

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(pythonBin, [
        path.join(ROOT, 'bass_extractor.py'),
        '--list-playlist', url,
      ], {
        cwd: ROOT,
        env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
      });

      let buf = '';
      let stderrBuf = '';

      proc.stdout.on('data', (d: Buffer) => {
        buf += d.toString();
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try { entries.push(JSON.parse(line)); } catch { /* ignora linhas não-JSON (logs do Python) */ }
        }
      });
      proc.stderr.on('data', (d: Buffer) => {
        const txt = d.toString();
        stderrBuf += txt;
        process.stderr.write(d); // repassa para o terminal do servidor
      });
      proc.on('close', (code) => {
        if (code === 0) { resolve(); return; }
        // Extrai a última linha de erro significativa do stderr para a mensagem
        const lastErr = stderrBuf.split('\n').filter(l => l.includes('ERROR') || l.includes('Error') || l.includes('error')).pop()
          ?? stderrBuf.split('\n').filter(Boolean).pop()
          ?? `código de saída ${code}`;
        reject(new Error(`Falha ao ler playlist: ${lastErr.trim()}`));
      });
      proc.on('error', reject);
    });

    res.json({ count: entries.length, entries });
  } catch (err) {
    console.error('[playlist-info] Erro:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/library ──────────────────────────────────────────────────────────

app.get('/api/library', async (_req, res) => {
  const rows = await db
    .select({
      songId:           songs.id,
      title:            songs.title,
      artist:           songs.artist,
      originalFilename: songs.originalFilename,
      sourceUrl:        songs.sourceUrl,
      createdAt:        songs.createdAt,
      bpm:              tablatures.bpm,
      totalNotes:       tablatures.totalNotes,
      totalMeasures:    tablatures.totalMeasures,
      tuning:           tablatures.tuning,
      tabId:            tablatures.id,
      mediaType:        mediaFiles.mediaType,
      thumbnailUrl:     mediaFiles.thumbnailUrl,
      storagePath:      mediaFiles.storagePath,
    })
    .from(songs)
    .leftJoin(tablatures, and(eq(tablatures.songId, songs.id), eq(tablatures.isLatest, true)))
    .leftJoin(mediaFiles, eq(mediaFiles.songId, songs.id))
    .where(eq(songs.userId, MOCK_USER_ID))
    .orderBy(desc(songs.createdAt));

  res.json(rows);
});

// ── GET /api/songs/:songId/tablature ─────────────────────────────────────────
app.get('/api/songs/:songId/tablature', async (req, res) => {
  const { songId } = req.params;

  const [songRow] = await db
    .select({ title: songs.title, storagePath: mediaFiles.storagePath })
    .from(songs)
    .leftJoin(mediaFiles, eq(mediaFiles.songId, songs.id))
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
    audioUrl: songRow.storagePath ? `/audio/${songRow.storagePath}` : null,
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

/** Roda o Python para arquivo local (Demucs + Basic Pitch). */
function runPython(
  audioPath: string,
  onProgress: (data: { stage: string; message: string; progress: number }) => Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const venvPython = path.join(ROOT, '.venv', 'Scripts', 'python.exe');
    const pythonBin  = fs.existsSync(venvPython) ? venvPython : 'python';
    const proc = spawn(pythonBin, [path.join(ROOT, 'bass_extractor.py'), audioPath], {
      cwd: ROOT,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    });

    let lastProgress = 8;
    let stderrBuf = '';
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
    proc.stderr.on('data',  (d: Buffer) => { const s = d.toString(); stderrBuf += s; parse(s); });
    proc.on('close', (code) => {
      if (code === 0) { resolve(); return; }
      const lastErr = stderrBuf.split('\n').filter(Boolean).slice(-6).join(' | ');
      console.error('[runPython] stderr:', stderrBuf);
      reject(new Error(`bass_extractor.py falhou (código ${code}): ${lastErr || 'sem saída de erro'}`))
    });
    proc.on('error', reject);
  });
}

/**
 * Roda o Python com argumentos arbitrários (usado para o pipeline com --url).
 * Captura a linha "MEDIA_PATH:<path>" do stdout para retornar o caminho real do arquivo.
 */
function runPythonWithUrl(
  args: string[],
  onProgress: (data: { stage: string; message: string; progress: number }) => Promise<void>,
  maxDlProgress = 28,   // 28 para tab (deixa espaço para Demucs), 90 para download puro
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const venvPython = path.join(ROOT, '.venv', 'Scripts', 'python.exe');
    const pythonBin  = fs.existsSync(venvPython) ? venvPython : 'python';
    const proc = spawn(pythonBin, args, {
      cwd: ROOT,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    });

    let lastProgress = 5;
    let resolvedPath: string | null = null;
    let stderrBuf = '';

    const parse = (raw: string) => {
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();

        if (trimmed.startsWith('MEDIA_PATH:')) {
          resolvedPath = trimmed.replace('MEDIA_PATH:', '').trim();
          const doneProgress = maxDlProgress >= 90 ? 95 : 30;
          void onProgress({ stage: 'downloaded', message: 'Mídia baixada!', progress: doneProgress });
          lastProgress = doneProgress;
          continue;
        }

        const dlMatch = trimmed.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
        if (dlMatch && lastProgress < maxDlProgress) {
          const dlPct = parseFloat(dlMatch[1]);
          const mapped = Math.round(5 + (dlPct / 100) * (maxDlProgress - 5));
          if (mapped > lastProgress) {
            lastProgress = mapped;
            void onProgress({ stage: 'downloading', message: 'Baixando…', progress: lastProgress });
          }
        }

        if (trimmed.startsWith('[converting]') && !trimmed.includes('done') && lastProgress < 92) {
          lastProgress = 92;
          void onProgress({ stage: 'converting', message: 'Convertendo para MP3…', progress: 92 });
        }
        if (trimmed === '[converting] done' && lastProgress < 95) {
          lastProgress = 95;
          void onProgress({ stage: 'converting', message: 'Conversão concluída!', progress: 95 });
        }

        if (trimmed.includes('Running Demucs') && lastProgress < 45) {
          lastProgress = 45;
          void onProgress({ stage: 'demucs', message: 'Demucs processando…', progress: 45 });
        } else if (trimmed.match(/\d+%/) && lastProgress >= 30 && lastProgress < 65) {
          lastProgress = Math.min(65, lastProgress + 3);
          void onProgress({ stage: 'demucs', message: 'Separação em progresso…', progress: lastProgress });
        } else if (trimmed.includes('Bass stem isolated') && lastProgress < 70) {
          lastProgress = 70;
          void onProgress({ stage: 'transcribing', message: 'Baixo isolado! Transcrevendo…', progress: 70 });
        } else if (trimmed.includes('Transcribed') && lastProgress < 85) {
          lastProgress = 85;
          const n = trimmed.match(/(\d+)\s+note/)?.[1] ?? '?';
          void onProgress({ stage: 'transcribed', message: `${n} eventos transcritos. Gerando MIDI…`, progress: 85 });
        } else if (trimmed.includes('MIDI saved') && lastProgress < 87) {
          lastProgress = 87;
          void onProgress({ stage: 'midi_done', message: 'MIDI gerado!', progress: 87 });
        }
      }
    };

    proc.stdout.on('data', (d: Buffer) => parse(d.toString()));
    proc.stderr.on('data',  (d: Buffer) => { const s = d.toString(); stderrBuf += s; parse(s); });
    proc.on('close', (code) => {
      if (code === 0) { resolve(resolvedPath); return; }
      const lastErr = stderrBuf.split('\n').filter(Boolean).slice(-6).join(' | ');
      console.error('[runPythonWithUrl] stderr:', stderrBuf);
      reject(new Error(`bass_extractor.py falhou (código ${code}): ${lastErr || 'sem saída de erro'}`));
    });
    proc.on('error', reject);
  });
}

app.listen(PORT, () => console.log(`🎬  Media Platform API → http://localhost:${PORT}`));
