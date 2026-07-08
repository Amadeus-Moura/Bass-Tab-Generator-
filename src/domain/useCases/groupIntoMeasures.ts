import { Measure, MeasureEvent, Rest, TablatureStep } from '../entities';

/**
 * Input contract for the GroupIntoMeasures use case.
 */
export interface GroupIntoMeasuresInput {
  /** The flat, chronologically ordered list of resolved tablature steps. */
  readonly steps: readonly TablatureStep[];
  /**
   * Tempo in beats per minute. Used to compute measure duration.
   * Assumes a 4/4 time signature: one measure = 4 beats = 4 * (60/bpm) seconds.
   * @default 120
   */
  readonly bpm?: number;
  /**
   * Silence threshold in seconds. If the gap between the end of a note
   * and the start of the next is larger than this value, a Rest event
   * is inserted to represent the silence.
   * @default 0.05
   */
  readonly restThreshold?: number;
}

/**
 * Use Case: GroupIntoMeasures
 *
 * Takes a flat sequence of resolved TablatureSteps and buckets them into
 * musical measures (compassos), assuming a 4/4 time signature.
 *
 * ## Algorithm
 *
 * 1. Compute the duration of a single 4/4 measure from the BPM:
 *      measureDuration = 4 * (60 / bpm)
 *
 * 2. For each step, determine which measure it belongs to:
 *      measureIndex = floor(step.note.startTime / measureDuration)
 *
 * 3. Within each measure, scan consecutive steps. If the gap between
 *    the end of a step (startTime + duration) and the start of the next
 *    is greater than `restThreshold`, insert a Rest event to represent
 *    the silence.
 *
 * 4. Return an ordered array of Measure objects, each with its
 *    1-indexed measure number, startTime, duration, and events.
 *
 * ## Design note
 *
 * This use case is pure: it depends only on the timing data already
 * embedded in TimedNote (via TablatureStep.note). It has no I/O and
 * no side effects, making it trivially unit-testable.
 */
export class GroupIntoMeasures {
  private static readonly DEFAULT_BPM = 120;
  private static readonly DEFAULT_REST_THRESHOLD = 0.05;

  /**
   * Executes the grouping algorithm.
   *
   * @param input - Steps to group, BPM, and optional rest threshold.
   * @returns An ordered array of Measure objects.
   */
  execute(input: GroupIntoMeasuresInput): Measure[] {
    const {
      steps,
      bpm = GroupIntoMeasures.DEFAULT_BPM,
      restThreshold = GroupIntoMeasures.DEFAULT_REST_THRESHOLD,
    } = input;

    if (steps.length === 0) {
      return [];
    }

    // Duration of one 4/4 measure in seconds.
    const measureDuration = (4 * 60) / bpm;

    // Group steps by measure index.
    const buckets = new Map<number, TablatureStep[]>();

    for (const step of steps) {
      const measureIndex = Math.floor(step.note.startTime / measureDuration);
      if (!buckets.has(measureIndex)) {
        buckets.set(measureIndex, []);
      }
      buckets.get(measureIndex)!.push(step);
    }

    // Sort measure indices numerically to guarantee output order.
    const sortedIndices = [...buckets.keys()].sort((a, b) => a - b);

    const measures: Measure[] = sortedIndices.map((measureIndex) => {
      const measureSteps = buckets.get(measureIndex)!;
      const measureStart = measureIndex * measureDuration;

      const events = this.buildEvents(measureSteps, restThreshold);

      return {
        measureNumber: measureIndex + 1,
        startTime: measureStart,
        duration: measureDuration,
        events,
      };
    });

    return measures;
  }

  /**
   * Builds the ordered list of MeasureEvents for a given set of steps,
   * inserting Rest events wherever the gap between consecutive notes
   * exceeds the restThreshold.
   *
   * @param steps         - The steps in this measure (already ordered by startTime).
   * @param restThreshold - Gap size in seconds that triggers a Rest insertion.
   * @returns Ordered array of MeasureEvent (TablatureStep | Rest).
   */
  private buildEvents(
    steps: TablatureStep[],
    restThreshold: number,
  ): MeasureEvent[] {
    const events: MeasureEvent[] = [];

    for (let i = 0; i < steps.length; i++) {
      const current = steps[i];

      // Check gap before current step (relative to the previous note's end).
      if (i > 0) {
        const previous = steps[i - 1];
        const previousEnd = previous.note.startTime + previous.note.duration;
        const gap = current.note.startTime - previousEnd;

        if (gap > restThreshold) {
          const rest: Rest = {
            type: 'rest',
            startTime: previousEnd,
            duration: gap,
          };
          events.push(rest);
        }
      }

      events.push(current);
    }

    return events;
  }
}
