-- ═══════════════════════════════════════════════════════════════
-- RFI System — TTT Land Reclamation
-- Supabase PostgreSQL Schema + RLS Policies
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── ENUM TYPES ─────────────────────────────────────────────────
CREATE TYPE rfi_status AS ENUM (
  'open', 'qc', 'consult', 'inspect', 'resubmit', 'reject', 'closed'
);

CREATE TYPE rfi_priority AS ENUM ('high', 'medium', 'low');

CREATE TYPE rfi_discipline AS ENUM ('CIV', 'STR', 'ARC', 'MEP', 'GEO');

CREATE TYPE user_role AS ENUM ('contractor', 'qc', 'consultant', 'pm', 'admin');

CREATE TYPE history_action AS ENUM (
  'submit', 'approve', 'reject', 'resubmit', 'inspect',
  'complete', 'close', 'comment'
);

-- ─── PROFILES TABLE ─────────────────────────────────────────────
-- Extends Supabase auth.users
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  role        user_role NOT NULL DEFAULT 'contractor',
  avatar      TEXT,         -- initials e.g. 'ส'
  color       TEXT,         -- hex color for avatar
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── RFI TABLE ──────────────────────────────────────────────────
CREATE TABLE rfis (
  id              TEXT PRIMARY KEY,    -- e.g. RFI-CIV-001
  type            TEXT NOT NULL,       -- Concrete Pouring
  discipline      rfi_discipline NOT NULL,
  location        TEXT NOT NULL,
  zone            TEXT,
  description     TEXT,
  status          rfi_status NOT NULL DEFAULT 'open',
  priority        rfi_priority NOT NULL DEFAULT 'medium',
  team            TEXT[] DEFAULT '{}',
  inspect_date    DATE,
  resubmit_count  INTEGER NOT NULL DEFAULT 0,
  requester_id    UUID NOT NULL REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-increment RFI ID per discipline
CREATE SEQUENCE rfi_civ_seq START 1;
CREATE SEQUENCE rfi_str_seq START 1;
CREATE SEQUENCE rfi_arc_seq START 1;
CREATE SEQUENCE rfi_mep_seq START 1;
CREATE SEQUENCE rfi_geo_seq START 1;

CREATE OR REPLACE FUNCTION generate_rfi_id(disc rfi_discipline)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  seq_val INTEGER;
BEGIN
  CASE disc
    WHEN 'CIV' THEN seq_val := nextval('rfi_civ_seq');
    WHEN 'STR' THEN seq_val := nextval('rfi_str_seq');
    WHEN 'ARC' THEN seq_val := nextval('rfi_arc_seq');
    WHEN 'MEP' THEN seq_val := nextval('rfi_mep_seq');
    WHEN 'GEO' THEN seq_val := nextval('rfi_geo_seq');
  END CASE;
  RETURN 'RFI-' || disc::TEXT || '-' || LPAD(seq_val::TEXT, 3, '0');
END;
$$;

-- ─── RFI HISTORY TABLE ──────────────────────────────────────────
CREATE TABLE rfi_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfi_id      TEXT NOT NULL REFERENCES rfis(id) ON DELETE CASCADE,
  action      history_action NOT NULL,
  user_id     UUID NOT NULL REFERENCES profiles(id),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── COMMENTS TABLE ─────────────────────────────────────────────
CREATE TABLE rfi_comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfi_id      TEXT NOT NULL REFERENCES rfis(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id),
  text        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'comment',  -- approve|reject|comment|resubmit
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ATTACHMENTS TABLE ──────────────────────────────────────────
CREATE TABLE rfi_attachments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfi_id        TEXT NOT NULL REFERENCES rfis(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  storage_path  TEXT NOT NULL,   -- path in Supabase Storage bucket
  file_size     INTEGER,
  uploaded_by   UUID NOT NULL REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── NOTIFICATIONS TABLE ────────────────────────────────────────
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rfi_id      TEXT REFERENCES rfis(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  icon        TEXT DEFAULT '📋',
  unread      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── SETTINGS TABLE ─────────────────────────────────────────────
CREATE TABLE settings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_name    TEXT NOT NULL DEFAULT 'TTT Land Reclamation',
  project_code    TEXT NOT NULL DEFAULT 'TTT-LR-2025',
  workflow_data   JSONB NOT NULL DEFAULT '{}',
  lead_times      JSONB NOT NULL DEFAULT '[]',
  disciplines     JSONB NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default settings
INSERT INTO settings (workflow_data, lead_times, disciplines) VALUES (
  '{"leadTimeDays": 3, "cutoffTime": "14:00", "maxResubmit": 3, "requireReason": true, "requireAttachment": false}',
  '[
    {"disc":"CIV","type":"Concrete Pouring","leadDays":3,"cutoff":"14:00","duration":90},
    {"disc":"STR","type":"Rebar Inspection","leadDays":2,"cutoff":"14:00","duration":45},
    {"disc":"ARC","type":"Facade Inspection","leadDays":2,"cutoff":"13:00","duration":60},
    {"disc":"MEP","type":"Pipe Installation","leadDays":3,"cutoff":"14:00","duration":90},
    {"disc":"GEO","type":"Foundation Testing","leadDays":5,"cutoff":"12:00","duration":180}
  ]',
  '{"CIV":{"color":"#5eaeff","active":true,"steps":["Open","QC L1","Consultant L2","Site Inspection","PM Verify","Closed"]},
    "STR":{"color":"#f07060","active":true,"steps":["Open","QC L1","Structural Review","Site Inspection","Closed"]},
    "ARC":{"color":"#3ecf8e","active":true,"steps":["Open","QC L1","Architect Review","Closed"]},
    "MEP":{"color":"#a78bfa","active":true,"steps":["Open","QC L1","MEP Specialist","Site Inspection","Closed"]},
    "GEO":{"color":"#f5c542","active":true,"steps":["Open","QC L1","Geotech Expert","Lab Test","Closed"]}}'
);

-- ─── INDEXES ────────────────────────────────────────────────────
CREATE INDEX idx_rfis_status ON rfis(status);
CREATE INDEX idx_rfis_discipline ON rfis(discipline);
CREATE INDEX idx_rfis_requester ON rfis(requester_id);
CREATE INDEX idx_rfis_created_at ON rfis(created_at DESC);
CREATE INDEX idx_rfi_history_rfi_id ON rfi_history(rfi_id);
CREATE INDEX idx_rfi_comments_rfi_id ON rfi_comments(rfi_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, unread);

-- ─── TRIGGERS ───────────────────────────────────────────────────
-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER rfis_updated_at BEFORE UPDATE ON rfis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'contractor')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfi_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfi_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfi_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role LANGUAGE sql STABLE AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- PROFILES: read all, write own
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- RFIs: all authenticated can read; contractors create; QC/consultant/PM update
CREATE POLICY "rfis_select" ON rfis FOR SELECT TO authenticated USING (true);
CREATE POLICY "rfis_insert" ON rfis FOR INSERT TO authenticated
  WITH CHECK (
    current_user_role() IN ('contractor', 'admin') AND
    requester_id = auth.uid()
  );
