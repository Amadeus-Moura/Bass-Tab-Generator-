/**
 * Entry point — reads a real MIDI file and exports the bass tablature as JSON.
 *
 * Usage:
 *   Place a "test.mid" file in the project root, then run:
 *   npm start
 *
 * Pipeline:
 *   test.mid
 *     → RealMidiFileAdapter   (Infrastructure — reads file, selects bass track)
 *     → GenerateTablatureSequence  (Domain — maps notes to fretboard + groups into measures)
 *     → JsonTabExporter  (Presentation — serialises to JSON for frontend consumption)
 *     → tab.json  (output file, consumed by the web UI)
 */

import * as fs from 'fs';
import * as path from 'path';

import { MidiToNoteAdapter } from './infrastructure/adapters/midiToNoteAdapter';
import { RealMidiFileAdapter } from './infrastructure/adapters/realMidiFileAdapter';
import { MapNoteToFretboard } from './domain/useCases/mapNoteToFretboard';
import { SuggestOptimalPosition } from './domain/useCases/suggestOptimalPosition';
import { GroupIntoMeasures } from './domain/useCases/groupIntoMeasures';
import { GenerateTablatureSequence } from './domain/useCases/generateTablatureSequence';
import { JsonTabExporter } from './presentation/jsonTabExporter';
import { createFourStringBass } from './domain/factories/instrumentFactory';
import { Instrument, TimedNote } from './domain/entities';
import { noteToSemitone, semitoneToNote } from './domain/utils/noteConverter';

// ---------------------------------------------------------------------------
// Resolve file path
// ---------------------------------------------------------------------------

const TEST_MID_PATH = path.resolve(__dirname, '..', 'test.mid');
const OUTPUT_JSON_PATH = path.resolve(__dirname, '..', 'tab.json');

if (!fs.existsSync(TEST_MID_PATH)) {
  console.error('\n❌  Arquivo não encontrado: test.mid');
  console.error(`    Caminho esperado: ${TEST_MID_PATH}`);
  console.error('\n    Coloque um arquivo MIDI de baixo com o nome "test.mid"');
  console.error('    na raiz do projeto e execute npm start novamente.\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Dependency wiring
// ---------------------------------------------------------------------------

const fileAdapter = new RealMidiFileAdapter(new MidiToNoteAdapter());
const generator   = new GenerateTablatureSequence(
  new MapNoteToFretboard(),
  new SuggestOptimalPosition(),
  new GroupIntoMeasures(),
);
const instrument  = createFourStringBass();

// ---------------------------------------------------------------------------
// Range normalisation
// ---------------------------------------------------------------------------

/**
 * Transposes a note by octave increments until it fits within the playable
 * range of the instrument, then returns the adjusted note.
 *
 * This is necessary because ML transcription models (e.g. Basic Pitch) may
 * emit notes that are technically above or below a bass guitar's range.
 * Transposing by whole octaves preserves the pitch class (i.e. melodic shape)
 * while making the tablature physically playable.
 */
function normalizeToInstrumentRange(note: TimedNote, inst: Instrument): TimedNote {
  const lowestSemitone  = noteToSemitone(inst.openStrings[0]);
  const highestOpenNote = inst.openStrings[inst.openStrings.length - 1];
  const highestSemitone = noteToSemitone(highestOpenNote) + inst.fretCount;

  let semitone = noteToSemitone(note);

  // Shift up if below the lowest open string.
  while (semitone < lowestSemitone)  semitone += 12;
  // Shift down if above the highest reachable fret.
  while (semitone > highestSemitone) semitone -= 12;

  const normalized = semitoneToNote(semitone);
  // Preserve timing fields from the original TimedNote.
  return { ...normalized, startTime: note.startTime, duration: note.duration };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

console.log(`\n🎸  Bass Tablature Generator`);
console.log(`📂  Arquivo: ${path.basename(TEST_MID_PATH)}`);
console.log('='.repeat(52));

const rawNotes   = fileAdapter.extract(TEST_MID_PATH);
const bpm        = fileAdapter.lastBpm;
const notes      = rawNotes.map(n => normalizeToInstrumentRange(n, instrument));

const outOfRange = rawNotes.filter(n => {
  const s  = noteToSemitone(n);
  const lo = noteToSemitone(instrument.openStrings[0]);
  const hi = noteToSemitone(instrument.openStrings[instrument.openStrings.length - 1]) + instrument.fretCount;
  return s < lo || s > hi;
}).length;

if (outOfRange > 0) {
  console.warn(`⚠️   ${outOfRange} nota(s) fora do range do instrumento foram transpostas por oitava.`);
}

console.log(`🎵  BPM detectado: ${bpm.toFixed(1)}`);

const tablature = generator.execute({ instrument, notes, bpm });

console.log(`\n✅  ${rawNotes.length} notas extraídas → ${tablature.steps.length} posições, ${tablature.measures.length} compassos\n`);

// ---------------------------------------------------------------------------
// Export JSON
// ---------------------------------------------------------------------------

const tabJson = JsonTabExporter.export(tablature);
fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(tabJson, null, 2), 'utf-8');

console.log(`📄  Tablatura exportada: ${path.basename(OUTPUT_JSON_PATH)}`);
console.log(`    → ${tablature.measures.length} compassos`);
console.log(`    → ${tabJson.meta.totalNotes} notas`);
console.log(`    → BPM: ${tabJson.meta.bpm.toFixed(1)}`);
console.log(`    → Afinação: ${tabJson.meta.tuning}`);
console.log('\n' + '='.repeat(52));
console.log('🚀  Próximo passo: inicie o frontend com  npm run web');
console.log('='.repeat(52) + '\n');
