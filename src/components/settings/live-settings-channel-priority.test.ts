import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./LiveSettingsView.tsx', import.meta.url), 'utf8');

describe('entry channel settings priority', () => {
  it('reads official WABA state first and keeps WAHA as an explicit fallback', () => {
    expect(source).toContain('/channels/waba/channel-info');
    expect(source).toContain("const [showWahaFallback, setShowWahaFallback] = useState(false);");
    expect(source).toContain('Conectar WhatsApp oficial');
    expect(source).toContain('Abrir conexão WAHA');
    expect(source).toContain('if (!showWahaFallback) return;');
  });
});
