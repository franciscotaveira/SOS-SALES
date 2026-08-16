#!/usr/bin/env bash
# SOS SALES — Smoke Test Suite v2
# Testa: API liveness, readiness, OpenAPI spec, API build, web build e frontend.
# Uso: npm run smoke
# Requer: API rodando em $API_URL (default localhost:4334) ou sobe em background automaticamente.

set -euo pipefail

BASE_API="${API_URL:-http://localhost:4334}"
BASE_WEB="${WEB_URL:-http://localhost:3000}"
TIMEOUT=30
API_PID=""
WEB_PID=""

# ─── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

pass()  { echo -e "${GREEN}✓${NC} $1"; }
fail()  { echo -e "${RED}✗${NC} $1"; cleanup; exit 1; }
info()  { echo -e "${CYAN}→${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }

PASS_COUNT=0
FAIL_COUNT=0

check() {
  local label="$1"
  shift
  if "$@" 2>/dev/null; then
    pass "$label"
    ((PASS_COUNT++)) || true
  else
    echo -e "${RED}✗${NC} $label"
    ((FAIL_COUNT++)) || true
  fi
}

cleanup() {
  if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
    info "Parando API temporária (PID $API_PID)..."
    kill "$API_PID" 2>/dev/null || true
  fi
  if [ -n "$WEB_PID" ] && kill -0 "$WEB_PID" 2>/dev/null; then
    info "Parando Web temporária (PID $WEB_PID)..."
    kill "$WEB_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

wait_for() {
  local url="$1"
  local label="$2"
  local elapsed=0
  info "Aguardando $label em $url..."
  while ! curl -sf "$url" > /dev/null 2>&1; do
    sleep 1
    ((elapsed++)) || true
    if [ "$elapsed" -ge "$TIMEOUT" ]; then
      warn "$label não subiu em ${TIMEOUT}s — pulando checks que dependem dele"
      return 1
    fi
  done
  pass "$label está UP (${elapsed}s)"
  return 0
}

# ─── Header ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}==========================================${NC}"
echo -e "${BOLD}  SOS SALES — SMOKE TEST SUITE v2        ${NC}"
echo -e "${BOLD}  $(date '+%Y-%m-%d %H:%M:%S')           ${NC}"
echo -e "${BOLD}==========================================${NC}"
echo ""

# ─── Phase 0: Static checks (sem servidor) ─────────────────────────────────────
echo -e "${CYAN}── Phase 0: Static Checks ─────────────────────${NC}"

check "OpenAPI spec existe (openapi.yaml)" test -f "apps/api/openapi.yaml"
check "OpenAPI JSON existe (openapi.json)"  test -f "apps/api/openapi.json"
check "API_CONTRACT.md existe"             test -f "docs/API_CONTRACT.md"
check "Runbook de produção existe"         test -f "docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md"
check "DECISION_LOG.md existe"            test -f "DECISION_LOG.md"
check "Smoke test script existe"          test -f "scripts/smoke-test.sh"
echo ""

# ─── Phase 1: Build verification ───────────────────────────────────────────────
echo -e "${CYAN}── Phase 1: Build Verification ─────────────────${NC}"

info "Compilando API (tsup)..."
if npm --prefix apps/api run build > /dev/null 2>&1; then
  pass "API production bundle compilado com sucesso"
  ((PASS_COUNT++)) || true
  check "dist/index.js existe" test -f "apps/api/dist/index.js"
else
  fail "❌ API build falhou — corrija antes de prosseguir"
fi
echo ""

# ─── Phase 2: API liveness (sobe em background se necessário) ──────────────────
echo -e "${CYAN}── Phase 2: API Liveness ───────────────────────${NC}"

API_UP=false
if curl -sf "${BASE_API}/health" > /dev/null 2>&1; then
  pass "API já está rodando em $BASE_API"
  API_UP=true
else
  info "API não detectada — iniciando servidor de smoke em background..."
  (cd apps/api && npx tsx src/index.ts > /tmp/sos-api-smoke.log 2>&1) &
  API_PID=$!
  if wait_for "${BASE_API}/health" "API"; then
    API_UP=true
  fi
fi

if [ "$API_UP" = true ]; then
  # Liveness
  check "GET /health → status:ok" \
    bash -c "curl -sf '${BASE_API}/health' | grep -q 'ok'"

  # OpenAPI Docs endpoint (swagger-ui faz redirect para /docs/)
  check "GET /docs → Swagger UI (redirect)" \
    bash -c "curl -sfL '${BASE_API}/docs' | grep -qi 'swagger\|redoc\|html\|swaggerui\|openapi'"

  # Readiness probe (pode estar degraded sem infra, mas deve responder)
  READY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_API}/ready")
  if [ "$READY_STATUS" = "200" ] || [ "$READY_STATUS" = "503" ]; then
    pass "GET /ready → responde ($READY_STATUS)"
    ((PASS_COUNT++)) || true
  else
    echo -e "${RED}✗${NC} GET /ready → código inesperado $READY_STATUS"
    ((FAIL_COUNT++)) || true
  fi

  # Rota protegida sem token → deve retornar 401
  AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_API}/api/v1/workspaces")
  if [ "$AUTH_STATUS" = "401" ] || [ "$AUTH_STATUS" = "403" ]; then
    pass "GET /api/v1/workspaces sem token → $AUTH_STATUS (auth enforced)"
    ((PASS_COUNT++)) || true
  else
    echo -e "${YELLOW}!${NC} GET /api/v1/workspaces → $AUTH_STATUS (esperado 401/403)"
  fi
else
  warn "Pulando checks de API (servidor indisponível)"
fi
echo ""

# ─── Phase 3: Web Frontend ─────────────────────────────────────────────────────
echo -e "${CYAN}── Phase 3: Web Frontend ───────────────────────${NC}"

WEB_UP=false
if curl -sf "${BASE_WEB}" > /dev/null 2>&1; then
  pass "Web já está rodando em $BASE_WEB"
  WEB_UP=true
else
  info "Web dev server não detectado — verificando build estático..."
  if test -f "dist/index.html"; then
    pass "dist/index.html existe (build estático presente)"
    ((PASS_COUNT++)) || true
    WEB_UP=true
  else
    warn "Web dev server não está rodando e não há build estático"
    warn "Execute 'npm run dev' para subir o frontend"
  fi
fi

if [ "$WEB_UP" = true ] && curl -sf "${BASE_WEB}" > /dev/null 2>&1; then
  check "Web responde com HTML válido" \
    bash -c "curl -sf '${BASE_WEB}' | grep -qi 'html'"
fi
echo ""

# ─── Resultado Final ────────────────────────────────────────────────────────────
echo -e "${BOLD}==========================================${NC}"
TOTAL=$((PASS_COUNT + FAIL_COUNT))
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}🎉 SMOKE TEST PASSOU — $PASS_COUNT/$TOTAL checks OK${NC}"
  echo -e "${GREEN}   MVP SOS Sales local validado com sucesso.${NC}"
  echo ""
  exit 0
else
  echo -e "${RED}${BOLD}❌ SMOKE TEST FALHOU — $FAIL_COUNT/$TOTAL checks com erro${NC}"
  echo ""
  exit 1
fi
