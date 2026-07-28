/**
 * Drizzle ORM Schema — Media Processing Platform
 *
 * Evoluções do schema original (v1 Bass Tab Platform → v2 Media Platform):
 * [NOVO] mediaTypeEnum    — 'audio' | 'video'
 * [NOVO] retentionEnum    — 'temporary' | 'permanent'
 * [NOVO] jobTypeEnum      — 'generate_tab' | 'download_audio' | 'download_video' | 'transcription'
 * [MUDOU] audio_files     → media_files  (+ media_type, retention_policy, youtube_url)
 * [MUDOU] processing_jobs → campo job_type adicionado
 */

import {
  pgTable, pgEnum, uuid, varchar, text, timestamp, boolean,
  smallint, integer, bigint, doublePrecision, jsonb, char,
  index, uniqueIndex, primaryKey,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ── JSONB payload types ───────────────────────────────────────────────────────

export type LogEntry = {
  ts: string; stage: string; message: string; progress: number;
};

export type NoteEvent = {
  type: 'note'; pitch: string; octave: number; startTime: number;
  duration: number; string: number; fret: number;
};

export type RestEvent = {
  type: 'rest'; startTime: number; duration: number;
};

export type MeasureEvent = NoteEvent | RestEvent;

// ── Enums ─────────────────────────────────────────────────────────────────────

export const jobStatusEnum   = pgEnum('job_status',       ['pending', 'running', 'done', 'error']);
export const displayModeEnum = pgEnum('display_mode',     ['frets', 'notes']);

/** [NOVO] Tipo de mídia armazenada no disco. */
export const mediaTypeEnum   = pgEnum('media_type',       ['audio', 'video']);

/**
 * [NOVO] Política de retenção do arquivo físico.
 * 'temporary'  → Node.js deleta o arquivo no bloco finally após processar.
 * 'permanent'  → Arquivo fica na biblioteca do usuário.
 */
export const retentionEnum   = pgEnum('retention_policy', ['temporary', 'permanent']);

/**
 * [NOVO] Tipo da tarefa — permite que processing_jobs suporte múltiplas intenções.
 */
export const jobTypeEnum     = pgEnum('job_type', [
  'generate_tab',   // Demucs → Basic Pitch → tablatura
  'download_audio', // Apenas baixar áudio (MP3) do YouTube
  'download_video', // Apenas baixar vídeo (MP4) do YouTube
  'transcription',  // Transcrição de voz/letra (expansão futura)
]);

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
    id:               uuid('id').primaryKey().defaultRandom(),
    userId:           uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title:            varchar('title',   { length: 500 }).notNull(),
    artist:           varchar('artist',  { length: 500 }),
    album:            varchar('album',   { length: 500 }),
    durationSeconds:  doublePrecision('duration_seconds'),
    originalFilename: varchar('original_filename', { length: 500 }).notNull(),
    /** [NOVO] URL de origem (YouTube ou outro), se aplicável. */
    sourceUrl:        text('source_url'),
    createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_songs_user_id').on(t.userId),
    index('idx_songs_created').on(t.userId, t.createdAt),
  ],
);

// ── MEDIA FILES (antigo: audio_files) ─────────────────────────────────────────

