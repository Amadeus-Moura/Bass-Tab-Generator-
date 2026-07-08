import { TabPosition } from '../entities';

/**
 * Input contract for the SuggestOptimalPosition use case.
 */
export interface SuggestOptimalPositionInput {
  /**
   * All valid positions where the target note can be played.
   * Typically the output of MapNoteToFretboard.
   * Must contain at least one element.
   */
  readonly possiblePositions: readonly TabPosition[];
  /**
   * The fret number that represents the current anchor of the left hand.
   * Null when this is the first note of the piece (no prior hand position).
   */
  readonly currentHandPosition: number | null;
}

/**
 * Output contract for the SuggestOptimalPosition use case.
 */
export interface SuggestOptimalPositionOutput {
  /** The single best TabPosition to play given the current hand context. */
  readonly position: TabPosition;
  /**
   * The computed cost for the chosen position (lower = better ergonomics).
   * Useful for debugging, ranking, or future ML-based optimizations.
   */
  readonly cost: number;
}

/**
 * Use Case: SuggestOptimalPosition
 *
 * Given a set of physically valid positions for a note and the current
 * left-hand anchor on the fretboard, selects the ergonomically optimal
 * position — the one that minimizes the required hand shift.
 *
 * ## Cost Model
 *
 * ### When currentHandPosition is known:
 *   cost = |position.fret - currentHandPosition|
 *
 *   This is the absolute shift distance. A position at fret 2 when the
 *   hand is at fret 3 costs 1; a position at fret 12 costs 9.
 *
 *   Open strings (fret 0) receive a small flat bonus (OPEN_STRING_BONUS)
 *   subtracted from their cost, since they allow the fretting hand to
 *   rest or reposition without a physical press. However, they are NOT
 *   automatically preferred over physically adjacent fretted notes.
 *
 * ### When currentHandPosition is null (first note):
 *   cost = position.fret
 *
 *   We have no prior context, so we prefer positions closest to the
 *   headstock (lowest fret number). This reflects the ergonomic default
 *   of starting near the nut of the instrument.
 *
 * Tie-breaking rule: when two positions share the same cost, the one on
 * the lower-numbered string (lowest pitch) is preferred for consistency.
 */
export class SuggestOptimalPosition {
  /**
   * Ergonomic bonus applied to open strings (fret 0).
   * Reduces their effective cost by this amount, without forcing them
   * to always win over nearby fretted positions.
   */
  private static readonly OPEN_STRING_BONUS = 0.5;

  /**
   * Executes the use case.
   *
   * @param input - Possible positions and current hand context.
   * @returns The best position and its computed cost.
   * @throws {Error} If possiblePositions is empty.
   */
  execute(input: SuggestOptimalPositionInput): SuggestOptimalPositionOutput {
    const { possiblePositions, currentHandPosition } = input;

    if (possiblePositions.length === 0) {
      throw new Error(
        'SuggestOptimalPosition requires at least one possible position. ' +
          'Received an empty array — verify that the note is within the instrument range.',
      );
    }

    let bestPosition = possiblePositions[0];
    let bestCost = this.computeCost(possiblePositions[0], currentHandPosition);

    for (let i = 1; i < possiblePositions.length; i++) {
      const candidate = possiblePositions[i];
      const candidateCost = this.computeCost(candidate, currentHandPosition);

      const isCheaper = candidateCost < bestCost;
      const isTieWithLowerString =
        candidateCost === bestCost &&
        candidate.stringNumber < bestPosition.stringNumber;

      if (isCheaper || isTieWithLowerString) {
        bestPosition = candidate;
        bestCost = candidateCost;
      }
    }

    return { position: bestPosition, cost: bestCost };
  }

  /**
   * Computes the ergonomic cost of a single position given the hand context.
   *
   * @param position - The candidate TabPosition.
   * @param currentHandPosition - The current hand anchor, or null.
   * @returns A numeric cost value (lower = more ergonomic).
   */
  private computeCost(
    position: TabPosition,
    currentHandPosition: number | null,
  ): number {
    const isOpenString = position.fret === 0;

    if (currentHandPosition === null) {
      // First note: prefer positions closest to the headstock.
      // Open strings cost 0 (no fretting needed at all).
      return isOpenString ? 0 : position.fret;
    }

    // Shift distance from the current hand anchor.
    const shiftDistance = Math.abs(position.fret - currentHandPosition);

    // Apply open string bonus: slightly reduces cost but does not override
    // an adjacent fretted note that is equally or more convenient.
    return isOpenString
      ? Math.max(0, shiftDistance - SuggestOptimalPosition.OPEN_STRING_BONUS)
      : shiftDistance;
  }
}
