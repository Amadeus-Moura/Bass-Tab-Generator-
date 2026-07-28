import type { TabJson, JsonNoteEvent } from '../types/TabJson';

// ── Constants (all in canvas px units) ──────────────────────────────────────
const SCALE       = 2;            // retina / quality multiplier
const PAGE_W      = 842 * SCALE;  // A4 landscape width  (pt → px)
const PAGE_H      = 595 * SCALE;  // A4 landscape height
const MARGIN      = 28 * SCALE;
const LABEL_W     = 48 * SCALE;   // string labels column
const RULER_H     = 24 * SCALE;
const STR_H       = 68 * SCALE;
const NOTE_H      = 38 * SCALE;
const NOTE_MIN_W  = 28 * SCALE;
const HEADER_H    = 52 * SCALE;   // title block on page 1

const STRING_COLORS = ['#f87171', '#fb923c', '#38bdf8', '#a78bfa'];
const STRING_DIM    = ['rgba(248,113,113,0.18)', 'rgba(251,146,60,0.18)', 'rgba(56,189,248,0.18)', 'rgba(167,139,250,0.18)'];
const TUNING        = ['E', 'A', 'D', 'G'];

// ── Rounded rectangle helper ─────────────────────────────────────────────────
function rRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// ── Main export function ─────────────────────────────────────────────────────
export async function exportTabToPdf(tabJson: TabJson, title: string, zoom: number): Promise<void> {
  const { jsPDF } = await import('jspdf');

  // Gather all notes
  const allNotes: JsonNoteEvent[] = tabJson.measures.flatMap((m) =>
    m.events.filter((e): e is JsonNoteEvent => e.type === 'note'),
  );

  // Total duration
  let maxTime = 1;
  for (const n of allNotes) maxTime = Math.max(maxTime, n.startTime + n.duration);

  const pxPerSec     = zoom * SCALE;
  const contentW     = PAGE_W - 2 * MARGIN - LABEL_W;
  const secPerPage   = contentW / pxPerSec;
  const numPages     = Math.ceil(maxTime / secPerPage);
  const stringsH     = tabJson.meta.stringCount * STR_H;

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  for (let page = 0; page < numPages; page++) {
    if (page > 0) pdf.addPage('a4', 'landscape');

    const canvas    = document.createElement('canvas');
    canvas.width    = PAGE_W;
    canvas.height   = PAGE_H;
    const ctx       = canvas.getContext('2d')!;
    const tStart    = page * secPerPage;
    const tEnd      = tStart + secPerPage;
    const isFirst   = page === 0;

    // ── Background ──────────────────────────────────────────────────
    ctx.fillStyle = '#0d0d14';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    // ── Header (page 1 only) ─────────────────────────────────────────
    if (isFirst) {
      ctx.fillStyle = '#f0f0ff';
      ctx.font = `900 ${18 * SCALE}px sans-serif`;
      ctx.fillText(`🎸 ${title}`, MARGIN, MARGIN + 22 * SCALE);

      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `${9 * SCALE}px monospace`;
      ctx.fillText(
        `${tabJson.meta.tuning} · ${tabJson.meta.bpm} BPM · ${tabJson.meta.totalNotes} notas · gerado por Bass Tab Generator`,
        MARGIN, MARGIN + 36 * SCALE,
      );
    }

    // ── Page number ─────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font      = `${8 * SCALE}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(`${page + 1} / ${numPages}`, PAGE_W - MARGIN, MARGIN + 14 * SCALE);
    ctx.textAlign = 'left';

    // ── Tab area position ───────────────────────────────────────────
    const tabTop = MARGIN + (isFirst ? HEADER_H : 16 * SCALE);
    const cx     = MARGIN + LABEL_W; // content x (after label column)

    // ── String labels ───────────────────────────────────────────────
    for (let si = 0; si < tabJson.meta.stringCount; si++) {
      const s      = tabJson.meta.stringCount - si;  // string number 1–4
      const color  = STRING_COLORS[s - 1];
      const midY   = tabTop + RULER_H + si * STR_H + STR_H / 2;
      ctx.fillStyle  = color;
      ctx.font       = `900 ${12 * SCALE}px monospace`;
      ctx.textAlign  = 'center';
      ctx.fillText(TUNING[s - 1], MARGIN + LABEL_W / 2, midY + 5 * SCALE);
    }
    ctx.textAlign = 'left';

    // ── Ruler background ────────────────────────────────────────────
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(cx, tabTop, contentW, RULER_H);

    // ── Ruler ticks ─────────────────────────────────────────────────
    for (let sec = Math.floor(tStart); sec <= Math.ceil(tEnd); sec++) {
      const x       = cx + (sec - tStart) * pxPerSec;
      if (x < cx || x > cx + contentW) continue;
      const isMaj   = sec % 5 === 0;
      ctx.strokeStyle = isMaj ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth   = (isMaj ? 1.5 : 0.75) * SCALE;
      ctx.beginPath(); ctx.moveTo(x, tabTop); ctx.lineTo(x, tabTop + RULER_H); ctx.stroke();
      if (isMaj) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font      = `${7 * SCALE}px monospace`;
        ctx.fillText(`${sec}s`, x + 2 * SCALE, tabTop + RULER_H - 5 * SCALE);
      }
    }

    // Ruler border
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = SCALE;
    ctx.beginPath(); ctx.moveTo(cx, tabTop + RULER_H); ctx.lineTo(cx + contentW, tabTop + RULER_H); ctx.stroke();

    // ── String lines ─────────────────────────────────────────────────
    for (let si = 0; si < tabJson.meta.stringCount; si++) {
      const s     = tabJson.meta.stringCount - si;
      const lineY = tabTop + RULER_H + si * STR_H + STR_H / 2;
      ctx.strokeStyle = STRING_COLORS[s - 1] + '30';
      ctx.lineWidth   = 1.5 * SCALE;
      ctx.beginPath(); ctx.moveTo(cx, lineY); ctx.lineTo(cx + contentW, lineY); ctx.stroke();
    }

    // ── Measure markers ──────────────────────────────────────────────
    for (const m of tabJson.measures) {
      const x = cx + (m.startTime - tStart) * pxPerSec;
      if (x < cx - 1 || x > cx + contentW) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth   = SCALE;
      ctx.beginPath(); ctx.moveTo(x, tabTop + RULER_H); ctx.lineTo(x, tabTop + RULER_H + stringsH); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font      = `${6.5 * SCALE}px monospace`;
      ctx.fillText(`${m.measureNumber}`, x + 2 * SCALE, tabTop + RULER_H + 11 * SCALE);
    }

    // ── Notes ────────────────────────────────────────────────────────
    for (const note of allNotes) {
      if (note.startTime + note.duration < tStart || note.startTime > tEnd) continue;

      const rawX  = cx + (note.startTime - tStart) * pxPerSec;
      const rawW  = Math.max(note.duration * pxPerSec, NOTE_MIN_W);
      const si    = tabJson.meta.stringCount - note.string;
      const noteY = tabTop + RULER_H + si * STR_H + (STR_H - NOTE_H) / 2;
      const color = STRING_COLORS[note.string - 1];
      const dim   = STRING_DIM[note.string - 1];

      // Clip to content area
      const drawX = Math.max(rawX, cx);
      const drawW = Math.min(rawX + rawW, cx + contentW) - drawX;
      if (drawW <= 2) continue;

      // Background
      ctx.fillStyle = dim;
      rRect(ctx, drawX, noteY, drawW, NOTE_H, 5 * SCALE); ctx.fill();

      // Border
      ctx.strokeStyle = color + '80';
      ctx.lineWidth   = 1.5 * SCALE;
      rRect(ctx, drawX, noteY, drawW, NOTE_H, 5 * SCALE); ctx.stroke();

      // Labels
      const wide = rawW >= 52 * SCALE;
      ctx.textAlign = 'center';
      const midX    = drawX + drawW / 2;

      if (wide) {
        // Primary — fret number
        ctx.fillStyle = '#ffffff';
        ctx.font      = `900 ${12 * SCALE}px monospace`;
        ctx.fillText(`${note.fret}`, midX, noteY + NOTE_H / 2 + 1 * SCALE);
        // Secondary — note name
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font      = `${7.5 * SCALE}px monospace`;
        ctx.fillText(`${note.pitch}${note.octave}`, midX, noteY + NOTE_H / 2 + 11 * SCALE);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.font      = `900 ${11 * SCALE}px monospace`;
        ctx.fillText(`${note.fret}`, midX, noteY + NOTE_H / 2 + 4 * SCALE);
      }
      ctx.textAlign = 'left';
    }

    // ── Outer border ─────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth   = SCALE;
    ctx.strokeRect(MARGIN, MARGIN, PAGE_W - 2 * MARGIN, PAGE_H - 2 * MARGIN);

    // ── Add page to PDF ──────────────────────────────────────────────
    const img = canvas.toDataURL('image/jpeg', 0.93);
    pdf.addImage(img, 'JPEG', 0, 0, 842, 595);
  }

  pdf.save(`${title.replace(/[^a-z0-9]/gi, '_')}-tablatura.pdf`);
}
