CREATE SCHEMA IF NOT EXISTS api;

CREATE DOMAIN "application/epub+zip" AS bytea;
CREATE DOMAIN "application/pdf" AS bytea;
CREATE DOMAIN "text/plain" AS bytea;
CREATE DOMAIN "application/octet-stream" AS bytea;

CREATE TABLE api.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'Unknown',
  format TEXT NOT NULL CHECK (format IN ('epub', 'pdf', 'txt', 'text', 'md', 'markdown')),
  content BYTEA,
  size BIGINT NOT NULL DEFAULT 0,
  identifiers JSONB DEFAULT '{}',
  mtime BIGINT,
  indexed_at BIGINT NOT NULL
);

CREATE TABLE api.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE api.book_progress (
  profile_id UUID NOT NULL REFERENCES api.profiles(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES api.books(id) ON DELETE CASCADE,
  format TEXT NOT NULL,
  location JSONB DEFAULT '{}',
  percent REAL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (profile_id, book_id)
);

CREATE TABLE api.settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_books_fts
  ON api.books USING GIN (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(author, ''))
  );

CREATE OR REPLACE FUNCTION api.book_content(book_id UUID)
RETURNS bytea
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN (SELECT content FROM api.books WHERE id = book_id);
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA api TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA api TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA api TO anon;
GRANT EXECUTE ON FUNCTION api.book_content TO anon;
