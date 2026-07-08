import { Instrument, TimedNote, TimedTablature, TablatureStep } from '../entities';
import { MapNoteToFretboard } from './mapNoteToFretboard';
import { SuggestOptimalPosition } from './suggestOptimalPosition';
import { GroupIntoMeasures } from './groupIntoMeasures';

/**
 * Input contract for the GenerateTablatureSequence use case.
 */
export interface GenerateTablatureSequenceInput {
  /** The instrument to generate the tablature for. */
  readonly instrument: Instrument;
  /**
   * The ordered sequence of timed notes representing the melody.
   * Must contain at least one note.
   */
  readonly notes: readonly TimedNote[];
  /**
   * Tempo in beats per minute.
   * Used to determine measure boundaries during grouping.
   * @default 120
   */
  readonly bpm?: number;
}

/**
 * Use Case: GenerateTablatureSequence
 *
 * The top-level orchestrator of the Core Domain. Converts an ordered sequence
 * of musical notes into a complete, playable bass tablature with measures.
 *
 * ## Orchestration Flow (per note)
 *
 * 1. **MapNoteToFretboard** — find all valid physical positions for the note.
 * 2. **SuggestOptimalPosition** — select the best position given the current
 *    left-hand position on the fretboard.
 * 3. **Hand position update** — if the chosen position is a fretted note
 *    (fret > 0), update the hand anchor to that fret for the next iteration.
 *    Open strings (fret 0) do not move the hand anchor.
 * 4. **GroupIntoMeasures** — bucket the resolved steps into measures
 *    (compassos) based on BPM and a 4/4 time signature.
 *
 * ## Dependency Injection
 *
 * All inner use cases are injected via the constructor. This keeps the
 * orchestrator decoupled from its collaborators and makes every layer
 * independently unit-testable with mocks or real instances.
 *
 * ## Error Handling
 *
 * If a note in the sequence has no valid positions on the given instrument
 * (e.g. a note below the lowest open string on a 4-string bass), the use
 * case throws a descriptive error identifying the problematic note by its
 * index and value, rather than silently skipping it.
 */
export class GenerateTablatureSequence {
  constructor(
    private readonly mapNoteToFretboard: MapNoteToFretboard,
    private readonly suggestOptimalPosition: SuggestOptimalPosition,
    private readonly groupIntoMeasures: GroupIntoMeasures = new GroupIntoMeasures(),
  ) {}

  /**
   * Executes the orchestration pipeline over the full note sequence.
   *
   * @param input - Instrument, timed note sequence, and BPM.
   * @returns A complete TimedTablature with steps and measures.
   * @throws {Error} If notes array is empty.
   * @throws {Error} If any note has no valid position on the given instrument.
   */
  execute(input: GenerateTablatureSequenceInput): TimedTablature {
    const { instrument, notes, bpm = 120 } = input;

    if (notes.length === 0) {
      throw new Error(
        'GenerateTablatureSequence requires at least one note in the sequence.',
      );
    }

    const steps: TablatureStep[] = [];

    // Null signals "no prior context" — triggers headstock-preference heuristic.
    let currentHandPosition: number | null = null;

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];

      // Step 1: resolve all valid physical positions for this note.
      const { positions } = this.mapNoteToFretboard.execute({
        note,
        instrument,
      });

      if (positions.length === 0) {
        throw new Error(
          `Note at index ${i} (${note.pitch}${note.octave}) has no valid ` +
            `position on the given instrument. ` +
            `Verify the note is within the instrument's range.`,
        );
      }

      // Step 2: pick the ergonomically optimal position.
      const { position } = this.suggestOptimalPosition.execute({
        possiblePositions: positions,
        currentHandPosition,
      });

      steps.push({ note, position });

      // Step 3: update hand anchor — only fretted notes move the hand.
      // Open strings (fret 0) allow the hand to stay wherever it was,
      // ready to reach the next fretted note from its current position.
      if (position.fret > 0) {
        currentHandPosition = position.fret;
      }
    }

    // Step 4: group the flat steps into musical measures.
    const measures = this.groupIntoMeasures.execute({ steps, bpm });

    return { instrument, bpm, steps, measures };
  }
}
