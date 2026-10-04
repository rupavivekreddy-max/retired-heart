-- Retired Heart: Cloudflare D1 (SQLite) schema

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub  TEXT NOT NULL UNIQUE,
  username    TEXT UNIQUE COLLATE NOCASE,
    age         INTEGER,
  avatar      TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  lang        TEXT NOT NULL,
  body        TEXT NOT NULL,
  breaks      INTEGER NOT NULL DEFAULT 0,
  replies     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stories_top      ON stories(breaks DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_stories_new      ON stories(id DESC);
CREATE INDEX IF NOT EXISTS idx_stories_lang_top ON stories(lang, breaks DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_stories_lang_new ON stories(lang, id DESC);
CREATE INDEX IF NOT EXISTS idx_stories_user     ON stories(user_id, id DESC);

CREATE TABLE IF NOT EXISTS story_breaks (
  user_id   INTEGER NOT NULL,
  story_id  INTEGER NOT NULL,
  PRIMARY KEY (user_id, story_id)
);

CREATE TABLE IF NOT EXISTS replies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id    INTEGER NOT NULL REFERENCES stories(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  breaks      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_replies_story ON replies(story_id, breaks DESC, id ASC);
CREATE INDEX IF NOT EXISTS idx_replies_user  ON replies(story_id, user_id, id DESC);

CREATE TABLE IF NOT EXISTS reply_breaks (
  user_id   INTEGER NOT NULL,
  reply_id  INTEGER NOT NULL,
  PRIMARY KEY (user_id, reply_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  target_id   INTEGER NOT NULL,
  reason      TEXT,
  created_at  INTEGER NOT NULL,
  UNIQUE (user_id, kind, target_id)
);
