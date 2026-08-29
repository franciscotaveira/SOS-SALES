-- Reserved migration number. The first implementation attempted a global
-- uniqueness constraint, but the established domain allows multiple handoff
-- cases per journey. AI-only serialization is implemented in 20260829011000.
SELECT 1;
