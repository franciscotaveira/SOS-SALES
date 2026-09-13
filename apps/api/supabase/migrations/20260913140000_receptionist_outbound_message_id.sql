-- Add missing outbound_message_id column to receptionist_outbound_reservations
-- This column is referenced by public.complete_receptionist_outbound
ALTER TABLE public.receptionist_outbound_reservations
ADD COLUMN IF NOT EXISTS outbound_message_id UUID REFERENCES public.conversation_messages(id);

GRANT ALL ON TABLE public.receptionist_outbound_reservations TO sos_sales_runtime;
