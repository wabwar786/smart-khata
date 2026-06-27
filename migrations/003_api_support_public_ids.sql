-- API support migration
-- Adds public UUIDs to categories used by mobile/API routes.

ALTER TABLE product_categories
ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS ux_product_categories_public_id
ON product_categories(public_id);

ALTER TABLE expense_categories
ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS ux_expense_categories_public_id
ON expense_categories(public_id);
