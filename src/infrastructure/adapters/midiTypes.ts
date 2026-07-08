/**
 * Tipos estruturais que descrevem o payload JSON simulado
 * que um parser MIDI (ex: @tonejs/midi) entregaria.
 *
 * Estes tipos vivem na infraestrutura porque descrevem um
 * formato externo — jamais devem vazar para o domínio ou
 * para a camada de aplicação.
 */

/**
 * Representa uma única nota dentro de uma track MIDI.
 *
 * Suporta dois formatos de identificação de pitch (mutuamente exclusivos):
 * - `midi`: número MIDI absoluto (padrão GM — C4 = 60).
 * - `name`: string no formato científico (ex: "E1", "A#2", "C#3").
 *
 * Pelo menos um dos dois deve estar presente. Se ambos estiverem,
 * `midi` tem precedência.
 */
export interface RawMidiNote {
  /** Número MIDI absoluto da nota (0–127). C4 = 60, E1 = 28. */
  readonly midi?: number;
  /**
   * Nome da nota no formato científico: Pitch + Oitava.
   * Exemplos válidos: "E1", "A#2", "C#3", "B0", "G2".
   */
  readonly name?: string;
  /**
   * Instante de início da nota em segundos a partir do início da música.
   * Notas com o mesmo `time` são consideradas simultâneas (acorde).
   */
  readonly time: number;
  /** Duração da nota em segundos. */
  readonly duration: number;
  /** Velocidade de ataque MIDI (0–127). Opcional. */
  readonly velocity?: number;
}

/**
 * Representa uma track (faixa) dentro do arquivo MIDI.
 */
export interface RawMidiTrack {
  /** Nome descritivo da track (ex: "Bass", "Guitar"). Opcional. */
  readonly name?: string;
  /** Array de notas desta track. */
  readonly notes: readonly RawMidiNote[];
}

/**
 * Representa o payload JSON completo do arquivo MIDI parseado.
 * Estrutura equivalente à saída do @tonejs/midi.
 */
export interface RawMidiPayload {
  /** Tempo em BPM. Opcional — não usado nesta iteração. */
  readonly bpm?: number;
  /** Array de tracks (faixas) do arquivo MIDI. */
  readonly tracks: readonly RawMidiTrack[];
}
