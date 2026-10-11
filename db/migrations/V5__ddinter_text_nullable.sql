-- DDInter prints "None" (or "-", or nothing) where it has no text. The ETL now stores missing text as NULL
-- instead of a placeholder, so these text columns allow NULL. Not destructive: no row is changed or removed here.
-- Existing placeholder rows are fixed by the next DDInter stage run (it re-fetches, cleans or deletes them).
ALTER TABLE curated.ddinter_interaction_text ALTER COLUMN interaction DROP NOT NULL;
ALTER TABLE curated.ddinter_interaction_text ALTER COLUMN management DROP NOT NULL;
ALTER TABLE curated.ddinter_disease ALTER COLUMN text DROP NOT NULL;
ALTER TABLE curated.ddinter_food ALTER COLUMN description DROP NOT NULL;
ALTER TABLE curated.ddinter_food ALTER COLUMN management DROP NOT NULL;
-- A text row is stored only when DDInter has at least one of the two texts.
ALTER TABLE curated.ddinter_interaction_text ADD CONSTRAINT ddinter_interaction_text_has_text
  CHECK (interaction IS NOT NULL OR management IS NOT NULL);
