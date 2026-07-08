CREATE TYPE "public"."display_mode" AS ENUM('frets', 'notes');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'done', 'error');--> statement-breakpoint
CREATE TABLE "audio_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"storage_path" varchar(1000) NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"mime_type" varchar(100) DEFAULT 'audio/mpeg' NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audio_files_storage_path_unique" UNIQUE("storage_path")
);
--> statement-breakpoint
CREATE TABLE "measures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tablature_id" uuid NOT NULL,
	"measure_number" smallint NOT NULL,
	"start_time" double precision NOT NULL,
	"duration" double precision NOT NULL,
	"note_count" smallint DEFAULT 0 NOT NULL,
	"rest_count" smallint DEFAULT 0 NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"audio_file_id" uuid,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"progress_pct" smallint DEFAULT 0 NOT NULL,
	"current_stage" varchar(200),
	"log_entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "song_tags" (
	"song_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "song_tags_song_id_tag_id_pk" PRIMARY KEY("song_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"artist" varchar(500),
	"album" varchar(500),
	"duration_seconds" double precision,
	"original_filename" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tablatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"tuning" varchar(10) DEFAULT 'EADG' NOT NULL,
	"string_count" smallint DEFAULT 4 NOT NULL,
	"fret_count" smallint DEFAULT 22 NOT NULL,
	"bpm" double precision NOT NULL,
	"total_notes" integer NOT NULL,
	"total_measures" integer NOT NULL,
	"version" smallint DEFAULT 1 NOT NULL,
	"is_latest" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(50) NOT NULL,
	"color_hex" char(7) DEFAULT '#6366f1' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"default_mode" "display_mode" DEFAULT 'frets' NOT NULL,
	"px_per_second" integer DEFAULT 160 NOT NULL,
	"tuning_preset" varchar(10) DEFAULT 'EADG' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audio_files" ADD CONSTRAINT "audio_files_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measures" ADD CONSTRAINT "measures_tablature_id_tablatures_id_fk" FOREIGN KEY ("tablature_id") REFERENCES "public"."tablatures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_audio_file_id_audio_files_id_fk" FOREIGN KEY ("audio_file_id") REFERENCES "public"."audio_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_tags" ADD CONSTRAINT "song_tags_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_tags" ADD CONSTRAINT "song_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tablatures" ADD CONSTRAINT "tablatures_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tablatures" ADD CONSTRAINT "tablatures_job_id_processing_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."processing_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_measures_tab_num" ON "measures" USING btree ("tablature_id","measure_number");--> statement-breakpoint
CREATE INDEX "idx_measures_tablature" ON "measures" USING btree ("tablature_id");--> statement-breakpoint
CREATE INDEX "idx_measures_events_gin" ON "measures" USING gin ("events");--> statement-breakpoint
CREATE INDEX "idx_jobs_song_id" ON "processing_jobs" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_active" ON "processing_jobs" USING btree ("status") WHERE status IN ('pending', 'running');--> statement-breakpoint
CREATE INDEX "idx_songs_user_id" ON "songs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_songs_created" ON "songs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tablatures_song_version" ON "tablatures" USING btree ("song_id","version");--> statement-breakpoint
CREATE INDEX "idx_tablatures_latest" ON "tablatures" USING btree ("song_id") WHERE is_latest = true;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tags_user_name" ON "tags" USING btree ("user_id","name");