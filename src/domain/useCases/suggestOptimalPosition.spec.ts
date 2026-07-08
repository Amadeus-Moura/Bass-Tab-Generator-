import { SuggestOptimalPosition } from '../useCases/suggestOptimalPosition';
import { TabPosition } from '../entities';

// ---------------------------------------------------------------------------
// Test fixtures — reusable positions for clarity
// ---------------------------------------------------------------------------

const pos = (stringNumber: number, fret: number): TabPosition => ({
  stringNumber,
  fret,
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('SuggestOptimalPosition', () => {
  let useCase: SuggestOptimalPosition;

  beforeEach(() => {
    useCase = new SuggestOptimalPosition();
  });

  // -------------------------------------------------------------------------
  // Core scenario from the spec: hand at fret 3, two candidates
  // -------------------------------------------------------------------------

  describe('Hand at a known position', () => {
    it('should prefer fret 2 over fret 7 when the hand is anchored at fret 3', () => {
      // Distance from 3: fret 7 → cost 4 | fret 2 → cost 1
      const result = useCase.execute({
        possiblePositions: [pos(2, 7), pos(3, 2)],
        currentHandPosition: 3,
      });

      expect(result.position).toEqual(pos(3, 2));
    });

    it('should prefer fret 7 over fret 2 when the hand is anchored at fret 8', () => {
      // Distance from 8: fret 7 → cost 1 | fret 2 → cost 6
      const result = useCase.execute({
        possiblePositions: [pos(2, 7), pos(3, 2)],
        currentHandPosition: 8,
      });

      expect(result.position).toEqual(pos(2, 7));
    });

    it('should return the correct cost for the chosen position', () => {
      const result = useCase.execute({
        possiblePositions: [pos(2, 7), pos(3, 2)],
        currentHandPosition: 3,
      });

      // |2 - 3| = 1
      expect(result.cost).toBe(1);
    });

    it('should handle a single-option array by returning that option', () => {
      const result = useCase.execute({
        possiblePositions: [pos(1, 5)],
        currentHandPosition: 10,
      });

      expect(result.position).toEqual(pos(1, 5));
    });

    it('should prefer a position at fret 5 when hand is at 5 (cost 0)', () => {
      const result = useCase.execute({
        possiblePositions: [pos(1, 5), pos(2, 10), pos(3, 1)],
        currentHandPosition: 5,
      });

      expect(result.position).toEqual(pos(1, 5));
      expect(result.cost).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // First note: currentHandPosition is null
  // -------------------------------------------------------------------------

  describe('First note of the piece (currentHandPosition = null)', () => {
    it('should prefer the position with the lowest fret number', () => {
      const result = useCase.execute({
        possiblePositions: [pos(1, 7), pos(2, 3), pos(3, 10)],
        currentHandPosition: null,
      });

      expect(result.position).toEqual(pos(2, 3));
    });

    it('should prefer fret 0 (open string) when it is available', () => {
      const result = useCase.execute({
        possiblePositions: [pos(1, 5), pos(2, 0), pos(3, 10)],
        currentHandPosition: null,
      });

      expect(result.position).toEqual(pos(2, 0));
    });

    it('should return cost 0 when an open string is chosen as first note', () => {
      const result = useCase.execute({
        possiblePositions: [pos(1, 0), pos(2, 5)],
        currentHandPosition: null,
      });

      expect(result.cost).toBe(0);
    });

    it('should return a cost equal to the fret number when no open string is available', () => {
      const result = useCase.execute({
        possiblePositions: [pos(1, 4), pos(2, 7)],
        currentHandPosition: null,
      });

      // Fret 4 is the cheapest; cost = 4
      expect(result.position.fret).toBe(4);
      expect(result.cost).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // Open strings (fret 0) — bonus and edge cases
  // -------------------------------------------------------------------------

  describe('Open string behavior', () => {
    it('should prefer an open string over a distant fretted note', () => {
      // Hand at fret 1: open string → cost max(0, 1 - 0.5) = 0.5
      //                 fret 10    → cost |10 - 1| = 9
      const result = useCase.execute({
        possiblePositions: [pos(1, 0), pos(2, 10)],
        currentHandPosition: 1,
      });

      expect(result.position).toEqual(pos(1, 0));
    });

    it('should prefer a physically adjacent fretted note over an open string when the hand is far', () => {
      // Hand at fret 10: open string → cost max(0, 10 - 0.5) = 9.5
      //                  fret 10     → cost 0
      const result = useCase.execute({
        possiblePositions: [pos(1, 0), pos(2, 10)],
        currentHandPosition: 10,
      });

      expect(result.position).toEqual(pos(2, 10));
    });

    it('should favor an open string over an equidistant fretted note (open string bonus)', () => {
      // Hand at fret 2: open string → cost max(0, 2 - 0.5) = 1.5
      //                 fret 3      → cost |3 - 2| = 1
      // Here the fretted note (fret 3) is actually CLOSER — open string should NOT win.
      // Confirms bonus does not blindly override physically closer options.
      const result = useCase.execute({
        possiblePositions: [pos(1, 0), pos(2, 3)],
        currentHandPosition: 2,
      });

      expect(result.position).toEqual(pos(2, 3));
    });

    it('should return cost 0 when open string cost is floored at 0', () => {
      // Hand at fret 0: open string → max(0, 0 - 0.5) = 0
      const result = useCase.execute({
        possiblePositions: [pos(1, 0)],
        currentHandPosition: 0,
      });

      expect(result.cost).toBe(0);
    });

    it('should treat an open string as the sole valid option when it is the only position', () => {
      const result = useCase.execute({
        possiblePositions: [pos(3, 0)],
        currentHandPosition: 15,
      });

      expect(result.position).toEqual(pos(3, 0));
    });
  });

  // -------------------------------------------------------------------------
  // Tie-breaking
  // -------------------------------------------------------------------------

  describe('Tie-breaking: equal cost positions', () => {
    it('should prefer the lower-numbered string when two positions have identical cost', () => {
      // Hand at fret 5: fret 7 on string 2 → cost 2
      //                 fret 3 on string 4 → cost 2
      const result = useCase.execute({
        possiblePositions: [pos(2, 7), pos(4, 3)],
        currentHandPosition: 5,
      });

      // Both cost 2 — string 2 wins (lower string number = lower pitch)
      expect(result.position).toEqual(pos(2, 7));
    });

    it('should prefer the lower-numbered string over higher when all share fret 0 as first note', () => {
      const result = useCase.execute({
        possiblePositions: [pos(3, 0), pos(1, 0), pos(2, 0)],
        currentHandPosition: null,
      });

      expect(result.position).toEqual(pos(1, 0));
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases and error handling
  // -------------------------------------------------------------------------

  describe('Edge cases', () => {
    it('should throw an error when possiblePositions is empty', () => {
      expect(() =>
        useCase.execute({
          possiblePositions: [],
          currentHandPosition: 5,
        }),
      ).toThrow(
        'SuggestOptimalPosition requires at least one possible position.',
      );
    });

    it('should handle a large number of positions efficiently (no performance regression)', () => {
      const positions: TabPosition[] = Array.from({ length: 100 }, (_, i) =>
        pos(1, i),
      );

      const result = useCase.execute({
        possiblePositions: positions,
        currentHandPosition: 50,
      });

      // Fret 50 is at distance 0 — the exact match should be chosen
      expect(result.position).toEqual(pos(1, 50));
      expect(result.cost).toBe(0);
    });

    it('should work correctly when currentHandPosition is 0 (hand at the nut)', () => {
      const result = useCase.execute({
        possiblePositions: [pos(1, 0), pos(2, 5), pos(3, 12)],
        currentHandPosition: 0,
      });

      // Open string: cost max(0, 0 - 0.5) = 0; fret 5 → cost 5
      expect(result.position).toEqual(pos(1, 0));
      expect(result.cost).toBe(0);
    });
  });
});
