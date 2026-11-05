-- Complete rental application (docs/sdlc/changes/rental-application/spec.md).
-- Nullable additions only. Lists are JSON text, one column per section so activity
-- history shows which section changed. New money columns are integer cents.

ALTER TABLE applications ADD COLUMN former_names TEXT;
ALTER TABLE applications ADD COLUMN lease_term_months INTEGER;
ALTER TABLE applications ADD COLUMN quoted_rent_cents INTEGER;
ALTER TABLE applications ADD COLUMN quoted_deposit_cents INTEGER;
ALTER TABLE applications ADD COLUMN referral_source TEXT;
ALTER TABLE applications ADD COLUMN active_military INTEGER;
ALTER TABLE applications ADD COLUMN smoker INTEGER;

ALTER TABLE applications ADD COLUMN co_applicants TEXT;          -- [{name, email, phone}]
ALTER TABLE applications ADD COLUMN occupants TEXT;              -- [{name, minor}]
ALTER TABLE applications ADD COLUMN emergency_contact TEXT;      -- {name, phone, relationship}
ALTER TABLE applications ADD COLUMN residences TEXT;             -- [{address, from, to, rent_cents, landlord_name, landlord_phone, reason}]
ALTER TABLE applications ADD COLUMN incomes TEXT;                -- [{earner, type, employer, position, start, monthly_cents, supervisor, supervisor_phone}]
ALTER TABLE applications ADD COLUMN pets TEXT;                   -- [{type, breed, weight_lbs, age, neutered, vaccinated}]
ALTER TABLE applications ADD COLUMN vehicles TEXT;               -- [{year, make, model, plate, state}]
ALTER TABLE applications ADD COLUMN personal_references TEXT;    -- [{name, phone, relationship}]
ALTER TABLE applications ADD COLUMN disclosures TEXT;            -- {evicted: {answer, explanation}, ...}
ALTER TABLE applications ADD COLUMN guarantor TEXT;              -- {name, phone, email, monthly_cents}

ALTER TABLE applications ADD COLUMN fee_cents INTEGER;
ALTER TABLE applications ADD COLUMN fee_paid_on TEXT;
ALTER TABLE applications ADD COLUMN deposit_cents INTEGER;
ALTER TABLE applications ADD COLUMN deposit_paid_on TEXT;
ALTER TABLE applications ADD COLUMN deposit_outcome TEXT;        -- 'held' | 'applied' | 'refunded' | 'forfeited'
ALTER TABLE applications ADD COLUMN deposit_refunded_on TEXT;
ALTER TABLE applications ADD COLUMN refund_address TEXT;

ALTER TABLE applications ADD COLUMN criteria_notice_on TEXT;     -- Tex. Prop. Code §92.3515
ALTER TABLE applications ADD COLUMN criteria_ack_on TEXT;
ALTER TABLE applications ADD COLUMN authorized_on TEXT;
ALTER TABLE applications ADD COLUMN certified_on TEXT;
ALTER TABLE applications ADD COLUMN completed_on TEXT;           -- starts the 7-day decision clock (§92.352)

ALTER TABLE applications ADD COLUMN decided_at TEXT;             -- set by the server
ALTER TABLE applications ADD COLUMN decided_by INTEGER REFERENCES users(id);
ALTER TABLE applications ADD COLUMN conditions TEXT;
ALTER TABLE applications ADD COLUMN decline_reason TEXT;
ALTER TABLE applications ADD COLUMN decline_notes TEXT;
ALTER TABLE applications ADD COLUMN notified_at TEXT;
ALTER TABLE applications ADD COLUMN notified_method TEXT;        -- 'phone' | 'mail' | 'email' | 'in_person'

-- Income verification placeholder; the later phase adds methods, documents and providers.
ALTER TABLE applications ADD COLUMN income_verification_status TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE applications ADD COLUMN verified_income_cents INTEGER;
ALTER TABLE applications ADD COLUMN verified_on TEXT;
ALTER TABLE applications ADD COLUMN verified_by INTEGER REFERENCES users(id);

INSERT OR IGNORE INTO settings (key, value) VALUES ('application_income_multiple', '3');
