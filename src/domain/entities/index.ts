/**
 * Represents the musical pitch of a note (without octave information).
 * Uses scientific pitch notation.
 */
export type Pitch =
  | 'C'
  | 'C#'
  | 'D'
  | 'D#'
  | 'E'
  | 'F'
  | 'F#'
  | 'G'
  | 'G#'
  | 'A'
  | 'A#'
  | 'B';

/**
 * Represents a musical note defined by its pitch and octave.
 * Example: { pitch: 'E', octave: 2 } represents the note E2.
 */
export interface Note {
  readonly pitch: Pitch;
  readonly octave: number;
}

/**
 * A Note enriched with temporal information extracted from a MIDI source.
 * All time values are in seconds relative to the start of the track.
 */
export interface TimedNote extends Note {
  /** Absolute start time of the note in seconds from the beginning of the track. */
  readonly startTime: number;
  /** Duration of the note in seconds. */
  readonly duration: number;
}

/**
 * Represents a physical position on the fretboard of a bass guitar.
 */
export interface TabPosition {
  /** The string number (1 = lowest pitched, ascending). */
  readonly stringNumber: number;
  /** The fret number (0 = open string). */
  readonly fret: number;
}

/**
 * Defines the number of strings the bass guitar has.
 */
export type StringCount = 4 | 5;

/**
 * Represents the configuration of a bass guitar instrument.
 */
export interface Instrument {
  /** Total number of strings on the instrument. */
  readonly stringCount: StringCount;
  /**
   * The open-string tuning, ordered from lowest pitch (string 1) to highest.
   * For a 4-string bass: [E1, A1, D2, G2]
   * For a 5-string bass: [B0, E1, A1, D2, G2]
   */
  readonly openStrings: readonly Note[];
  /**
   * The maximum number of frets available on the instrument.
   * Typically 20–24 for a bass guitar.
   */
  readonly fretCount: number;
}

/**
 * Represents a single resolved step in a tablature.
 * Pairs the original musical TimedNote with the physical position chosen for it.
 */
export interface TablatureStep {
  /** The musical note (with timing) that was requested. */
  readonly note: TimedNote;
  /** The physical position chosen for this note on the fretboard. */
  readonly position: TabPosition;
}

/**
 * Represents a silence between two notes in the tablature.
 * Rests are inserted by the GroupIntoMeasures use case when the gap
 * between the end of a note and the start of the next exceeds a threshold.
 */
export interface Rest {
  readonly type: 'rest';
  /** Start time of the rest in seconds. */
  readonly startTime: number;
  /** Duration of the rest in seconds. */
  readonly duration: number;
}

/**
 * A union type for elements that can appear inside a Measure.
 * Either a resolved TablatureStep (a played note) or a Rest (silence).
 */
export type MeasureEvent = TablatureStep | Rest;

/**
 * Represents a single measure (compasso) in the tablature.
 * Assumes a 4/4 time signature by default.
 */
export interface Measure {
  /** 1-indexed measure number. */
  readonly measureNumber: number;
  /** Start time of this measure in seconds. */
  readonly startTime: number;
  /** Duration of this measure in seconds (determined by BPM). */
  readonly duration: number;
  /** Ordered events (notes and rests) within this measure. */
  readonly events: readonly MeasureEvent[];
}

/**
 * Represents a complete, playable bass guitar tablature with timing and measures.
 *
 * This is the final output of the domain — it binds together the instrument,
 * the ordered sequence of resolved fretboard positions, and the grouping of
 * those positions into musical measures.
 */
export interface TimedTablature {
  /** The instrument this tablature was generated for. */
  readonly instrument: Instrument;
  /** Tempo in beats per minute. Extracted from the MIDI file header. */
  readonly bpm: number;
  /** All resolved steps in chronological order (flat, before measure grouping). */
  readonly steps: readonly TablatureStep[];
  /** The steps grouped into measures (compassos). */
  readonly measures: readonly Measure[];
}

/**
 * @deprecated Use TimedTablature instead. Kept for backward compatibility
 * while migrating tests.
 */
export interface Tablature {
  readonly instrument: Instrument;
  readonly steps: readonly TablatureStep[];
}
