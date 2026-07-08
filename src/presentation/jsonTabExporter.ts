import { TimedTablature, TablatureStep, Rest, MeasureEvent, Measure } from '../domain/entities';

// ---------------------------------------------------------------------------
// JSON output shape types
// ---------------------------------------------------------------------------

/**
 * JSON representation of a single bass note with its fretboard position.
 */
export interface JsonNoteEvent {
  type: 'note';
  pitch: string;
  octave: number;
  startTime: number;
  duration: number;
  string: number;
  fret: number;
}

/**
 * JSON representation of a silence between notes.
 */
export interface JsonRestEvent {
  type: 'rest';
  startTime: number;
  duration: number;
}

export type JsonEvent = JsonNoteEvent | JsonRestEvent;

/**
 * JSON representation of a musical measure (compasso).
 */
export interface JsonMeasure {
  measureNumber: number;
  startTime: number;
  duration: number;
  events: JsonEvent[];
}

/**
 * The root JSON document produced by the JsonTabExporter.
 *
 * This structure is designed to be consumed by any frontend renderer
 * (e.g. a React app using AlphaTab, VexFlow, or a custom SVG renderer).
 */
export interface TabJson {
  meta: {
    /** The bass guitar tuning label, e.g. "EADG" or "BEADG". */
    tuning: string;
    /** Number of strings on the instrument. */
    stringCount: number;
    /** Number of frets on the instrument. */
    fretCount: number;
    /** Tempo in beats per minute. */
    bpm: number;
    /** Total number of notes (excluding rests). */
    totalNotes: number;
    /** Total number of measures. */
    totalMeasures: number;
  };
  measures: JsonMeasure[];
}

// ---------------------------------------------------------------------------
// Exporter
// ---------------------------------------------------------------------------

/**
 * Presentation layer — exports a TimedTablature as a structured JSON document.
 *
 * ## Purpose
 *
 * Replaces the AsciiTabRenderer. Instead of rendering a human-readable
 * ASCII string for the terminal, this exporter serialises the full tablature
 * (including measures, rests, and note timing) into a machine-readable JSON
 * format that can be:
 *   - Saved to a `.json` file and served by a static file server.
 *   - Piped directly to a WebSocket / HTTP API.
 *   - Consumed by a TypeScript/React frontend to drive a visual renderer.
 *
 * ## Design
 *
 * The exporter is a pure function wrapped in a class for consistency with
 * the rest of the codebase. It has no side effects, no I/O, and depends
 * only on its input — it is trivially unit-testable.
 */
export class JsonTabExporter {
  /**
   * Converts a TimedTablature into a TabJson document.
   *
   * @param tablature - The resolved, timed tablature from the domain.
   * @returns A plain TabJson object ready to be JSON-serialised.
   */
  static export(tablature: TimedTablature): TabJson {
    const { instrument, bpm, steps, measures } = tablature;

    const tuning = instrument.openStrings.map((n) => n.pitch).join('');

    return {
      meta: {
        tuning,
        stringCount: instrument.stringCount,
        fretCount: instrument.fretCount,
        bpm,
        totalNotes: steps.length,
        totalMeasures: measures.length,
      },
      measures: measures.map((m) => JsonTabExporter.exportMeasure(m)),
    };
  }

  /**
   * Converts a single Measure into its JSON representation.
   */
  private static exportMeasure(measure: Measure): JsonMeasure {
    return {
      measureNumber: measure.measureNumber,
      startTime: measure.startTime,
      duration: measure.duration,
      events: measure.events.map((e) => JsonTabExporter.exportEvent(e)),
    };
  }

  /**
   * Converts a single MeasureEvent (TablatureStep or Rest) into its JSON representation.
   */
  private static exportEvent(event: MeasureEvent): JsonEvent {
    if ((event as Rest).type === 'rest') {
      const rest = event as Rest;
      return {
        type: 'rest',
        startTime: rest.startTime,
        duration: rest.duration,
      };
    }

    const noteStep = event as TablatureStep;
    return {
      type: 'note',
      pitch: noteStep.note.pitch,
      octave: noteStep.note.octave,
      startTime: noteStep.note.startTime,
      duration: noteStep.note.duration,
      string: noteStep.position.stringNumber,
      fret: noteStep.position.fret,
    };
  }
}
