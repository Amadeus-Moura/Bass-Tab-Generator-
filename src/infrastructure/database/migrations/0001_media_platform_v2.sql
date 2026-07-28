-- ============================================================
-- Migration: 0001_media_platform_v2.sql
-- Evolução: Bass Tab Platform → Media Processing Platform
--
-- Mudanças:
--   1. Novos ENUMs: media_type, retention_policy, job_type
--   2. Renomeia audio_files → media_files
--   3. Adiciona colunas em media_files: media_type, retention_policy,
--      youtube_url, thumbnail_url
--   4. Adiciona coluna source_url na tabela songs
--   5. Renomeia audio_file_id → media_file_id em processing_jobs
--   6. Adiciona coluna job_type em processing_jobs
-- ============================================================

-- 1. Novos ENUMs ──────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "media_type" AS ENUM ('audio', 'video');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "retention_policy" AS ENUM ('temporary', 'permanent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "job_type" AS ENUM (
    'generate_tab',
    'download_audio',
    'download_video',
    'transcription'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Renomeia audio_files → media_files ───────────────────────

ALTER TABLE "audio_files" RENAME TO "media_files";

-- Atualiza constraints que referenciam o nome antigo
ALTER TABLE "media_files" RENAME CONSTRAINT "audio_files_pkey" TO "media_files_pkey";
ALTER TABLE "media_files" RENAME CONSTRAINT "audio_files_song_id_songs_id_fk"
  TO "media_files_song_id_songs_id_fk";
ALTER INDEX IF EXISTS "audio_files_storage_path_unique"
  RENAME TO "media_files_storage_path_unique";

-- Atualiza FK em processing_jobs que aponta para audio_files
ALTER TABLE "processing_jobs"
  RENAME CONSTRAINT "processing_jobs_audio_file_id_audio_files_id_fk"
  TO "processing_jobs_media_file_id_media_files_id_fk";

-- 3. Novas colunas em media_files ─────────────────────────────

ALTER TABLE "media_files"
  -- media_type: 'audio' padrão (retrocompatível com uploads antigos)
  ADD COLUMN IF NOT EXISTS "media_type"        "media_type"       NOT NULL DEFAULT 'audio',

  -- retention_policy: 'permanent' padrão (arquivos antigos são mantidos)
  ADD COLUMN IF NOT EXISTS "retention_policy"  "retention_policy" NOT NULL DEFAULT 'permanent',

  -- youtube_url: URL original do YouTube, se aplicável
  ADD COLUMN IF NOT EXISTS "youtube_url"       text,

  -- thumbnail_url: thumbnail para exibição na biblioteca
  ADD COLUMN IF NOT EXISTS "thumbnail_url"     text;

-- file_size_bytes e storage_path agora podem ser NULL
-- (arquivo deletado após processamento temporário)
ALTER TABLE "media_files"
  ALTER COLUMN "file_size_bytes" DROP NOT NULL,
  ALTER COLUMN "storage_path"    DROP NOT NULL;

-- 4. Nova coluna source_url em songs ──────────────────────────

ALTER TABLE "songs"
  ADD COLUMN IF NOT EXISTS "source_url" text;

-- 5. Renomeia audio_file_id → media_file_id em processing_jobs ─

ALTER TABLE "processing_jobs"
  RENAME COLUMN "audio_file_id" TO "media_file_id";

-- 6. Nova coluna job_type em processing_jobs ──────────────────

ALTER TABLE "processing_jobs"
  ADD COLUMN IF NOT EXISTS "job_type" "job_type" NOT NULL DEFAULT 'generate_tab';

-- 7. Novo índice por job_type ─────────────────────────────────

CREATE INDEX IF NOT EXISTS "idx_jobs_type" ON "processing_jobs" ("job_type");

-- ============================================================
-- Rollback (execute manualmente se necessário):
--
-- ALTER TABLE "processing_jobs" DROP COLUMN IF EXISTS "job_type";
-- ALTER TABLE "processing_jobs" RENAME COLUMN "media_file_id" TO "audio_file_id";
-- ALTER TABLE "songs" DROP COLUMN IF EXISTS "source_url";
-- ALTER TABLE "media_files" DROP COLUMN IF EXISTS "thumbnail_url";
-- ALTER TABLE "media_files" DROP COLUMN IF EXISTS "youtube_url";
-- ALTER TABLE "media_files" DROP COLUMN IF EXISTS "retention_policy";
-- ALTER TABLE "media_files" DROP COLUMN IF EXISTS "media_type";
-- ALTER TABLE "media_files" RENAME TO "audio_files";
-- DROP TYPE IF EXISTS "job_type";
-- DROP TYPE IF EXISTS "retention_policy";
-- DROP TYPE IF EXISTS "media_type";
-- ============================================================
