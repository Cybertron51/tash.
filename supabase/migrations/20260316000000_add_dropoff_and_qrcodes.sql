-- ============================================================
-- Drop-Off Events + QR Code Groupings
-- ============================================================

-- ── Drop-Off Events ─────────────────────────────────────────
-- Admin-editable weekly drop-off schedule.

CREATE TABLE IF NOT EXISTS drop_off_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  address     TEXT        NOT NULL,
  date        DATE        NOT NULL,
  time_start  TEXT        NOT NULL,
  time_end    TEXT        NOT NULL,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE drop_off_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read drop_off_events"
  ON drop_off_events FOR SELECT USING (true);

DROP TRIGGER IF EXISTS trg_doe_updated_at ON drop_off_events;
CREATE TRIGGER trg_doe_updated_at
  BEFORE UPDATE ON drop_off_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── QR Codes ────────────────────────────────────────────────
-- User QR code groupings for drop-off submissions.

CREATE TABLE IF NOT EXISTS qr_codes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'drop_off'
                          CHECK (type IN ('drop_off', 'shipping')),
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'submitted', 'completed')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qr_user_id ON qr_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_qr_status  ON qr_codes(status);

ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own qr_codes"
  ON qr_codes FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own qr_codes"
  ON qr_codes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own qr_codes"
  ON qr_codes FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own qr_codes"
  ON qr_codes FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_qr_updated_at ON qr_codes;
CREATE TRIGGER trg_qr_updated_at
  BEFORE UPDATE ON qr_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── QR Code Holdings (junction) ─────────────────────────────
-- Links QR codes to vault holdings.

CREATE TABLE IF NOT EXISTS qr_code_holdings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code_id  UUID        NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  holding_id  UUID        NOT NULL REFERENCES vault_holdings(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(qr_code_id, holding_id)
);

CREATE INDEX IF NOT EXISTS idx_qch_qr_code ON qr_code_holdings(qr_code_id);
CREATE INDEX IF NOT EXISTS idx_qch_holding ON qr_code_holdings(holding_id);

ALTER TABLE qr_code_holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own qr_code_holdings"
  ON qr_code_holdings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM qr_codes WHERE qr_codes.id = qr_code_holdings.qr_code_id AND qr_codes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own qr_code_holdings"
  ON qr_code_holdings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM qr_codes WHERE qr_codes.id = qr_code_holdings.qr_code_id AND qr_codes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own qr_code_holdings"
  ON qr_code_holdings FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM qr_codes WHERE qr_codes.id = qr_code_holdings.qr_code_id AND qr_codes.user_id = auth.uid()
    )
  );
