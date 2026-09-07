CREATE TYPE "public"."session_phase" AS ENUM('pre_workout', 'exercise', 'rest', 'stretch', 'post_workout');--> statement-breakpoint
CREATE TYPE "public"."session_source" AS ENUM('app', 'legacy_import');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('in_progress', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."task_key" AS ENUM('warm_up', 'main_workout', 'stretch');--> statement-breakpoint
CREATE TYPE "public"."weight_unit" AS ENUM('kg', 'lbs');--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"muscle_groups" text[] NOT NULL,
	"equipment" text,
	"form_tips" text,
	"video_url" text,
	"alternatives" text[] DEFAULT '{}' NOT NULL,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_fingerprint" text NOT NULL,
	"report" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"best_e1rm" numeric(6, 2) NOT NULL,
	"achieved_at" timestamp with time zone NOT NULL,
	"session_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"preferred_unit" "weight_unit" DEFAULT 'kg' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routine_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routine_days_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "routine_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routine_day_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"target_sets" integer NOT NULL,
	"target_reps" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"set_index" integer NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"weight_kg" numeric(6, 2),
	"reps" integer,
	"client_ts" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weight_sane" CHECK (weight_kg IS NULL OR (weight_kg >= 0 AND weight_kg <= 1000)),
	CONSTRAINT "reps_sane" CHECK (reps IS NULL OR (reps >= 0 AND reps <= 1000))
);
--> statement-breakpoint
CREATE TABLE "session_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"task_key" "task_key" NOT NULL,
	"completed_at" timestamp with time zone,
	"client_ts" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_mutations" (
	"mutation_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"routine_day_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"status" "session_status" DEFAULT 'in_progress' NOT NULL,
	"phase" "session_phase" DEFAULT 'pre_workout' NOT NULL,
	"source" "session_source" DEFAULT 'app' NOT NULL,
	"local_date" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"server_seq" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_owner_user_id_profiles_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_days" ADD CONSTRAINT "routine_days_owner_user_id_profiles_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_routine_day_id_routine_days_id_fk" FOREIGN KEY ("routine_day_id") REFERENCES "public"."routine_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_sets" ADD CONSTRAINT "session_sets_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_sets" ADD CONSTRAINT "session_sets_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_sets" ADD CONSTRAINT "session_sets_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_tasks" ADD CONSTRAINT "session_tasks_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_routine_day_id_routine_days_id_fk" FOREIGN KEY ("routine_day_id") REFERENCES "public"."routine_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_fingerprint" ON "import_batches" USING btree ("user_id","source_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_records_user_exercise" ON "personal_records" USING btree ("user_id","exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_exercises_day_order" ON "routine_exercises" USING btree ("routine_day_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "set_natural_key" ON "session_sets" USING btree ("session_id","exercise_id","set_index");--> statement-breakpoint
CREATE UNIQUE INDEX "session_tasks_natural_key" ON "session_tasks" USING btree ("session_id","task_key");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_session_per_day" ON "workout_sessions" USING btree ("user_id","routine_day_id","local_date") WHERE status = 'in_progress';--> statement-breakpoint
CREATE UNIQUE INDEX "session_client_id" ON "workout_sessions" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX "session_history" ON "workout_sessions" USING btree ("user_id","local_date" DESC);