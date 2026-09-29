-- Migration 012: Workspace Business Profile and Custom Pix Settings
-- Enables workspaces to configure their institutional Pix keys (CNPJ, Email, Phone, EVP)
-- and merchant information for automatic dynamic BACEN EMV QR Code generation.

ALTER TABLE public.workspaces
    ADD COLUMN IF NOT EXISTS default_pix_key text,
    ADD COLUMN IF NOT EXISTS default_pix_key_type text DEFAULT 'CNPJ',
    ADD COLUMN IF NOT EXISTS default_pix_merchant_name text DEFAULT 'MCT SOS SALES',
    ADD COLUMN IF NOT EXISTS default_pix_merchant_city text DEFAULT 'CHAPECO';

COMMENT ON COLUMN public.workspaces.default_pix_key IS 'Institutional default Pix key (CNPJ, Email, Phone or Random Key) used for customer charges';
COMMENT ON COLUMN public.workspaces.default_pix_key_type IS 'Type of Pix key (CNPJ, EMAIL, PHONE, EVP)';
COMMENT ON COLUMN public.workspaces.default_pix_merchant_name IS 'Merchant Name displayed in banking applications (up to 25 chars)';
COMMENT ON COLUMN public.workspaces.default_pix_merchant_city IS 'Merchant City displayed in banking applications (up to 15 chars)';
