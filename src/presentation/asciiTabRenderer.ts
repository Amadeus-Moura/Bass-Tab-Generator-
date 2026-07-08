import { Tablature, TablatureStep } from '../domain/entities';
import { noteToSemitone } from '../domain/utils/noteConverter';

/**
 * Controls what is printed in each cell of the tab.
 *
 * - `'frets'`  — prints the fret number (default). Ex: `0`, `5`, `12`
 * - `'notes'`  — prints the note pitch name.      Ex: `E`, `A#`, `C#`
 */
export type DisplayMode = 'frets' | 'notes';

/**
 * Configuration options for the ASCII renderer.
 */
export interface RendererOptions {
  /**
   * What to display in each cell.
   * @default 'frets'
   */
  displayMode?: DisplayMode;
}

/**
 * Presentation layer — renders a Tablature entity as a classic ASCII tab string.
 *
 * ## Output format (4-string, frets mode)
 *
 *   Bass Tab — 4 strings (EADG)
 *   ════════════════════════════════════
 *   G|------2---5---12-----------|
 *   D|--0-----------0---5--------|
 *   A|-0--------------------------|
 *   E|----------------------------|
 *
 * ## Output format (4-string, notes mode)
 *
 *   Bass Tab — 4 strings (EADG)  [notes]
 *   ════════════════════════════════════
 *   G|------D---G---E-----------|
 *   D|--D-----------D---G-------|
 *   A|-E--------------------------|
 *   E|----------------------------|
 *
 * ## Alignment guarantee
 *
 * Each column (one per TablatureStep) has a uniform width across all string
 * lines, calculated as: `max(cellContent.length, 1) + 1` (one leading dash).
 * This ensures columns stay aligned even when mixing single-char frets (e.g.
 * `5`) with double-char content (e.g. `12` or `A#`).
 */
export class AsciiTabRenderer {
  /** Trailing dashes appended after the last note on every line. */
  private static readonly TRAIL = 2;

  /**
   * Renders a complete Tablature as a multi-line ASCII tab string.
   *
   * @param tablature - The resolved tablature to render.
   * @param options   - Optional render configuration.
   * @returns A formatted ASCII tab string ready for `console.log`.
   */
  static render(tablature: Tablature, options: RendererOptions = {}): string {
    const { displayMode = 'frets' } = options;
    const { instrument, steps } = tablature;

    // Build display order: highest pitch on top (standard tab convention).
    const displayStrings = [...instrument.openStrings]
      .map((note, index) => ({ note, stringNumber: index + 1 }))
      .sort((a, b) => noteToSemitone(b.note) - noteToSemitone(a.note));

    // Max label width for clean alignment ("E" = 1, "A#" = 2).
    const maxLabelLen = Math.max(...displayStrings.map((s) => s.note.pitch.length));

    // Accumulate column segments for each display line.
    const lineBuffers: string[] = displayStrings.map(() => '');

    for (const step of steps) {
      const cellContent = AsciiTabRenderer.resolveCellContent(step, displayMode);
      const colWidth = cellContent.length + 1; // 1 leading dash + content

      displayStrings.forEach((ds, lineIdx) => {
        if (ds.stringNumber === step.position.stringNumber) {
          lineBuffers[lineIdx] += `-${cellContent}`;
        } else {
          // Fill with dashes of the same column width to keep alignment.
          lineBuffers[lineIdx] += '-'.repeat(colWidth);
        }
      });
    }

    // Build header.
    const tuningLabel = [...instrument.openStrings].map((n) => n.pitch).join('');
    const modeLabel = displayMode === 'notes' ? '  [notes]' : '';
    const header = [
      `Bass Tab — ${instrument.stringCount} strings (${tuningLabel})${modeLabel}`,
      '═'.repeat(36),
    ].join('\n');

    // Build tab lines with string label and framing pipes.
    const trail = '-'.repeat(AsciiTabRenderer.TRAIL);
    const tabLines = displayStrings.map((ds, i) => {
      const label = ds.note.pitch.padEnd(maxLabelLen, ' ');
      return `${label}|${lineBuffers[i]}${trail}|`;
    });

    return [header, ...tabLines].join('\n');
  }

  /**
   * Resolves the string content to print inside a cell for a given step.
   *
   * - `'frets'` mode → fret number as string (e.g. `"0"`, `"12"`)
   * - `'notes'` mode → pitch of the note (e.g. `"E"`, `"A#"`, `"C#"`)
   *
   * @param step        - The TablatureStep for this column.
   * @param displayMode - The current render mode.
   */
  private static resolveCellContent(
    step: TablatureStep,
    displayMode: DisplayMode,
  ): string {
    if (displayMode === 'notes') {
      return step.note.pitch; // e.g. "E", "A#", "C#"
    }
    return step.position.fret.toString(); // e.g. "0", "5", "12"
  }
}
