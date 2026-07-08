import { Note, Pitch } from '../entities';

/**
 * Chromatic scale in ascending order.
 * Index 0 = C, Index 1 = C#, ..., Index 11 = B
 */
const CHROMATIC_SCALE: readonly Pitch[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];

/**
 * Converts a Note (pitch + octave) into an absolute MIDI-like semitone number.
 * MIDI standard: C0 = 0, C1 = 12, C2 = 24, ...
 *
 * This is a pure function used internally to compare note pitches numerically.
 *
 * @param note - The Note to convert.
 * @returns An integer representing the note's absolute pitch.
 */
export function noteToSemitone(note: Note): number {
  const pitchIndex = CHROMATIC_SCALE.indexOf(note.pitch);

  if (pitchIndex === -1) {
    throw new Error(`Invalid pitch: "${note.pitch}"`);
  }

  return note.octave * 12 + pitchIndex;
}

/**
 * Converts an absolute semitone number back into a Note (pitch + octave).
 *
 * @param semitone - An integer representing the absolute pitch.
 * @returns The corresponding Note.
 */
export function semitoneToNote(semitone: number): Note {
  const octave = Math.floor(semitone / 12);
  const pitchIndex = semitone % 12;

  return {
    pitch: CHROMATIC_SCALE[pitchIndex],
    octave,
  };
}
