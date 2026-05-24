-- Protocol files: stored content hash for idempotent PUT.
--
-- The factory hook reconciles the full Library every session-start by PUT-ing
-- every local file. Without dedup, every session would bump updated_at and
-- log a protocol_file_published event on every file — noise that drowns real
-- changes. Storing a content hash lets the server skip the R2 write, the
-- updated_at bump, and the analytics event when content/visibility/text/
-- content_type all match what's already there.
--
-- Backfill is NULL — first PUT on each existing row computes and stores the
-- hash, no read-modify-write needed up front.

ALTER TABLE protocol_files
  ADD COLUMN content_hash TEXT;
