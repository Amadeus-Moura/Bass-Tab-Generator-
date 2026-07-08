import { MidiToNoteAdapter } from '../../infrastructure/adapters/midiToNoteAdapter';
import { RawMidiPayload } from '../../infrastructure/adapters/midiTypes';
import { TimedNote } from '../../domain/entities';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cria um payload mínimo com uma única track e as notas fornecidas. */
function payload(
  notes: RawMidiPayload['tracks'][number]['notes'],
  trackName = 'Bass',
): RawMidiPayload {
  return { tracks: [{ name: trackName, notes }] };
}

/** Shorthand para notas por número MIDI. */
const midiNote = (
  midi: number,
  time: number,
  duration = 0.5,
): RawMidiPayload['tracks'][number]['notes'][number] => ({
  midi,
  time,
  duration,
});

/** Shorthand para notas por nome científico. */
const namedNote = (
  name: string,
  time: number,
  duration = 0.5,
): RawMidiPayload['tracks'][number]['notes'][number] => ({
  name,
  time,
  duration,
});

/**
 * Matcher helper: asserts that a TimedNote has the expected pitch/octave,
 * without caring about startTime or duration.
 */
const pitchOf = (pitch: TimedNote['pitch'], octave: number) =>
  expect.objectContaining({ pitch, octave });

// ---------------------------------------------------------------------------
// Referência rápida de números MIDI usados nos testes
// (padrão GM: C4 = 60, fórmula: midi = (octave + 1) * 12 + pitchIndex)
//
//  B0  = 23   E1 = 28   F#1 = 30   G#1 = 32   A1 = 33   B1 = 35
//  C2  = 36   D2 = 38   E2  = 40   A2  = 45   G2 = 43   G3 = 55
// ---------------------------------------------------------------------------

