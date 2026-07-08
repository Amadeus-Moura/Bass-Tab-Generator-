import { TimedNote } from '../../domain/entities';

/**
 * Port (interface secundária de entrada) que define o contrato
 * para qualquer serviço capaz de extrair uma sequência de notas
 * a partir de uma fonte de dados externa.
 *
 * Esta interface vive na camada de Application para que o domínio
 * permaneça completamente isolado de qualquer infraestrutura.
 * Qualquer adaptador concreto (MIDI, MusicXML, CSV, áudio) deve
 * implementá-la — garantindo a Dependency Inversion Principle (DIP).
 *
 * @template TInput - O tipo de dado bruto aceito pelo extrator.
 */
export interface NoteExtractor<TInput = unknown> {
  /**
   * Extrai uma sequência ordenada de TimedNote[] a partir de
   * uma fonte de dados bruta.
   *
   * A sequência retornada deve ser:
   * - Ordenada cronologicamente (startTime crescente).
   * - Monofônica: no máximo uma nota por instante de tempo.
   *   Acordes e polifonias devem ser resolvidos pelo implementador.
   *
   * @param input - O dado bruto a ser convertido.
   * @returns Um array ordenado de TimedNote do domínio.
   */
  extract(input: TInput): TimedNote[];
}
