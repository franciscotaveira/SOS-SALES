import { useEffect, useState } from "react";
import { ShieldCheck, Activity, Database, KeyRound, ArrowRightLeft, Cpu } from "lucide-react";

interface SystemHealth {
  status: string;
  checks?: {
    database?: { healthy: boolean; latencyMs: number };
  };
  timestamp?: string;
}

export function App() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkApi() {
      try {
        const res = await fetch("http://localhost:4400/ready");
        if (res.ok) {
          const data = await res.json();
          setHealth(data);
        } else {
          setHealth({ status: "degraded" });
        }
      } catch (err) {
        setHealth({ status: "offline" });
      } finally {
        setLoading(false);
      }
    }
    checkApi();
    const interval = setInterval(checkApi, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px 24px" }}>
      {/* Top Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.03em" }}>SOS SALES V3</h1>
            <span className="badge badge-ready">
              <span className="pulse-dot"></span>
              Iteração 1 — Repositório Confiável
            </span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
            Sistema Operacional Comercial Greenfield com Migração Segura (MCT OS v2.0)
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <span className="badge badge-operational">Docker Lab Hermético</span>
          <span className="badge badge-ai">Postgres 55440 | Redis 6389</span>
        </div>
      </header>

      {/* Grid: Architecture Status & ADRs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "24px", marginBottom: "40px" }}>
        {/* System Health Card */}
        <div className="glass-card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
              <Activity size={20} color="var(--color-action)" />
              Status de Conectividade
            </h2>
            <span className={`badge ${health?.status === "ready" ? "badge-ready" : health?.status === "degraded" ? "badge-warning" : "badge-operational"}`}>
              {loading ? "Verificando..." : health?.status?.toUpperCase()}
            </span>
          </div>

          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "20px" }}>
            Monitoramento de prontidão da API Fastify 5 e banco de dados isolado no Docker Lab.
          </p>

          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "var(--radius-md)", padding: "16px", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ color: "var(--text-muted)" }}>Fastify API (porta 4400):</span>
              <span style={{ color: health?.status ? "var(--color-action)" : "var(--color-warning)" }}>
                {health?.status ? "Conectada" : "Aguardando boot"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ color: "var(--text-muted)" }}>PostgreSQL 16 (porta 55440):</span>
              <span style={{ color: health?.checks?.database?.healthy ? "var(--color-action)" : "var(--text-muted)" }}>
                {health?.checks?.database?.healthy ? `OK (${health.checks.database.latencyMs}ms)` : "Docker Pool"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Redis (porta 6389):</span>
              <span style={{ color: "var(--color-action)" }}>sos-v3-redis</span>
            </div>
          </div>
        </div>

        {/* ADR-001 Card */}
        <div className="glass-card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <ShieldCheck size={20} color="var(--color-action)" />
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>ADR-001: Fronteira do MVP</h3>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.6 }}>
            Ciclo Comercial E2E fechado: <strong>Aquisição → Conversa WhatsApp (Dual-Engine) → Cockpit Comercial → Fechamento → Recibo CAPI</strong>. Sem n8n, sem fallbacks silenciosos.
          </p>
        </div>

        {/* ADR-002 Card */}
        <div className="glass-card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <Database size={20} color="var(--color-operational)" />
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>ADR-002: Identidade e RLS</h3>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.6 }}>
            Isolamento de tenant estrito em duas camadas: RBAC na aplicação + Row Level Security (RLS) mandatório no PostgreSQL por <code>workspace_id</code> com FKs compostas.
          </p>
        </div>

        {/* ADR-003 Card */}
        <div className="glass-card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <KeyRound size={20} color="var(--color-warning)" />
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>ADR-003: Ciclo de Segredos</h3>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.6 }}>
            Extinção de <code>public_config</code>. Credenciais de clientes criptografadas com AES-256-GCM. Redaction ativo de tokens e PII em todos os logs Pino.
          </p>
        </div>

        {/* ADR-004 Card */}
        <div className="glass-card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <ArrowRightLeft size={20} color="var(--color-ai)" />
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>ADR-004: Coexistência V2/V3</h3>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.6 }}>
            Padrão Strangler Fig com Anti-Corruption Layer. A V2 segue atendendo produção em paralelo. Migração progressiva tenant por tenant com rollback garantido.
          </p>
        </div>

        {/* Engine Specs */}
        <div className="glass-card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <Cpu size={20} color="var(--color-action)" />
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>Padrões Ativos da V3</h3>
          </div>
          <ul style={{ paddingLeft: "20px", color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.8 }}>
            <li>Zod Contracts & OpenAPI schema validation</li>
            <li>BullMQ + Redis para Inbound & CAPI queues</li>
            <li>Postgres 16 com migrations versionadas forward-only</li>
            <li>Design system semântico com contraste WCAG AA</li>
          </ul>
        </div>
      </div>

      {/* Footer Info */}
      <footer style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--text-muted)", fontSize: "0.8rem", flexWrap: "wrap", gap: "8px" }}>
        <span>MCT LTDA © 2026 — Francisco Taveira Rios</span>
        <span>Filosofia: Poder invisível, simplicidade visível. Truth in Data.</span>
      </footer>
    </div>
  );
}