CREATE POLICY "rfis_update" ON rfis FOR UPDATE TO authenticated
  USING (
    current_user_role() IN ('qc', 'consultant', 'pm', 'admin') OR
    (current_user_role() = 'contractor' AND requester_id = auth.uid() AND status = 'reject')
  );

-- HISTORY: all read; system writes (via service role or trigger)
CREATE POLICY "history_select" ON rfi_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "history_insert" ON rfi_history FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- COMMENTS: all read; own insert
CREATE POLICY "comments_select" ON rfi_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "comments_insert" ON rfi_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ATTACHMENTS: all read; own insert
CREATE POLICY "attachments_select" ON rfi_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "attachments_insert" ON rfi_attachments FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

-- NOTIFICATIONS: own only
CREATE POLICY "notif_select_own" ON notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_update_own" ON notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_insert" ON notifications FOR INSERT TO authenticated WITH CHECK (true);

-- SETTINGS: all read; admin only write
CREATE POLICY "settings_select" ON settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_update" ON settings FOR UPDATE TO authenticated
  USING (current_user_role() = 'admin');

-- ─── STORAGE BUCKET ─────────────────────────────────────────────
-- Run in Supabase dashboard Storage tab or via API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('rfi-attachments', 'rfi-attachments', false);
-- CREATE POLICY "rfi_attachments_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'rfi-attachments');
-- CREATE POLICY "rfi_attachments_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'rfi-attachments');

-- ─── REALTIME ───────────────────────────────────────────────────
-- Enable realtime for these tables (run in Supabase dashboard > Database > Replication)
-- Or via SQL:
ALTER PUBLICATION supabase_realtime ADD TABLE rfis;
ALTER PUBLICATION supabase_realtime ADD TABLE rfi_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE rfi_history;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
