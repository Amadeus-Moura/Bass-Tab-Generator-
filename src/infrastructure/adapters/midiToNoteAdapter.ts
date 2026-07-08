import { TimedNote, Pitch } from '../../domain/entities';
import { NoteExtractor } from '../../application/ports/noteExtractor';
import { RawMidiNote, RawMidiPayload } from './midiTypes';

/**
 * Escala cromática indexada pelo número de semitom (0 = C, 11 = B).
 * Espelha a ordem do noteConverter.ts para consistência interna.
 */
const PITCH_FROM_SEMITONE: readonly Pitch[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];

/**
 * Regex para parsear nomes de nota no formato científico.
 * Captura grupos: pitch (ex: "A#") e oitava (ex: "2").
 * Exemplos válidos: "E1", "A#2", "C#3", "B0", "G2", "D#-1".
 */
const NOTE_NAME_REGEX = /^([A-G]#?)(-?\d+)$/;

/**
 * Infraestrutura — Adaptador de entrada.
 *
 * MidiToNoteAdapter implementa o port NoteExtractor<RawMidiPayload>,
 * convertendo um payload JSON estruturado (simulando a saída de um
 * parser MIDI como @tonejs/midi) para uma sequência ordenada e
 * monofônica de TimedNote[] do nosso domínio.
 *
 * ## Pipeline de transformação
 *
 * 1. **Flatten**: todas as tracks são mescladas em uma lista única
 *    de notas brutas — o usuário é responsável por pré-filtrar as
 *    tracks relevantes antes de chamar extract(), se necessário.
 *
 * 2. **Ordenação**: as notas são ordenadas pelo campo `time` (segundos).
 *
 * 3. **Agrupamento por tempo (chord detection)**: notas com o mesmo
 *    `time` (até a precisão configurada por TIME_EPSILON) são
 *    consideradas simultâneas.
 *
 * 4. **Filtragem monofônica**: de cada grupo simultâneo, apenas a
 *    nota de menor número MIDI (= menor pitch = nota mais grave) é
 *    retida. Isso representa a fundamental do acorde — o que um
 *    baixista tocaria na prática.
 *
 * 5. **Conversão**: cada nota sobrevivente é convertida para TimedNote
 *    do domínio via número MIDI ou nome científico, preservando
 *    `startTime` e `duration` do evento MIDI original.
 *
 * ## Dependency Inversion
 *
 * O adapter depende da interface NoteExtractor (abstração), não do
 * inverso — o domínio nunca depende deste arquivo.
 */
export class MidiToNoteAdapter implements NoteExtractor<RawMidiPayload> {
  /**
   * Janela de tolerância em segundos para considerar notas como
   * simultâneas. Necessária porque parsers MIDI podem introduzir
   * micro-variações de tempo (ex: 0.000001s de diferença).
   */
  private static readonly TIME_EPSILON = 0.001;

  /**
   * Extrai uma sequência monofônica e ordenada de TimedNote[] a partir
   * de um payload MIDI estruturado.
   *
   * @param input - O payload JSON do arquivo MIDI parseado.
   * @returns Array de TimedNote[], ordenado por startTime, sem polifonia.
   * @throws {Error} Se o payload não contiver nenhuma nota válida.
   */
  extract(input: RawMidiPayload): TimedNote[] {
    // 1. Flatten: todas as notas de todas as tracks em uma lista plana.
    const allRawNotes: RawMidiNote[] = input.tracks.flatMap(
      (track) => [...track.notes],
    );

    if (allRawNotes.length === 0) {
      return [];
    }

    // 2. Ordenação por tempo crescente.
    const sorted = [...allRawNotes].sort((a, b) => a.time - b.time);

    // 3 & 4. Agrupamento por tempo + filtragem monofônica.
    const monophonicRaw = this.applyMonophonicFilter(sorted);

    // 5. Conversão para entidades do domínio (com timing).
    return monophonicRaw.map((rawNote) => this.convertToTimedNote(rawNote));
  }

  /**
   * Aplica o filtro monofônico: agrupa notas simultâneas e retém
   * apenas a mais grave de cada grupo.
   *
   * @param sortedNotes - Notas já ordenadas por `time`.
   * @returns Lista de notas sem sobreposições temporais.
   */
  private applyMonophonicFilter(sortedNotes: RawMidiNote[]): RawMidiNote[] {
    const result: RawMidiNote[] = [];
    let i = 0;

    while (i < sortedNotes.length) {
      // Coleta todas as notas dentro da janela TIME_EPSILON a partir de sortedNotes[i].
      const groupStart = sortedNotes[i].time;
      const group: RawMidiNote[] = [sortedNotes[i]];

      let j = i + 1;
      while (
        j < sortedNotes.length &&
        sortedNotes[j].time - groupStart <= MidiToNoteAdapter.TIME_EPSILON
      ) {
        group.push(sortedNotes[j]);
        j++;
      }

      // Seleciona a nota mais grave do grupo (menor número MIDI absoluto).
      const lowest = this.selectLowestNote(group);
      result.push(lowest);

      i = j;
    }

    return result;
  }

  /**
   * Seleciona a nota de menor pitch (fundamental) de um grupo simultâneo.
   * Reduz o array para o elemento com o menor número MIDI resolvido.
   *
   * @param group - Grupo de notas simultâneas (≥ 1 elemento)
   * @returns A nota mais grave do grupo.
   */
  private selectLowestNote(group: RawMidiNote[]): RawMidiNote {
    return group.reduce((lowest, current) => {
      const lowestMidi = this.resolveMidiNumber(lowest);
      const currentMidi = this.resolveMidiNumber(current);
      return currentMidi < lowestMidi ? current : lowest;
    });
  }

  /**
   * Resolve o número MIDI absoluto de uma nota bruta.
   * Prioridade: campo `midi` > campo `name`.
   *
   * @throws {Error} Se nem `midi` nem `name` estiverem presentes ou forem válidos.
   */
  private resolveMidiNumber(rawNote: RawMidiNote): number {
    if (rawNote.midi !== undefined) {
      return rawNote.midi;
    }

    if (rawNote.name !== undefined) {
      return this.noteNameToMidi(rawNote.name);
    }

    throw new Error(
      `MidiToNoteAdapter: nota sem campo 'midi' nem 'name' ` +
        `(time: ${rawNote.time}s). Verifique o payload de entrada.`,
    );
  }

  /**
   * Converte uma nota bruta para a entidade TimedNote do domínio.
   * Usa o número MIDI resolvido como fonte única de verdade para pitch/octave.
   * Preserva `time` como `startTime` e `duration` diretamente.
   *
   * Fórmula padrão GM:
   *   pitch = MIDI % 12  → índice na escala cromática
   *   octave = floor(MIDI / 12) - 1  → oitava científica (C4 = oitava 4)
   *
   * @throws {Error} Se o número MIDI estiver fora do range 0–127.
   */
  private convertToTimedNote(rawNote: RawMidiNote): TimedNote {
    const midiNumber = this.resolveMidiNumber(rawNote);

    if (midiNumber < 0 || midiNumber > 127) {
      throw new Error(
        `MidiToNoteAdapter: número MIDI inválido: ${midiNumber}. ` +
          `O range válido é 0–127.`,
      );
    }

    const pitchIndex = midiNumber % 12;
    const octave = Math.floor(midiNumber / 12) - 1;
    const pitch = PITCH_FROM_SEMITONE[pitchIndex];

    return {
      pitch,
      octave,
      startTime: rawNote.time,
      duration: rawNote.duration,
    };
  }

  /**
   * Converte uma string no formato científico (ex: "E1", "A#2") para
   * o número MIDI absoluto equivalente.
   *
   * Fórmula inversa:
   *   midi = (octave + 1) * 12 + pitchIndex
   *
   * @throws {Error} Se o formato da string for inválido.
   * @throws {Error} Se o pitch da string não pertencer à escala cromática.
   */
  private noteNameToMidi(name: string): number {
    const match = NOTE_NAME_REGEX.exec(name.trim());

    if (!match) {
      throw new Error(
        `MidiToNoteAdapter: formato de nota inválido: "${name}". ` +
          `Esperado: Pitch + Oitava (ex: "E1", "A#2", "C#3").`,
      );
    }

    const pitchStr = match[1] as Pitch;
    const octave = parseInt(match[2], 10);
    const pitchIndex = PITCH_FROM_SEMITONE.indexOf(pitchStr);

    if (pitchIndex === -1) {
      throw new Error(
        `MidiToNoteAdapter: pitch desconhecido na nota "${name}": "${pitchStr}".`,
      );
    }

    return (octave + 1) * 12 + pitchIndex;
  }
}