export const mediaFiles = pgTable('media_files', {
  id:          uuid('id').primaryKey().defaultRandom(),
  songId:      uuid('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),

  /**
   * Caminho do arquivo em disco (relativo a uploads/).
   * NULL quando retention_policy = 'temporary' e o arquivo foi deletado.
   */
  storagePath:     varchar('storage_path', { length: 1000 }).unique(),
  fileSizeBytes:   bigint('file_size_bytes', { mode: 'number' }),
  mimeType:        varchar('mime_type', { length: 100 }).notNull().default('audio/mpeg'),

  /** [NOVO] Formato da mídia: 'audio' (MP3/M4A) ou 'video' (MP4). */
  mediaType:       mediaTypeEnum('media_type').notNull().default('audio'),

  /**
   * [NOVO] Política de retenção.
   * O Node.js usa este campo no bloco `finally` para decidir se faz fs.unlink().
   */
  retentionPolicy: retentionEnum('retention_policy').notNull().default('permanent'),

  /** [NOVO] URL original do YouTube/outra plataforma. */
  youtubeUrl:      text('youtube_url'),

  /** [NOVO] Thumbnail do YouTube para exibição na biblioteca. */
  thumbnailUrl:    text('thumbnail_url'),

  uploadedAt:      timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── PROCESSING JOBS ───────────────────────────────────────────────────────────

export const processingJobs = pgTable(
  'processing_jobs',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    songId:       uuid('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),

    /** [MUDOU] Referência à tabela media_files (era audioFileId). */
    mediaFileId:  uuid('media_file_id').references(() => mediaFiles.id),

    /** [NOVO] Tipo de tarefa. Permite jobs além da tablatura. */
    jobType:      jobTypeEnum('job_type').notNull().default('generate_tab'),

    status:       jobStatusEnum('status').notNull().default('pending'),
    progressPct:  smallint('progress_pct').notNull().default(0),
    currentStage: varchar('current_stage', { length: 200 }),
    logEntries:   jsonb('log_entries').$type<LogEntry[]>().notNull().default(sql`'[]'::jsonb`),
    errorMessage: text('error_message'),
    startedAt:    timestamp('started_at',   { withTimezone: true }).notNull().defaultNow(),
    completedAt:  timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_jobs_song_id').on(t.songId),
    index('idx_jobs_type').on(t.jobType),
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
    events:        jsonb('events').$type<MeasureEvent[]>().notNull().default(sql`'[]'::jsonb`),
  },
  (t) => [
    uniqueIndex('idx_measures_tab_num').on(t.tablatureId, t.measureNumber),
    index('idx_measures_tablature').on(t.tablatureId),
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
  (t) => [uniqueIndex('idx_tags_user_name').on(t.userId, t.name)],
);

export const songTags = pgTable(
  'song_tags',
  {
    songId: uuid('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
    tagId:  uuid('tag_id').notNull().references(() => tags.id,   { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.songId, t.tagId] })],
);

// ── USER PREFERENCES ──────────────────────────────────────────────────────────

export const userPreferences = pgTable('user_preferences', {
  userId:       uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  defaultMode:  displayModeEnum('default_mode').notNull().default('frets'),
  pxPerSecond:  integer('px_per_second').notNull().default(160),
  tuningPreset: varchar('tuning_preset', { length: 10 }).notNull().default('EADG'),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── RELATIONS ─────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many, one }) => ({
  songs:       many(songs),
  tags:        many(tags),
  preferences: one(userPreferences, { fields: [users.id], references: [userPreferences.userId] }),
}));

export const songsRelations = relations(songs, ({ one, many }) => ({
  user:           one(users,           { fields: [songs.userId],  references: [users.id] }),
  mediaFiles:     many(mediaFiles),
  processingJobs: many(processingJobs),
  tablatures:     many(tablatures),
  songTags:       many(songTags),
}));

export const mediaFilesRelations = relations(mediaFiles, ({ one }) => ({
  song: one(songs, { fields: [mediaFiles.songId], references: [songs.id] }),
}));

export const processingJobsRelations = relations(processingJobs, ({ one, many }) => ({
  song:       one(songs,      { fields: [processingJobs.songId],      references: [songs.id] }),
  mediaFile:  one(mediaFiles, { fields: [processingJobs.mediaFileId], references: [mediaFiles.id] }),
  tablatures: many(tablatures),
}));

export const tablaturesRelations = relations(tablatures, ({ one, many }) => ({
  song:     one(songs,          { fields: [tablatures.songId], references: [songs.id] }),
  job:      one(processingJobs, { fields: [tablatures.jobId],  references: [processingJobs.id] }),
  measures: many(measures),
}));

export const measuresRelations = relations(measures, ({ one }) => ({
  tablature: one(tablatures, { fields: [measures.tablatureId], references: [tablatures.id] }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  user:     one(users, { fields: [tags.userId], references: [users.id] }),
  songTags: many(songTags),
}));

export const songTagsRelations = relations(songTags, ({ one }) => ({
  song: one(songs, { fields: [songTags.songId], references: [songs.id] }),
  tag:  one(tags,  { fields: [songTags.tagId],  references: [tags.id] }),
}));

// ── Compatibilidade retroativa ────────────────────────────────────────────────
/** @deprecated Use `mediaFiles`. Mantido enquanto server.ts é migrado. */
export const audioFiles = mediaFiles;
