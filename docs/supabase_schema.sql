-- ============================================================
-- Instagram AI Agent — Supabase Schema
-- Run this entire file in: Supabase > SQL Editor > New Query
-- ============================================================

-- 1. Users table (for future auth)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Decision history — every AI analysis is stored here
CREATE TABLE IF NOT EXISTS decision_history (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  ai_score INT CHECK (ai_score >= 0 AND ai_score <= 100),
  decision TEXT CHECK (decision IN ('ACCEPT', 'REJECT', 'REVIEW')),
  reasoning JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. User settings
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  auto_accept BOOLEAN DEFAULT false,
  auto_reject BOOLEAN DEFAULT false,
  accept_threshold INT DEFAULT 70,
  reject_threshold INT DEFAULT 40,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_decision_history_username ON decision_history(username);
CREATE INDEX IF NOT EXISTS idx_decision_history_created ON decision_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_history_decision ON decision_history(decision);

-- Allow the backend service role to insert/select
ALTER TABLE decision_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Policy: service role can do anything (backend uses service role key)
CREATE POLICY "Service role full access on decision_history"
  ON decision_history
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on settings"
  ON settings
  FOR ALL
  USING (true)
  WITH CHECK (true);
