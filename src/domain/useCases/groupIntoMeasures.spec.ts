import { GroupIntoMeasures } from './groupIntoMeasures';
import { TablatureStep, TabPosition, TimedNote, Measure, Rest } from '../entities';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Creates a minimal TimedNote for testing purposes.
 */
function timedNote(
  pitch: TimedNote['pitch'],
  octave: number,
  startTime: number,
  duration: number,
): TimedNote {
  return { pitch, octave, startTime, duration };
}

/**
 * Creates a minimal TablatureStep for testing purposes.
 */
function step(
  pitch: TimedNote['pitch'],
  octave: number,
  startTime: number,
  duration: number,
  stringNumber = 1,
  fret = 0,
): TablatureStep {
  const pos: TabPosition = { stringNumber, fret };
  return { note: timedNote(pitch, octave, startTime, duration), position: pos };
}

function isRest(event: TablatureStep | Rest): event is Rest {
  return (event as Rest).type === 'rest';
}

function isStep(event: TablatureStep | Rest): event is TablatureStep {
  return !isRest(event);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('GroupIntoMeasures', () => {
  let useCase: GroupIntoMeasures;

  beforeEach(() => {
    useCase = new GroupIntoMeasures();
  });

  // -------------------------------------------------------------------------
  // Empty input
  // -------------------------------------------------------------------------

  describe('Empty input', () => {
    it('should return an empty array when given no steps', () => {
      const result = useCase.execute({ steps: [] });
      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Measure boundary calculation
  // -------------------------------------------------------------------------

  describe('Measure boundary calculation', () => {
    /**
     * At 120 BPM, 4/4 time:
     *   measureDuration = 4 * (60 / 120) = 2.0 seconds per measure
     */
    it('should assign a single step at t=0 to measure 1', () => {
      const steps = [step('E', 1, 0, 0.5)];
      const result = useCase.execute({ steps, bpm: 120 });

      expect(result).toHaveLength(1);
      expect(result[0].measureNumber).toBe(1);
    });

    it('should compute correct measure startTime at 120 BPM', () => {
      const steps = [step('E', 1, 0, 0.5)];
      const result = useCase.execute({ steps, bpm: 120 });

      // Measure 1 starts at 0s
      expect(result[0].startTime).toBeCloseTo(0);
    });

    it('should compute measure duration as 2.0s at 120 BPM (4/4)', () => {
      const steps = [step('E', 1, 0, 0.5)];
      const result = useCase.execute({ steps, bpm: 120 });

      expect(result[0].duration).toBeCloseTo(2.0);
    });

    it('should place a step at t=2.0s into measure 2 at 120 BPM', () => {
      const steps = [step('E', 1, 2.0, 0.5)];
      const result = useCase.execute({ steps, bpm: 120 });

      expect(result[0].measureNumber).toBe(2);
    });

    it('should place a step at t=1.99s into measure 1 at 120 BPM', () => {
      const steps = [step('E', 1, 1.99, 0.5)];
      const result = useCase.execute({ steps, bpm: 120 });

      expect(result[0].measureNumber).toBe(1);
    });

    it('should produce two measures when steps span two measure boundaries', () => {
      const steps = [
        step('E', 1, 0.0, 0.5),  // measure 1
        step('A', 1, 2.5, 0.5),  // measure 2
      ];
      const result = useCase.execute({ steps, bpm: 120 });

      expect(result).toHaveLength(2);
      expect(result[0].measureNumber).toBe(1);
      expect(result[1].measureNumber).toBe(2);
    });

    it('should group two steps in the same measure together', () => {
      const steps = [
        step('E', 1, 0.0, 0.4),
        step('A', 1, 0.5, 0.4),
      ];
      const result = useCase.execute({ steps, bpm: 120 });

      expect(result).toHaveLength(1);
      expect(result[0].events.filter(isStep)).toHaveLength(2);
    });

    it('should use 120 BPM as default when bpm is not provided', () => {
      // At 120 BPM, measure = 2s. Step at t=2.0 should be in measure 2.
      const steps = [step('E', 1, 2.0, 0.5)];
      const result = useCase.execute({ steps });

      expect(result[0].measureNumber).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Different BPM
  // -------------------------------------------------------------------------

  describe('BPM variations', () => {
    it('should compute a 4.0s measure at 60 BPM', () => {
      const steps = [step('E', 1, 0, 0.5)];
      const result = useCase.execute({ steps, bpm: 60 });

      expect(result[0].duration).toBeCloseTo(4.0);
    });

    it('should place a step at t=3.0 in measure 1 at 60 BPM (measure = 4s)', () => {
      const steps = [step('E', 1, 3.0, 0.5)];
      const result = useCase.execute({ steps, bpm: 60 });

      expect(result[0].measureNumber).toBe(1);
    });

    it('should place a step at t=4.0 in measure 2 at 60 BPM', () => {
      const steps = [step('E', 1, 4.0, 0.5)];
      const result = useCase.execute({ steps, bpm: 60 });

      expect(result[0].measureNumber).toBe(2);
    });

    it('should compute a 1.0s measure at 240 BPM', () => {
      const steps = [step('E', 1, 0, 0.25)];
      const result = useCase.execute({ steps, bpm: 240 });

      expect(result[0].duration).toBeCloseTo(1.0);
    });
  });

  // -------------------------------------------------------------------------
  // Rest insertion
  // -------------------------------------------------------------------------

  describe('Rest insertion', () => {
    it('should not insert a rest when gap is below the threshold', () => {
      const steps = [
        step('E', 1, 0.0, 0.4),
        step('A', 1, 0.45, 0.4), // gap = 0.05 - exactly at default threshold
      ];
      const result = useCase.execute({ steps, bpm: 120 });
      const rests = result.flatMap((m) => m.events).filter(isRest);

      expect(rests).toHaveLength(0);
    });

    it('should insert a rest when gap exceeds the threshold', () => {
      const steps = [
        step('E', 1, 0.0, 0.3),   // ends at 0.3
        step('A', 1, 0.7, 0.3),   // starts at 0.7 → gap = 0.4s > 0.05 threshold
      ];
      const result = useCase.execute({ steps, bpm: 120 });
      const rests = result.flatMap((m) => m.events).filter(isRest);

      expect(rests).toHaveLength(1);
    });

    it('rest should have correct startTime and duration', () => {
      const steps = [
        step('E', 1, 0.0, 0.3),   // ends at 0.3
        step('A', 1, 0.8, 0.3),   // starts at 0.8 → gap = 0.5s
      ];
      const result = useCase.execute({ steps, bpm: 120 });
      const rest = result.flatMap((m) => m.events).find(isRest) as Rest;

      expect(rest.startTime).toBeCloseTo(0.3);
      expect(rest.duration).toBeCloseTo(0.5);
    });

    it('rest should carry the type discriminant "rest"', () => {
      const steps = [
        step('E', 1, 0.0, 0.1),
        step('A', 1, 1.0, 0.1),
      ];
      const result = useCase.execute({ steps, bpm: 120 });
      const rest = result.flatMap((m) => m.events).find(isRest) as Rest;

      expect(rest.type).toBe('rest');
    });

    it('should insert multiple rests for multiple gaps', () => {
      const steps = [
        step('E', 1, 0.0, 0.1),   // ends 0.1
        step('A', 1, 0.5, 0.1),   // gap 0.4 → rest
        step('D', 2, 1.0, 0.1),   // gap 0.4 → rest
      ];
      const result = useCase.execute({ steps, bpm: 120 });
      const rests = result.flatMap((m) => m.events).filter(isRest);

      expect(rests).toHaveLength(2);
    });

    it('should respect a custom restThreshold', () => {
      const steps = [
        step('E', 1, 0.0, 0.3),
        step('A', 1, 0.5, 0.3), // gap = 0.2s
      ];

      // Default threshold (0.05) → rest inserted
      const resultDefault = useCase.execute({ steps, bpm: 120 });
      expect(resultDefault.flatMap((m) => m.events).filter(isRest)).toHaveLength(1);

      // High threshold (0.5) → no rest because gap (0.2) < threshold (0.5)
      const resultHighThreshold = useCase.execute({ steps, bpm: 120, restThreshold: 0.5 });
      expect(resultHighThreshold.flatMap((m) => m.events).filter(isRest)).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Output structure
  // -------------------------------------------------------------------------

  describe('Output structure', () => {
    it('should preserve original TablatureStep references in measure events', () => {
      const s = step('E', 1, 0, 0.5);
      const result = useCase.execute({ steps: [s], bpm: 120 });
      const noteEvents = result[0].events.filter(isStep);

      expect(noteEvents[0]).toBe(s);
    });

    it('should return measures sorted by measureNumber ascending', () => {
      const steps = [
        step('E', 1, 4.0, 0.5),  // measure 3 at 120 BPM
        step('A', 1, 0.0, 0.5),  // measure 1
        step('D', 2, 2.0, 0.5),  // measure 2
      ];
      const result = useCase.execute({ steps, bpm: 120 });

      expect(result.map((m) => m.measureNumber)).toEqual([1, 2, 3]);
    });

    it('should not create empty measures for gaps in time (sparse measures)', () => {
      // Steps at t=0 (measure 1) and t=10 (measure 6 at 120bpm)
      // Measures 2-5 should NOT be created since they have no steps.
      const steps = [
        step('E', 1, 0.0, 0.5),
        step('A', 1, 10.0, 0.5),
      ];
      const result = useCase.execute({ steps, bpm: 120 });

      // Only 2 measures, not 6
      expect(result).toHaveLength(2);
    });
  });
});
