-- ============================================================
-- Student Management Dashboard - PostgreSQL schema (Neon / Supabase / Vercel Postgres)
-- Safe to re-run: everything uses IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- The first admin is created with:  npm run admin:create
-- ============================================================

CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  full_name     VARCHAR(100) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ  NULL
);

CREATE TABLE IF NOT EXISTS "groups" (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_groups_name ON "groups" (lower(name));

CREATE TABLE IF NOT EXISTS students (
  id            SERIAL PRIMARY KEY,
  student_code  VARCHAR(20)  NULL UNIQUE,
  name          VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  group_id      INTEGER      NOT NULL REFERENCES "groups"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  score         SMALLINT     NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  avatar        VARCHAR(16)  NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_name ON students (lower(name));
CREATE INDEX IF NOT EXISTS idx_students_group ON students (group_id);
CREATE INDEX IF NOT EXISTS idx_students_score ON students (score);

CREATE TABLE IF NOT EXISTS login_logs (
  id         BIGSERIAL PRIMARY KEY,
  role       VARCHAR(10)  NOT NULL CHECK (role IN ('admin', 'student')),
  user_id    INTEGER      NULL,
  username   VARCHAR(120) NOT NULL,
  ip_address VARCHAR(45)  NOT NULL,
  user_agent VARCHAR(255) NULL,
  success    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logs_throttle ON login_logs (ip_address, role, success, created_at);
CREATE INDEX IF NOT EXISTS idx_logs_created ON login_logs (created_at);

-- ============================================================
-- SAMPLE DATA (same 4 groups / 7 students as the original dashboard)
-- Every sample student has the temporary password:  Student@2026
-- Delete these rows (or change the passwords from the dashboard) before going live.
-- ============================================================
INSERT INTO "groups" (id, name) VALUES
  (1, 'مجموعة أ'),
  (2, 'مجموعة ب'),
  (3, 'مجموعة ج'),
  (4, 'مجموعات التفوق')
ON CONFLICT DO NOTHING;

INSERT INTO students (id, student_code, name, password_hash, group_id, score, avatar) VALUES
  (1, 'STD-101', 'عمر خالد العتيبي',     '$2b$12$r0u/C.mC9MctKJDsKQ2dOeIDp.h1BXAUIxV/DcbBwmedJ8J93n37m', 1, 98, '👨‍🎓'),
  (2, 'STD-102', 'سارة أحمد الزهراني',   '$2b$12$r0u/C.mC9MctKJDsKQ2dOeIDp.h1BXAUIxV/DcbBwmedJ8J93n37m', 2, 94, '👩‍🎓'),
  (3, 'STD-103', 'يوسف محمود الدوسري',   '$2b$12$r0u/C.mC9MctKJDsKQ2dOeIDp.h1BXAUIxV/DcbBwmedJ8J93n37m', 1, 89, '👨‍💻'),
  (4, 'STD-104', 'فاطمة إبراهيم الشمري', '$2b$12$r0u/C.mC9MctKJDsKQ2dOeIDp.h1BXAUIxV/DcbBwmedJ8J93n37m', 4, 96, '👩‍🔬'),
  (5, 'STD-105', 'عبدالله محمد السعيد',  '$2b$12$r0u/C.mC9MctKJDsKQ2dOeIDp.h1BXAUIxV/DcbBwmedJ8J93n37m', 3, 78, '👦'),
  (6, 'STD-106', 'ريم علي المطيري',      '$2b$12$r0u/C.mC9MctKJDsKQ2dOeIDp.h1BXAUIxV/DcbBwmedJ8J93n37m', 2, 83, '👧'),
  (7, 'STD-107', 'حسان سعد القحطاني',    '$2b$12$r0u/C.mC9MctKJDsKQ2dOeIDp.h1BXAUIxV/DcbBwmedJ8J93n37m', 3, 65, '👨‍🎓')
ON CONFLICT DO NOTHING;

-- Rows above were inserted with explicit ids, so move the sequences past them.
SELECT setval(pg_get_serial_sequence('"groups"', 'id'),   GREATEST((SELECT COALESCE(MAX(id), 1) FROM "groups"), 1));
SELECT setval(pg_get_serial_sequence('students', 'id'),   GREATEST((SELECT COALESCE(MAX(id), 1) FROM students), 1));
