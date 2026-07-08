import path from 'path';
import { RealMidiFileAdapter } from '../src/infrastructure/adapters/realMidiFileAdapter';
import { MidiToNoteAdapter } from '../src/infrastructure/adapters/midiToNoteAdapter';
import { MapNoteToFretboard } from '../src/domain/useCases/mapNoteToFretboard';
import { SuggestOptimalPosition } from '../src/domain/useCases/suggestOptimalPosition';
import { GroupIntoMeasures } from '../src/domain/useCases/groupIntoMeasures';
import { GenerateTablatureSequence } from '../src/domain/useCases/generateTablatureSequence';
import { JsonTabExporter } from '../src/presentation/jsonTabExporter';
import { createFourStringBass } from '../src/domain/factories/instrumentFactory';
import type { Instrument, TimedNote } from '../src/domain/entities';
import { noteToSemitone, semitoneToNote } from '../src/domain/utils/noteConverter';

function normalizeToInstrumentRange(note: TimedNote, inst: Instrument): TimedNote {
  const lowestSemitone = noteToSemitone(inst.openStrings[0]);
  const highestSemitone =
    noteToSemitone(inst.openStrings[inst.openStrings.length - 1]) + inst.fretCount;

  let semitone = noteToSemitone(note);
  while (semitone < lowestSemitone) semitone += 12;
  while (semitone > highestSemitone) semitone -= 12;

  return { ...semitoneToNote(semitone), startTime: note.startTime, duration: note.duration };
}

export async function processMidi(midiPath: string) {
  const fileAdapter = new RealMidiFileAdapter(new MidiToNoteAdapter());
  const generator = new GenerateTablatureSequence(
    new MapNoteToFretboard(),
    new SuggestOptimalPosition(),
    new GroupIntoMeasures(),
  );
  const instrument = createFourStringBass();

  const rawNotes = fileAdapter.extract(midiPath);
  const bpm = fileAdapter.lastBpm;
  const notes = rawNotes.map((n) => normalizeToInstrumentRange(n, instrument));

  const tablature = generator.execute({ instrument, notes, bpm });
  return JsonTabExporter.export(tablature);
}
