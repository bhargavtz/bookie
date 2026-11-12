CREATE TYPE "public"."admin_role" AS ENUM('owner', 'editor', 'reviewer');--> statement-breakpoint
CREATE TYPE "public"."asset_kind" AS ENUM('pdf', 'cover', 'thumbnail');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('uploading', 'processing', 'ready', 'rejected', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."book_level" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."book_status" AS ENUM('draft', 'in_review', 'published', 'unpublished', 'archived');--> statement-breakpoint
CREATE TYPE "public"."collection_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."download_outcome" AS ENUM('served', 'denied_policy', 'denied_rate_limit');--> statement-breakpoint
CREATE TYPE "public"."import_job_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."license_type" AS ENUM('project-original', 'public-domain', 'cc-by', 'cc-by-sa', 'cc-by-nc', 'publisher-permission', 'author-permission', 'other');--> statement-breakpoint
CREATE TYPE "public"."rights_status" AS ENUM('pending', 'approved', 'restricted', 'removed');--> statement-breakpoint
CREATE TYPE "public"."storage_driver" AS ENUM('local', 's3');--> statement-breakpoint
CREATE TYPE "public"."takedown_status" AS ENUM('open', 'under_review', 'upheld', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_hash" text,
	"ua_family" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_sessions_token_hash_ck" CHECK ("admin_sessions"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "admin_role" DEFAULT 'editor' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_lowercase_ck" CHECK ("admin_users"."email" = lower("admin_users"."email"))
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"storage_driver" "storage_driver" NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256" varchar(64),
	"page_count" integer,
	"status" "asset_status" DEFAULT 'uploading' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_sha256_format_ck" CHECK ("assets"."sha256" is null or "assets"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "assets_byte_size_ck" CHECK ("assets"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"bio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_authors" (
	"book_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "book_authors_book_id_author_id_pk" PRIMARY KEY("book_id","author_id")
);
--> statement-breakpoint
CREATE TABLE "book_categories" (
	"book_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "book_categories_book_id_category_id_pk" PRIMARY KEY("book_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "book_tags" (
	"book_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "book_tags_book_id_tag_id_pk" PRIMARY KEY("book_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "book_technologies" (
	"book_id" uuid NOT NULL,
	"technology_id" uuid NOT NULL,
	CONSTRAINT "book_technologies_book_id_technology_id_pk" PRIMARY KEY("book_id","technology_id")
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"description" text,
	"search_text" text DEFAULT '' NOT NULL,
	"language" varchar(35) DEFAULT 'en' NOT NULL,
	"isbn13" varchar(13),
	"edition" text,
	"publisher" text,
	"published_year" integer,
	"page_count" integer,
	"level" "book_level",
	"status" "book_status" DEFAULT 'draft' NOT NULL,
	"primary_asset_id" uuid,
	"cover_asset_id" uuid,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', bookie_unaccent(coalesce("books"."title", ''))), 'A') || setweight(to_tsvector('english', bookie_unaccent(coalesce("books"."subtitle", '') || ' ' || coalesce("books"."search_text", ''))), 'B') || setweight(to_tsvector('english', bookie_unaccent(coalesce("books"."description", ''))), 'C')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "books_slug_format_ck" CHECK ("books"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "books_isbn13_format_ck" CHECK ("books"."isbn13" is null or "books"."isbn13" ~ '^[0-9]{13}$'),
	CONSTRAINT "books_page_count_ck" CHECK ("books"."page_count" is null or "books"."page_count" > 0),
	CONSTRAINT "books_published_year_ck" CHECK ("books"."published_year" is null or "books"."published_year" between 1000 and 2200)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"icon_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_books" (
	"collection_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "collection_books_collection_id_book_id_pk" PRIMARY KEY("collection_id","book_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"status" "collection_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technologies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"rights_status" "rights_status" DEFAULT 'pending' NOT NULL,
	"license_type" "license_type",
	"license_url" text,
	"rights_holder" text,
	"attribution_text" text,
	"source_url" text,
	"evidence_note" text,
	"allow_read" boolean DEFAULT false NOT NULL,
	"allow_download" boolean DEFAULT false NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"restricted_reason" text,
	"removed_at" timestamp with time zone,
	"removed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "licenses_restricted_no_download_ck" CHECK ("licenses"."rights_status" <> 'restricted' or "licenses"."allow_download" = false),
	CONSTRAINT "licenses_removed_no_access_ck" CHECK ("licenses"."rights_status" <> 'removed' or ("licenses"."allow_read" = false and "licenses"."allow_download" = false)),
	CONSTRAINT "licenses_approved_requires_evidence_ck" CHECK ("licenses"."rights_status" <> 'approved' or ("licenses"."approved_by" is not null and "licenses"."approved_at" is not null and "licenses"."rights_holder" is not null and "licenses"."license_type" is not null))
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reader_key" text NOT NULL,
	"book_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookmarks_page_ck" CHECK ("bookmarks"."page" >= 1)
);
--> statement-breakpoint
CREATE TABLE "reading_progress" (
	"reader_key" text NOT NULL,
	"book_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"total_pages" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_progress_reader_key_book_id_pk" PRIMARY KEY("reader_key","book_id"),
	CONSTRAINT "reading_progress_page_ck" CHECK ("reading_progress"."page" >= 1 and "reading_progress"."total_pages" >= "reading_progress"."page")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"diff" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "download_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid,
	"asset_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" "download_outcome" NOT NULL,
	"ip_hash" text,
	"ua_family" text,
	"referrer_host" text
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid,
	"filename" text NOT NULL,
	"status" "import_job_status" DEFAULT 'pending' NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"imported_rows" integer DEFAULT 0 NOT NULL,
	"failed_rows" integer DEFAULT 0 NOT NULL,
	"error_report" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "takedown_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid,
	"book_url" text,
	"claimant_name" text NOT NULL,
	"claimant_email" text NOT NULL,
	"organisation" text,
	"relationship" text NOT NULL,
	"description" text NOT NULL,
	"good_faith_confirmed" boolean NOT NULL,
	"signature" text NOT NULL,
	"status" "takedown_status" DEFAULT 'open' NOT NULL,
	"resolution_note" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "takedown_requests_good_faith_ck" CHECK ("takedown_requests"."good_faith_confirmed" = true)
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_authors" ADD CONSTRAINT "book_authors_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_authors" ADD CONSTRAINT "book_authors_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_categories" ADD CONSTRAINT "book_categories_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_categories" ADD CONSTRAINT "book_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_tags" ADD CONSTRAINT "book_tags_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_tags" ADD CONSTRAINT "book_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_technologies" ADD CONSTRAINT "book_technologies_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_technologies" ADD CONSTRAINT "book_technologies_technology_id_technologies_id_fk" FOREIGN KEY ("technology_id") REFERENCES "public"."technologies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_primary_asset_id_assets_id_fk" FOREIGN KEY ("primary_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_cover_asset_id_assets_id_fk" FOREIGN KEY ("cover_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_books" ADD CONSTRAINT "collection_books_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_books" ADD CONSTRAINT "collection_books_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_approved_by_admin_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_events" ADD CONSTRAINT "download_events_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_events" ADD CONSTRAINT "download_events_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD CONSTRAINT "takedown_requests_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD CONSTRAINT "takedown_requests_resolved_by_admin_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_hash_uq" ON "admin_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_sessions_user_idx" ON "admin_sessions" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "admin_sessions_expires_idx" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_uq" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_storage_key_uq" ON "assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "assets_book_idx" ON "assets" USING btree ("book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_pdf_sha256_uq" ON "assets" USING btree ("sha256") WHERE "assets"."kind" = 'pdf' and "assets"."status" <> 'deleted' and "assets"."sha256" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "authors_slug_uq" ON "authors" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "authors_name_trgm_gin" ON "authors" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "book_authors_author_idx" ON "book_authors" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "book_categories_category_idx" ON "book_categories" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "book_categories_one_primary_uq" ON "book_categories" USING btree ("book_id") WHERE "book_categories"."is_primary";--> statement-breakpoint
CREATE INDEX "book_tags_tag_idx" ON "book_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "book_technologies_tech_idx" ON "book_technologies" USING btree ("technology_id");--> statement-breakpoint
CREATE UNIQUE INDEX "books_slug_uq" ON "books" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "books_isbn13_uq" ON "books" USING btree ("isbn13") WHERE "books"."isbn13" is not null and "books"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "books_status_published_at_idx" ON "books" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "books_search_gin" ON "books" USING gin ("search");--> statement-breakpoint
CREATE INDEX "books_title_trgm_gin" ON "books" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_uq" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_uq" ON "categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX "collection_books_book_idx" ON "collection_books" USING btree ("book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_slug_uq" ON "collections" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_slug_uq" ON "tags" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "technologies_slug_uq" ON "technologies" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "technologies_aliases_gin" ON "technologies" USING gin ("aliases");--> statement-breakpoint
CREATE UNIQUE INDEX "licenses_book_uq" ON "licenses" USING btree ("book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookmarks_reader_book_page_uq" ON "bookmarks" USING btree ("reader_key","book_id","page");--> statement-breakpoint
CREATE INDEX "bookmarks_book_idx" ON "bookmarks" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "reading_progress_book_idx" ON "reading_progress" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_time_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "download_events_book_time_idx" ON "download_events" USING btree ("book_id","occurred_at");--> statement-breakpoint
CREATE INDEX "download_events_time_idx" ON "download_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "import_jobs_status_idx" ON "import_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "takedown_requests_status_idx" ON "takedown_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "takedown_requests_book_idx" ON "takedown_requests" USING btree ("book_id");