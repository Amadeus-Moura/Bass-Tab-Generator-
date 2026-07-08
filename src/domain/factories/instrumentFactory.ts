import { Instrument, Note } from '../entities';

/**
 * Factory functions for creating pre-configured Instrument instances.
 * These represent standard bass guitar tunings and serve as the default
 * configurations in the domain — no database needed.
 */

/**
 * Creates a standard 4-string bass guitar with EADG tuning.
 * Open strings (lowest to highest): E1, A1, D2, G2
 *
 * @param fretCount - Number of frets on the instrument (default: 22).
 */
export function createFourStringBass(fretCount = 22): Instrument {
  const openStrings: Note[] = [
    { pitch: 'E', octave: 1 }, // String 1 — lowest
    { pitch: 'A', octave: 1 }, // String 2
    { pitch: 'D', octave: 2 }, // String 3
    { pitch: 'G', octave: 2 }, // String 4 — highest
  ];

  return { stringCount: 4, openStrings, fretCount };
}

/**
 * Creates a standard 5-string bass guitar with BEADG tuning.
 * Open strings (lowest to highest): B0, E1, A1, D2, G2
 *
 * @param fretCount - Number of frets on the instrument (default: 22).
 */
export function createFiveStringBass(fretCount = 22): Instrument {
  const openStrings: Note[] = [
    { pitch: 'B', octave: 0 }, // String 1 — lowest (extended B)
    { pitch: 'E', octave: 1 }, // String 2
    { pitch: 'A', octave: 1 }, // String 3
    { pitch: 'D', octave: 2 }, // String 4
    { pitch: 'G', octave: 2 }, // String 5 — highest
  ];

  return { stringCount: 5, openStrings, fretCount };
}
