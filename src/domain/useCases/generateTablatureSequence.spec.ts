import { GenerateTablatureSequence } from '../useCases/generateTablatureSequence';
import { MapNoteToFretboard } from '../useCases/mapNoteToFretboard';
import { SuggestOptimalPosition } from '../useCases/suggestOptimalPosition';
import { GroupIntoMeasures } from '../useCases/groupIntoMeasures';
import { createFourStringBass, createFiveStringBass } from '../factories/instrumentFactory';
import { TimedNote, TabPosition } from '../entities';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeUseCase(): GenerateTablatureSequence {
  return new GenerateTablatureSequence(
    new MapNoteToFretboard(),
    new SuggestOptimalPosition(),
    new GroupIntoMeasures(),
  );
}

/**
 * Creates a TimedNote with default timing values for tests that only care
 * about pitch/octave (i.e. fretboard resolution), not about timing.
 */
const n = (pitch: TimedNote['pitch'], octave: number): TimedNote => ({
  pitch,
  octave,
  startTime: 0,
  duration: 0.5,
});

const pos = (stringNumber: number, fret: number): TabPosition => ({ stringNumber, fret });

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('GenerateTablatureSequence', () => {
  let useCase: GenerateTablatureSequence;
  const bass4 = createFourStringBass();
  const bass5 = createFiveStringBass();

  beforeEach(() => {
    useCase = makeUseCase();
  });

  // -------------------------------------------------------------------------
  // Basic output shape
  // -------------------------------------------------------------------------

  describe('Output structure', () => {
    it('should return a TimedTablature with steps equal to the number of input notes', () => {
      const notes: TimedNote[] = [n('E', 1), n('F#', 1), n('G#', 1)];
      const result = useCase.execute({ instrument: bass4, notes });

      expect(result.steps).toHaveLength(3);
    });

    it('should attach the correct instrument to the TimedTablature', () => {
      const result = useCase.execute({ instrument: bass4, notes: [n('E', 1)] });

      expect(result.instrument).toBe(bass4);
    });

    it('should include a bpm field in the output', () => {
      const result = useCase.execute({ instrument: bass4, notes: [n('E', 1)], bpm: 100 });

      expect(result.bpm).toBe(100);
    });

    it('should default bpm to 120 when not provided', () => {
      const result = useCase.execute({ instrument: bass4, notes: [n('E', 1)] });

      expect(result.bpm).toBe(120);
    });

    it('should include a non-empty measures array', () => {
      const result = useCase.execute({ instrument: bass4, notes: [n('E', 1)] });

      expect(result.measures.length).toBeGreaterThan(0);
    });

    it('should preserve the original note in each TablatureStep', () => {
      const notes: TimedNote[] = [n('A', 1), n('D', 2)];
      const result = useCase.execute({ instrument: bass4, notes });

      expect(result.steps[0].note.pitch).toBe('A');
      expect(result.steps[0].note.octave).toBe(1);
      expect(result.steps[1].note.pitch).toBe('D');
      expect(result.steps[1].note.octave).toBe(2);
    });

    it('should return a valid TabPosition in each TablatureStep', () => {
      const result = useCase.execute({ instrument: bass4, notes: [n('E', 1), n('A', 1)] });

      result.steps.forEach(({ position }) => {
        expect(position.stringNumber).toBeGreaterThanOrEqual(1);
        expect(position.fret).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Hand movement — ascending riff (the spec scenario)
  // -------------------------------------------------------------------------

  describe('Hand movement: ascending riff forcing gradual hand shift', () => {
    /**
     * Scenario: riff E1 → F#1 → G#1 → A#1 → C2 → D2 → E2 on a 4-string bass.
     *
     * On string 1 (E1 open):
     *   E1  → fret 0  (open)
     *   F#1 → fret 2
     *   G#1 → fret 4
     *   A#1 → fret 6
     *   C2  → fret 8
     *   D2  → fret 10
     *   E2  → fret 12
     *
     * Because each fretted note updates currentHandPosition, the algorithm
     * should stay on string 1 and walk up the neck chromatically.
     */
    const ascendingRiff: TimedNote[] = [
      n('E', 1),   // open string 1  → fret 0  (hand: null → stays null)
      n('F#', 1),  // string 1 fret 2 — closest to null (headstock preference)
      n('G#', 1),  // string 1 fret 4 — distance 2 from fret 2
      n('A#', 1),  // string 1 fret 6 — distance 2 from fret 4
      n('C', 2),   // string 1 fret 8 — distance 2 from fret 6
      n('D', 2),   // string 1 fret 10 — distance 2 from fret 8
      n('E', 2),   // string 1 fret 12 — distance 2 from fret 10
    ];

    it('should start at fret 0 (open E string) for the first note', () => {
      const result = useCase.execute({ instrument: bass4, notes: ascendingRiff });

      expect(result.steps[0].position).toEqual(pos(1, 0));
    });

    it('should choose fret 2 on string 1 for F#1 (hand was null → headstock preference)', () => {
      const result = useCase.execute({ instrument: bass4, notes: ascendingRiff });

      expect(result.steps[1].position).toEqual(pos(1, 2));
    });

    it('should walk the frets upward on string 1 throughout the riff', () => {
      const result = useCase.execute({ instrument: bass4, notes: ascendingRiff });

      const frets = result.steps.map(s => s.position.fret);

      // Frets must be non-decreasing — the hand moves up the neck
      for (let i = 1; i < frets.length; i++) {
        expect(frets[i]).toBeGreaterThanOrEqual(frets[i - 1]);
      }
    });

    it('should resolve the final note E2 at fret 12 on string 1', () => {
      const result = useCase.execute({ instrument: bass4, notes: ascendingRiff });

      const last = result.steps[result.steps.length - 1];
      expect(last.position).toEqual(pos(1, 12));
    });

    it('should produce exactly 7 steps for a 7-note riff', () => {
      const result = useCase.execute({ instrument: bass4, notes: ascendingRiff });

      expect(result.steps).toHaveLength(7);
    });
  });

  // -------------------------------------------------------------------------
  // Open string hand position freeze
  // -------------------------------------------------------------------------

  describe('Open string does not update hand position', () => {
    it('should keep hand position from before an open string when evaluating the next note', () => {
      const notes: TimedNote[] = [n('G#', 1), n('E', 1), n('G#', 1)];
      const result = useCase.execute({ instrument: bass4, notes });

      expect(result.steps[0].position).toEqual(pos(1, 4));
      expect(result.steps[1].position.fret).toBe(0);
      expect(result.steps[2].position).toEqual(pos(1, 4));
    });

    it('should keep hand at null across consecutive open strings if no fretted note precedes them', () => {
      const notes: TimedNote[] = [n('E', 1), n('A', 1)];
      const result = useCase.execute({ instrument: bass4, notes });

      expect(result.steps[0].position.fret).toBe(0);
      expect(result.steps[1].position.fret).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 5-string bass
  // -------------------------------------------------------------------------

  describe('5-String Bass integration', () => {
    it('should resolve B0 (exclusive to 5-string) as open string 1', () => {
      const result = useCase.execute({ instrument: bass5, notes: [n('B', 0)] });

      expect(result.steps[0].position).toEqual(pos(1, 0));
    });

    it('should resolve E1 via string 1 fret 5 OR string 2 fret 0 and prefer fret 0 as first note', () => {
      const result = useCase.execute({ instrument: bass5, notes: [n('E', 1)] });

      expect(result.steps[0].position.fret).toBe(0);
    });

    it('should generate a valid tablature for a 3-note riff on a 5-string bass', () => {
      const notes: TimedNote[] = [n('B', 0), n('E', 1), n('A', 1)];
      const result = useCase.execute({ instrument: bass5, notes });

      expect(result.steps).toHaveLength(3);
      result.steps.forEach(({ position }) => {
        expect(position.fret).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Dependency injection
  // -------------------------------------------------------------------------

  describe('Dependency injection', () => {
    it('should call MapNoteToFretboard once per note', () => {
      const mockMapper = new MapNoteToFretboard();
      const executeSpy = jest.spyOn(mockMapper, 'execute');

      const uc = new GenerateTablatureSequence(mockMapper, new SuggestOptimalPosition());
      const notes: TimedNote[] = [n('E', 1), n('A', 1), n('D', 2)];

      uc.execute({ instrument: bass4, notes });

      expect(executeSpy).toHaveBeenCalledTimes(3);
    });

    it('should call SuggestOptimalPosition once per note', () => {
      const mockSuggest = new SuggestOptimalPosition();
      const executeSpy = jest.spyOn(mockSuggest, 'execute');

      const uc = new GenerateTablatureSequence(new MapNoteToFretboard(), mockSuggest);
      const notes: TimedNote[] = [n('E', 1), n('A', 1), n('D', 2)];

      uc.execute({ instrument: bass4, notes });

      expect(executeSpy).toHaveBeenCalledTimes(3);
    });

    it('should pass null as currentHandPosition for the first call to SuggestOptimalPosition', () => {
      const mockSuggest = new SuggestOptimalPosition();
      const executeSpy = jest.spyOn(mockSuggest, 'execute');

      const uc = new GenerateTablatureSequence(new MapNoteToFretboard(), mockSuggest);

      uc.execute({ instrument: bass4, notes: [n('A', 1)] });

      expect(executeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ currentHandPosition: null }),
      );
    });

    it('should pass updated hand position to SuggestOptimalPosition on the second note', () => {
      const mockSuggest = new SuggestOptimalPosition();
      const executeSpy = jest.spyOn(mockSuggest, 'execute');

      const uc = new GenerateTablatureSequence(new MapNoteToFretboard(), mockSuggest);

      uc.execute({ instrument: bass4, notes: [n('F#', 1), n('G#', 1)] });

      expect(executeSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ currentHandPosition: 2 }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('Error handling', () => {
    it('should throw when the notes array is empty', () => {
      expect(() =>
        useCase.execute({ instrument: bass4, notes: [] }),
      ).toThrow('GenerateTablatureSequence requires at least one note');
    });

    it('should throw with the note index and pitch when a note is out of range', () => {
      const notes: TimedNote[] = [n('E', 1), n('B', 0)];

      expect(() =>
        useCase.execute({ instrument: bass4, notes }),
      ).toThrow('Note at index 1 (B0)');
    });

    it('should throw for a note too high to reach on the fretboard', () => {
      expect(() =>
        useCase.execute({ instrument: bass4, notes: [n('C', 6)] }),
      ).toThrow('Note at index 0 (C6)');
    });
  });
});
