import { Instrument, Note, TabPosition } from '../entities';
import { noteToSemitone } from '../utils/noteConverter';

/**
 * Input contract for the MapNoteToFretboard use case.
 */
export interface MapNoteToFretboardInput {
  /** The musical note to locate on the fretboard. */
  readonly note: Note;
  /** The instrument configuration (string count, tuning, fret range). */
  readonly instrument: Instrument;
}

/**
 * Output contract for the MapNoteToFretboard use case.
 */
export interface MapNoteToFretboardOutput {
  /**
   * All physical positions where the target note can be played.
   * Ordered by string number (ascending) then fret number (ascending).
   * An empty array means the note is out of the instrument's range.
   */
  readonly positions: readonly TabPosition[];
}

/**
 * Use Case: MapNoteToFretboard
 *
 * Receives a musical Note and an Instrument configuration, and returns
 * every physical position (string + fret) where that note can be played.
 *
 * This is a pure domain service — it has no side effects, no I/O, and
 * depends only on its own inputs. It is fully testable in isolation.
 */
export class MapNoteToFretboard {
  /**
   * Executes the use case.
   *
   * Algorithm:
   * 1. Convert the target note to an absolute semitone number.
   * 2. For each string, compute the semitone of its open note.
   * 3. The difference (target − open) gives the fret number for that string.
   * 4. If 0 ≤ fret ≤ instrument.fretCount, the position is valid.
   *
   * @param input - The note and instrument to use.
   * @returns All valid TabPositions for the given note on the given instrument.
   */
  execute(input: MapNoteToFretboardInput): MapNoteToFretboardOutput {
    const { note, instrument } = input;
    const targetSemitone = noteToSemitone(note);
    const positions: TabPosition[] = [];

    instrument.openStrings.forEach((openNote, index) => {
      const openSemitone = noteToSemitone(openNote);
      const fret = targetSemitone - openSemitone;

      if (fret >= 0 && fret <= instrument.fretCount) {
        positions.push({
          stringNumber: index + 1, // 1-indexed: string 1 is the lowest
          fret,
        });
      }
    });

    return { positions };
  }
}
