// Shared types mirrored from the backend src/presentation/jsonTabExporter.ts
// These match the structure of tab.json exactly.
//
// All exports use `export type` because this file contains only TypeScript
// type declarations (no runtime values). Required by verbatimModuleSyntax.

export type JsonNoteEvent = {
  type: 'note';
  pitch: string;
  octave: number;
  startTime: number;
  duration: number;
  string: number;
  fret: number;
};

export type JsonRestEvent = {
  type: 'rest';
  startTime: number;
  duration: number;
};

export type JsonEvent = JsonNoteEvent | JsonRestEvent;

export type JsonMeasure = {
  measureNumber: number;
  startTime: number;
  duration: number;
  events: JsonEvent[];
};

export type TabMeta = {
  tuning: string;
  stringCount: number;
  fretCount: number;
  bpm: number;
  totalNotes: number;
  totalMeasures: number;
};

export type TabJson = {
  meta: TabMeta;
  measures: JsonMeasure[];
};