describe('MidiToNoteAdapter', () => {
  let adapter: MidiToNoteAdapter;

  beforeEach(() => {
    adapter = new MidiToNoteAdapter();
  });

  // -------------------------------------------------------------------------
  // Implementa o contrato NoteExtractor
  // -------------------------------------------------------------------------

  describe('Contract compliance', () => {
    it('should implement NoteExtractor — extract() must exist and return TimedNote[]', () => {
      expect(typeof adapter.extract).toBe('function');

      const result = adapter.extract(payload([midiNote(28, 0)]));

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('pitch');
      expect(result[0]).toHaveProperty('octave');
      expect(result[0]).toHaveProperty('startTime');
      expect(result[0]).toHaveProperty('duration');
    });

    it('should return an empty array for a payload with no notes', () => {
      const result = adapter.extract(payload([]));

      expect(result).toEqual([]);
    });

    it('should return an empty array when all tracks are empty', () => {
      const multiTrackEmpty: RawMidiPayload = {
        tracks: [
          { name: 'Bass', notes: [] },
          { name: 'Drums', notes: [] },
        ],
      };

      expect(adapter.extract(multiTrackEmpty)).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Conversão por número MIDI
  // -------------------------------------------------------------------------

  describe('Conversion via MIDI number', () => {
    it('should convert MIDI 28 to TimedNote E1', () => {
      const result = adapter.extract(payload([midiNote(28, 0)]));

      expect(result[0]).toEqual(expect.objectContaining({ pitch: 'E', octave: 1 }));
    });

    it('should convert MIDI 33 to TimedNote A1', () => {
      const result = adapter.extract(payload([midiNote(33, 0)]));

      expect(result[0]).toEqual(expect.objectContaining({ pitch: 'A', octave: 1 }));
    });

    it('should convert MIDI 38 to TimedNote D2', () => {
      const result = adapter.extract(payload([midiNote(38, 0)]));

      expect(result[0]).toEqual(expect.objectContaining({ pitch: 'D', octave: 2 }));
    });

    it('should convert MIDI 43 to TimedNote G2', () => {
      // G2: (2 + 1) * 12 + 7 = 43
      const result = adapter.extract(payload([midiNote(43, 0)]));

      expect(result[0]).toEqual(expect.objectContaining({ pitch: 'G', octave: 2 }));
    });

    it('should convert MIDI 23 to TimedNote B0 (5-string bass low B)', () => {
      const result = adapter.extract(payload([midiNote(23, 0)]));

      expect(result[0]).toEqual(expect.objectContaining({ pitch: 'B', octave: 0 }));
    });

    it('should convert MIDI 60 to TimedNote C4 (middle C)', () => {
      const result = adapter.extract(payload([midiNote(60, 0)]));

      expect(result[0]).toEqual(expect.objectContaining({ pitch: 'C', octave: 4 }));
    });
  });

  // -------------------------------------------------------------------------
  // Conversão por nome científico
  // -------------------------------------------------------------------------

  describe('Conversion via note name string', () => {
    it('should convert "E1" to TimedNote { pitch: E, octave: 1 }', () => {
      const result = adapter.extract(payload([namedNote('E1', 0)]));

      expect(result[0]).toEqual(expect.objectContaining({ pitch: 'E', octave: 1 }));
    });

    it('should convert "A#2" to TimedNote { pitch: A#, octave: 2 }', () => {
      const result = adapter.extract(payload([namedNote('A#2', 0)]));

      expect(result[0]).toEqual(expect.objectContaining({ pitch: 'A#', octave: 2 }));
    });

    it('should convert "B0" to TimedNote { pitch: B, octave: 0 }', () => {
      const result = adapter.extract(payload([namedNote('B0', 0)]));

      expect(result[0]).toEqual(expect.objectContaining({ pitch: 'B', octave: 0 }));
    });

    it('should convert "C#3" to TimedNote { pitch: C#, octave: 3 }', () => {
      const result = adapter.extract(payload([namedNote('C#3', 0)]));

      expect(result[0]).toEqual(expect.objectContaining({ pitch: 'C#', octave: 3 }));
    });

    it('should prefer midi field over name when both are present', () => {
      // midi=28 (E1) conflicts with name="A1" (midi=33) — midi wins
      const result = adapter.extract(
        payload([{ midi: 28, name: 'A1', time: 0, duration: 0.5 }]),
      );

      expect(result[0]).toEqual(expect.objectContaining({ pitch: 'E', octave: 1 }));
    });

    it('should throw for an invalid note name format', () => {
      expect(() =>
        adapter.extract(payload([namedNote('INVALID', 0)])),
      ).toThrow('formato de nota inválido');
    });
  });

  // -------------------------------------------------------------------------
  // Timing fields (startTime & duration)
  // -------------------------------------------------------------------------

  describe('Timing fields', () => {
    it('should preserve the raw MIDI time as startTime', () => {
      const result = adapter.extract(payload([midiNote(28, 2.75)]));

      expect(result[0].startTime).toBeCloseTo(2.75);
    });

    it('should preserve the raw MIDI duration', () => {
      const result = adapter.extract(payload([midiNote(28, 0, 1.25)]));

      expect(result[0].duration).toBeCloseTo(1.25);
    });

    it('should carry timing from the lowest note in a chord (not from a discarded note)', () => {
      // E1 at t=0 duration=0.4 (lowest → kept), B1 at t=0 duration=0.9 (discarded)
      const result = adapter.extract(
        payload([
          midiNote(35, 0.0, 0.9), // B1 — discarded
          midiNote(28, 0.0, 0.4), // E1 — kept (lowest)
        ]),
      );

      expect(result[0].startTime).toBeCloseTo(0.0);
      expect(result[0].duration).toBeCloseTo(0.4);
    });

    it('should preserve startTime for each note in a multi-note sequence', () => {
      const result = adapter.extract(
        payload([
          midiNote(28, 0.0, 0.5), // E1
          midiNote(33, 0.5, 0.5), // A1
          midiNote(38, 1.0, 0.5), // D2
        ]),
      );

      expect(result[0].startTime).toBeCloseTo(0.0);
      expect(result[1].startTime).toBeCloseTo(0.5);
      expect(result[2].startTime).toBeCloseTo(1.0);
    });
  });

  // -------------------------------------------------------------------------
  // Ordenação temporal
  // -------------------------------------------------------------------------

  describe('Chronological ordering', () => {
    it('should return notes in time order even if provided out of order', () => {
      const result = adapter.extract(
        payload([
          midiNote(40, 1.0), // E2
          midiNote(28, 0.0), // E1
          midiNote(33, 0.5), // A1
        ]),
      );

      expect(result[0]).toEqual(expect.objectContaining({ pitch: 'E', octave: 1 }));
      expect(result[1]).toEqual(expect.objectContaining({ pitch: 'A', octave: 1 }));
      expect(result[2]).toEqual(expect.objectContaining({ pitch: 'E', octave: 2 }));
    });

    it('should produce a result array with the same length as unique time positions', () => {
      const result = adapter.extract(
        payload([
          midiNote(28, 0.0),
          midiNote(33, 0.5),
          midiNote(38, 1.0),
          midiNote(43, 1.5),
        ]),
      );

      expect(result).toHaveLength(4);
    });
  });

  // -------------------------------------------------------------------------
  // Filtragem monofônica (chord detection) — cenário obrigatório do spec
  // -------------------------------------------------------------------------

  describe('Monophonic filter: chord reduction to lowest note', () => {
    it('should keep only E1 when E1 and B1 are played simultaneously', () => {
      // Spec: E1 (midi 28) e B1 (midi 35) no mesmo instante → retorna só E1
      const result = adapter.extract(
        payload([
          midiNote(35, 0.0), // B1 — mais agudo
          midiNote(28, 0.0), // E1 — mais grave → deve ser retido
        ]),
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(pitchOf('E', 1));
    });

    it('should keep the lowest note of a 3-note chord (E1, A1, D2)', () => {
      const result = adapter.extract(
        payload([
          midiNote(38, 0.0), // D2 (38)
          midiNote(28, 0.0), // E1 (28) ← lowest
          midiNote(33, 0.0), // A1 (33)
        ]),
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(pitchOf('E', 1));
    });

    it('should process subsequent chords independently', () => {
      // Acorde 1 em t=0.0: A1(33) + E1(28) → E1
      // Acorde 2 em t=0.5: G2(43) + D2(38) → D2
      const result = adapter.extract(
        payload([
          midiNote(33, 0.0),
          midiNote(28, 0.0),
          midiNote(43, 0.5), // G2 = midi 43
          midiNote(38, 0.5),
        ]),
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(pitchOf('E', 1));
      expect(result[1]).toEqual(pitchOf('D', 2));
    });

    it('should not collapse notes that are close but not simultaneous', () => {
      // 0.0ms vs 2ms de diferença — além do epsilon de 1ms → notas separadas
      const result = adapter.extract(
        payload([
          midiNote(28, 0.000), // E1 at t=0
          midiNote(35, 0.002), // B1 at t=2ms — fora da janela epsilon
        ]),
      );

      expect(result).toHaveLength(2);
    });

    it('should collapse notes within the TIME_EPSILON tolerance (1ms)', () => {
      // 0.0ms vs 0.5ms de diferença — dentro do epsilon → acorde
      const result = adapter.extract(
        payload([
          midiNote(28, 0.0000), // E1 — mais grave
          midiNote(35, 0.0005), // B1 — dentro da janela epsilon
        ]),
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(pitchOf('E', 1));
    });

    it('should handle a single note at any time without filtering it out', () => {
      const result = adapter.extract(
        payload([midiNote(33, 5.0)]),
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(pitchOf('A', 1));
    });
  });

  // -------------------------------------------------------------------------
  // Multi-track (merge de faixas)
  // -------------------------------------------------------------------------

  describe('Multi-track flattening', () => {
    it('should merge notes from multiple tracks into a single ordered sequence', () => {
      const multiTrack: RawMidiPayload = {
        tracks: [
          { name: 'Bass Low', notes: [midiNote(28, 0.0)] },  // E1
          { name: 'Bass High', notes: [midiNote(40, 0.5)] }, // E2
        ],
      };

      const result = adapter.extract(multiTrack);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(pitchOf('E', 1));
      expect(result[1]).toEqual(pitchOf('E', 2));
    });

    it('should apply monophonic filter after merging all tracks', () => {
      // Track 1 fornece E1 em t=0, Track 2 fornece B1 em t=0 → só E1
      const multiTrack: RawMidiPayload = {
        tracks: [
          { name: 'Track A', notes: [midiNote(28, 0.0)] }, // E1
          { name: 'Track B', notes: [midiNote(35, 0.0)] }, // B1
        ],
      };

      const result = adapter.extract(multiTrack);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(pitchOf('E', 1));
    });
  });

  // -------------------------------------------------------------------------
  // Integração completa: adapter → GenerateTablatureSequence
  // -------------------------------------------------------------------------

  describe('Integration: adapter output feeds directly into the domain', () => {
    it('should produce a TimedNote[] compatible with MapNoteToFretboard', () => {
      const { MapNoteToFretboard } = require('../../domain/useCases/mapNoteToFretboard');
      const { createFourStringBass } = require('../../domain/factories/instrumentFactory');

      const notes = adapter.extract(
        payload([
          midiNote(28, 0.0), // E1
          midiNote(33, 0.5), // A1
          midiNote(38, 1.0), // D2
        ]),
      );

      const mapper = new MapNoteToFretboard();
      const bass = createFourStringBass();

      notes.forEach((note: TimedNote) => {
        const { positions } = mapper.execute({ note, instrument: bass });
        // Cada nota extraída deve ter ao menos uma posição válida no braço
        expect(positions.length).toBeGreaterThan(0);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('Error handling', () => {
    it('should throw when a note has neither midi nor name field', () => {
      expect(() =>
        adapter.extract(
          payload([{ time: 0, duration: 0.5 } as never]),
        ),
      ).toThrow("sem campo 'midi' nem 'name'");
    });

    it('should throw for a MIDI number above 127', () => {
      expect(() =>
        adapter.extract(payload([midiNote(128, 0)])),
      ).toThrow('número MIDI inválido');
    });

    it('should throw for a negative MIDI number', () => {
      expect(() =>
        adapter.extract(payload([midiNote(-1, 0)])),
      ).toThrow('número MIDI inválido');
    });
  });
});