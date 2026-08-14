/**
 * Local-only Sales OS bootstrap for the WAHA sandbox.
 * `.env.waha.local` is ignored by Git and must contain local test credentials.
 */
import dotenv from 'dotenv';
import { startServer } from './server.js';

dotenv.config();
dotenv.config({ path: '.env.waha.local', override: false });

// Backward-compatible local name used in the first sandbox setup. New setups
// should use WAHA_WEBHOOK_SECRET directly.
if (!process.env.WAHA_WEBHOOK_SECRET && process.env.SALES_OS_WEBHOOK_SECRET) {
  process.env.WAHA_WEBHOOK_SECRET = process.env.SALES_OS_WEBHOOK_SECRET;
}
process.env.WAHA_BASE_URL ??= 'http://127.0.0.1:3001';

if (!process.env.WAHA_API_KEY || !process.env.WAHA_WEBHOOK_SECRET) {
  console.error(
    'WAHA local bootstrap blocked: define WAHA_API_KEY and WAHA_WEBHOOK_SECRET in .env.waha.local.'
  );
  process.exit(1);
}

startServer().catch((err) => {
  console.error('Fatal WAHA local bootstrap error:', err);
  process.exit(1);
});
