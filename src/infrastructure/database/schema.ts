/**
 * Drizzle ORM Schema — Bass Tab Platform
 *
 * Tradução fiel do DDL do database_design.md.
 * Estratégia de JSONB para events (measures) e log_entries (processing_jobs):
 *   - Leitura do player em 1 query sem JOIN
 *   - GIN index para queries dentro do JSON
 *   - Schema documentado via tipos TypeScript abaixo
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  smallint,
  integer,
  bigint,
  doublePrecision,
  jsonb,
  char,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ── JSONB payload types (documentam os campos, não são runtime checks) ────────

export type LogEntry = {
  ts:       string;  // ISO8601
  stage:    string;
  message:  string;
  progress: number;  // 0–100
};

export type NoteEvent = {
  type:      'note';
  pitch:     string;   // ex: "F#"
  octave:    number;
  startTime: number;   // segundos
  duration:  number;   // segundos
  string:    number;   // 1–4 (1 = mais grave)
  fret:      number;   // 0–22
};

export type RestEvent = {
  type:      'rest';
  startTime: number;
  duration:  number;
};

export type MeasureEvent = NoteEvent | RestEvent;

// ── Enums ─────────────────────────────────────────────────────────────────────

export const jobStatusEnum  = pgEnum('job_status',   ['pending', 'running', 'done', 'error']);
export const displayModeEnum = pgEnum('display_mode', ['frets', 'notes']);

// ── USERS ─────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:          uuid('id').primaryKey().defaultRandom(),
  email:       varchar('email',        { length: 320 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  avatarUrl:   text('avatar_url'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── SONGS ─────────────────────────────────────────────────────────────────────

export const songs = pgTable(
  'songs',
  {
    id:              uuid('id').primaryKey().defaultRandom(),
    userId:          uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title:           varchar('title',   { length: 500 }).notNull(),
    artist:          varchar('artist',  { length: 500 }),
    album:           varchar('album',   { length: 500 }),
    durationSeconds: doublePrecision('duration_seconds'),
    originalFilename: varchar('original_filename', { length: 500 }).notNull(),
    createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_songs_user_id').on(t.userId),
    index('idx_songs_created').on(t.userId, t.createdAt),
  ],
);

// ── AUDIO FILES ───────────────────────────────────────────────────────────────

export const audioFiles = pgTable('audio_files', {
  id:            uuid('id').primaryKey().defaultRandom(),
  songId:        uuid('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
  storagePath:   varchar('storage_path', { length: 1000 }).notNull().unique(),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull(),
  mimeType:      varchar('mime_type', { length: 100 }).notNull().default('audio/mpeg'),
  uploadedAt:    timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── PROCESSING JOBS ───────────────────────────────────────────────────────────

export const processingJobs = pgTable(
  'processing_jobs',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    songId:       uuid('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
    audioFileId:  uuid('audio_file_id').references(() => audioFiles.id),
    status:       jobStatusEnum('status').notNull().default('pending'),
    progressPct:  smallint('progress_pct').notNull().default(0),
    currentStage: varchar('current_stage', { length: 200 }),
    // [{ts, stage, message, progress}]
    logEntries:   jsonb('log_entries').$type<LogEntry[]>().notNull().default(sql`'[]'::jsonb`),
    errorMessage: text('error_message'),
    startedAt:    timestamp('started_at',   { withTimezone: true }).notNull().defaultNow(),
    completedAt:  timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_jobs_song_id').on(t.songId),
    // Partial index — apenas jobs ativos (pequeno subconjunto)
    index('idx_jobs_active').on(t.status).where(sql`status IN ('pending', 'running')`),
  ],
);

// ── TABLATURES ────────────────────────────────────────────────────────────────

export const tablatures = pgTable(
  'tablatures',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    songId:       uuid('song_id').notNull().references(() => songs.id,          { onDelete: 'cascade' }),
    jobId:        uuid('job_id').notNull().references(() => processingJobs.id),
    tuning:       varchar('tuning', { length: 10 }).notNull().default('EADG'),
    stringCount:  smallint('string_count').notNull().default(4),
    fretCount:    smallint('fret_count').notNull().default(22),
    bpm:          doublePrecision('bpm').notNull(),
    totalNotes:   integer('total_notes').notNull(),
    totalMeasures: integer('total_measures').notNull(),
    version:      smallint('version').notNull().default(1),
    isLatest:     boolean('is_latest').notNull().default(true),
    createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('idx_tablatures_song_version').on(t.songId, t.version),
    // Partial index — só a versão mais recente (acesso mais frequente)
    index('idx_tablatures_latest').on(t.songId).where(sql`is_latest = true`),
  ],
);

// ── MEASURES ──────────────────────────────────────────────────────────────────

export const measures = pgTable(
  'measures',
  {
    id:            uuid('id').primaryKey().defaultRandom(),
    tablatureId:   uuid('tablature_id').notNull().references(() => tablatures.id, { onDelete: 'cascade' }),
    measureNumber: smallint('measure_number').notNull(),
    startTime:     doublePrecision('start_time').notNull(),
    duration:      doublePrecision('duration').notNull(),
    noteCount:     smallint('note_count').notNull().default(0),
    restCount:     smallint('rest_count').notNull().default(0),
    // Array de NoteEvent | RestEvent (ver tipos acima)
    events:        jsonb('events').$type<MeasureEvent[]>().notNull().default(sql`'[]'::jsonb`),
  },
  (t) => [
    uniqueIndex('idx_measures_tab_num').on(t.tablatureId, t.measureNumber),
    index('idx_measures_tablature').on(t.tablatureId),
    // GIN index para queries dentro do JSONB (ex: fret = 0, pitch = "E")
    index('idx_measures_events_gin').using('gin', t.events),
  ],
);

// ── TAGS & SONG_TAGS ──────────────────────────────────────────────────────────

export const tags = pgTable(
  'tags',
  {
    id:       uuid('id').primaryKey().defaultRandom(),
    userId:   uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name:     varchar('name', { length: 50 }).notNull(),
    colorHex: char('color_hex', { length: 7 }).notNull().default('#6366f1'),
  },
  (t) => [
    uniqueIndex('idx_tags_user_name').on(t.userId, t.name),
  ],
);

export const songTags = pgTable(
  'song_tags',
  {
    songId: uuid('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
    tagId:  uuid('tag_id').notNull().references(() => tags.id,   { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.songId, t.tagId] }),
  ],
);

// ── USER PREFERENCES ──────────────────────────────────────────────────────────

export const userPreferences = pgTable('user_preferences', {
  userId:        uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  defaultMode:   displayModeEnum('default_mode').notNull().default('frets'),
  pxPerSecond:   integer('px_per_second').notNull().default(160),
  tuningPreset:  varchar('tuning_preset', { length: 10 }).notNull().default('EADG'),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── RELATIONS (usadas pelo Drizzle para queries com joins tipados) ─────────────

export const usersRelations = relations(users, ({ many, one }) => ({
  songs:           many(songs),
  tags:            many(tags),
  preferences:     one(userPreferences, { fields: [users.id], references: [userPreferences.userId] }),
}));

export const songsRelations = relations(songs, ({ one, many }) => ({
  user:            one(users,           { fields: [songs.userId],  references: [users.id] }),
  audioFiles:      many(audioFiles),
  processingJobs:  many(processingJobs),
  tablatures:      many(tablatures),
  songTags:        many(songTags),
}));

export const audioFilesRelations = relations(audioFiles, ({ one }) => ({
  song:            one(songs, { fields: [audioFiles.songId], references: [songs.id] }),
}));

export const processingJobsRelations = relations(processingJobs, ({ one, many }) => ({
  song:            one(songs,       { fields: [processingJobs.songId],      references: [songs.id] }),
  audioFile:       one(audioFiles,  { fields: [processingJobs.audioFileId], references: [audioFiles.id] }),
  tablatures:      many(tablatures),
}));

export const tablaturesRelations = relations(tablatures, ({ one, many }) => ({
  song:            one(songs,          { fields: [tablatures.songId], references: [songs.id] }),
  job:             one(processingJobs, { fields: [tablatures.jobId],  references: [processingJobs.id] }),
  measures:        many(measures),
}));

export const measuresRelations = relations(measures, ({ one }) => ({
  tablature:       one(tablatures, { fields: [measures.tablatureId], references: [tablatures.id] }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  user:            one(users,    { fields: [tags.userId], references: [users.id] }),
  songTags:        many(songTags),
}));

export const songTagsRelations = relations(songTags, ({ one }) => ({
  song:            one(songs, { fields: [songTags.songId], references: [songs.id] }),
  tag:             one(tags,  { fields: [songTags.tagId],  references: [tags.id] }),
}));
