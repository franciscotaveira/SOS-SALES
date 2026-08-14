# SOS Sales — Plano Sequencial gstack para Entrega Final

**Estado:** plano-mestre para revisão e execução  
**Repositório oficial:** `franciscotaveira/SOS-SALES`  
**Modelo de trabalho:** Codex supervisiona e homologa; Gemini implementa; Francisco aprova premissas, credenciais, WhatsApp e aceitação comercial.

## 1. Objetivo de entrega

Entregar o SOS Sales como um sistema operacional de continuidade comercial utilizável por uma pequena empresa, com o seguinte Golden Path real:

```text
Anúncio/Origem
  → mensagem recebida no WhatsApp
  → contato e jornada identificados
  → prioridade/SLA calculados
  → contexto e fatos exibidos ao operador
  → IA sugere uma próxima ação com evidências
  → humano aprova ou assume o atendimento
  → mensagem é enviada e rastreada
  → follow-up/handoff preserva a continuidade
  → resultado ganho/perdido é registrado
  → campanha recebe atribuição e prova de receita
```

O projeto só será classificado como entregue quando esse fluxo funcionar com dados reais, isolamento entre workspaces, testes automatizados, operação recuperável e deploy homologado. Interface bonita, build verde ou mocks navegáveis não equivalem a produto concluído.

## 2. Papéis e regra de governança

| Papel | Responsabilidade |
|---|---|
| Francisco | Confirma premissas comerciais, fornece acessos sem publicá-los, lê o QR do WhatsApp e executa UAT final |
| Codex | Mantém o plano, audita código e evidências, abre/fecha gates, revisa segurança, QA e deploy |
| Gemini | Implementa somente a fatia autorizada, em branch própria, com testes, documentação e relatório de conclusão |

Regras:

1. Gemini não declara uma etapa concluída apenas porque compilou.
2. Cada fatia termina com commit identificável, testes e evidência reproduzível.
3. Codex executa revisão independente antes do merge.
4. Nenhuma chave, senha, token ou `service_role` entra no Git ou no frontend.
5. Produção começa em modo supervisionado. Automação autônoma é uma evolução condicionada a métricas e guardrails.
6. Não importar o CRM-TX inteiro. Reutilizar apenas contratos, padrões ou adapters que reduzam risco comprovadamente.

## 3. Estratégia de uso das skills

### Tipo A — usadas uma vez para estruturar o projeto

- `/health`: estabelece a linha de base do repositório.
- `/qa-only`: registra os problemas visuais e funcionais atuais sem alterar código.
- `/spec`: transforma o produto desejado em contrato executável.
- `/autoplan`: revisa o plano na ordem CEO → Design → Engenharia → DX.
- `/setup-deploy`: prepara o primeiro pipeline seguro de staging/produção.

### Tipo B — usadas em toda fatia implementada

- `/review`: revisão do diff e dos riscos antes do merge.
- `/cso`: revisão de segurança quando a fatia toca auth, tenancy, webhook, secrets, IA ou dados.
- `/qa`: teste do comportamento real no navegador após integração.
- `/design-review`: revisão visual após a funcionalidade estar conectada a dados reais.
- `/benchmark`: verificação de desempenho em listas, Realtime, consultas ou filas sensíveis.
- `/document-release`: registra o que mudou e como operar.

### Tipo C — usadas somente nos gates de entrega

- `/ship`: prepara PR/merge depois dos checks locais.
- `/land-and-deploy`: integra e publica somente depois da homologação.
- `/canary`: libera gradualmente e monitora o sistema real.
- `/context-save`: preserva o estado e a próxima ação entre sessões/agentes.
- `/retro`: captura aprendizados depois do piloto.

## 4. Sequência completa

## Fase 0 — Preservação e verdade do estado atual

**Skills:** `/context-save` → `/health` → `/qa-only`

### Trabalho

- Preservar o protótipo importado, confirmar branch e remoto.
- Verificar Git, scripts, dependências, lint, build, bundle e documentos.
- Classificar cada tela como `REAL`, `PARCIAL`, `MOCK` ou `AUSENTE`.
- Confirmar que o gateway ativo ainda usa mocks/localStorage.
- Mapear divergências entre documentação e runtime.
- Fazer inventário de segredos e arquivos ignorados.

### Artefatos

- `docs/BASELINE_AUDIT.md`
- matriz tela → contrato → fonte de dados → estado real
- lista P0/P1/P2 inicial
- restore point no Git

### Gate G0 — Fonte preservada

- [ ] branch importada possui commit recuperável
- [ ] remoto e estratégia de merge definidos
- [ ] lint e build executados com resultado registrado
- [ ] nenhum segredo versionado
- [ ] mocks identificados explicitamente

**NO-GO:** documentação afirmar integração real enquanto o runtime usa `MockSalesOsGateway`.

---

## Fase 1 — Contrato definitivo do produto

**Skills:** `/spec` → `/plan-ceo-review` → `/autoplan`

### Trabalho

- Especificar o P0 sem transformar o SOS Sales em CRM genérico.
- Fixar personas: owner, operator e viewer.
- Fixar o Golden Path e os critérios de sucesso.
- Definir o que não entra no primeiro release.
- Decidir a fronteira entre o repositório SOS-SALES e o kernel já construído em `new-sales-os`.
- Submeter o plano completo ao `/autoplan`, obrigatoriamente na ordem:
  1. CEO: tese, escopo, oportunidade e riscos.
  2. Design: hierarquia, estados, acessibilidade e responsividade.
  3. Engenharia: arquitetura, contratos, falhas e matriz de testes.
  4. DX: setup, scripts, erros e documentação operacional.

### Escopo P0 recomendado

1. Supabase Auth e multi-workspace.
2. Configuração de canal WhatsApp.
3. Inbound e outbound WAHA reais.
4. Fila Agora com SLA e claim.
5. Conversa com histórico e status de mensagem.
6. Linha de Continuidade e Dossiê Vivo com evidências.
7. Copiloto supervisionado.
8. Handoff e follow-up.
9. Resultado ganho/perdido.
10. Origem/CTWA e prova de resultado.
11. Auditoria, logs, health e backup/restore.

### Fora do P0

- CRM financeiro/ERP.
- automação irrestrita 24/7.
- construtor genérico de agentes.
- múltiplos provedores implementados simultaneamente.
- Hub de Grupos completo, salvo feature flag P2.
- WABA + WAHA com failover automático antes de um provedor estar homologado.

### Gate G1 — Plano aprovado

- [ ] premissas confirmadas por Francisco
- [ ] spec contém estados de sucesso, vazio, carregamento, parcial e erro
- [ ] contratos do frontend apontam para entidades reais
- [ ] arquitetura escolhida sem duplicar dois backends
- [ ] relatório do `/autoplan` anexado ao plano
- [ ] P0 e itens explicitamente adiados definidos

**NO-GO:** começar telas ou banco em paralelo sem contrato único de IDs, tenancy, eventos e estados.

---

## Fase 2 — Fundação Supabase, Auth e tenancy

**Skills:** `/plan-eng-review` → implementação Gemini → `/review` → `/cso`

### Trabalho do Gemini

- Instalar cliente Supabase e criar adapters server-only/client-safe.
- Criar migrations forward-only para workspaces, memberships, contatos, canais, jornadas, mensagens, fatos, recomendações, ações, handoffs, follow-ups, outcomes, atribuição e outbox.
- Implementar RLS baseada em `auth.uid()` e membership.
- Criar papéis owner/operator/viewer com privilégios mínimos.
- Gerar tipos do banco e contratos compartilhados.
- Criar seed local determinístico sem segredos.
- Substituir credenciais fictícias dos documentos por referências de configuração.

### Provas mínimas

- Usuário A não lê nem escreve no workspace B.
- `anon` não acessa tabelas operacionais.
- `service_role` nunca chega ao navegador.
- IDs filhos não podem apontar para pais de outro tenant.
- migrations recriam o ambiente do zero.

### Gate G2 — Banco e identidade confiáveis

- [ ] migrations reproduzíveis
- [ ] RLS e RBAC com testes negativos
- [ ] Auth real no frontend
- [ ] seleção de workspace real
- [ ] types gerados sem `any` estrutural
- [ ] revisão `/cso` sem P0/P1 aberto

---

## Fase 3 — Golden Path WhatsApp

**Skills:** `/plan-eng-review` → implementação Gemini → `/review` → `/cso` → `/qa`

### Trabalho do Gemini

- Reaproveitar do kernel anterior somente componentes validados de ingestão WAHA.
- Configurar conexão por referência segura de segredo.
- Implementar webhook com raw body, autenticação compatível com o contrato efetivo do WAHA, replay protection e rate limit.
- Persistir envelope bruto imutável antes da normalização.
- Deduplicar eventos e mensagens concorrentemente.
- Resolver contato, jornada e aquisição.
- Implementar envio outbound idempotente com outbox, retry, DLQ e status `sent/delivered/read/failed`.
- Implementar kill switch por workspace e canal, revalidado imediatamente antes do envio.
- Persistir sessão WAHA em volume/armazenamento recuperável.
- Documentar criação de sessão, QR, reconexão e rotação de segredo.

### Teste real obrigatório

```text
telefone externo
  → envia mensagem
  → webhook aceita uma vez
  → mensagem aparece na conversa correta
  → operador responde
  → WAHA entrega ao telefone
  → status evolui
  → reinício não perde sessão nem mensagem
```

### Gate G3 — Canal confiável

- [ ] inbound real homologado
- [ ] outbound real homologado
- [ ] duplicata não duplica mensagem/ação
- [ ] retry não duplica envio
- [ ] kill switch impede chamada ao provedor
- [ ] reinício preserva sessão
- [ ] erro de canal aparece de forma acionável
- [ ] nenhuma credencial aparece em log ou payload público

---

## Fase 4 — Operação humana P0

**Skills por fatia:** implementação Gemini → `/review` → `/design-review` → `/qa`

Implementar em fatias verticais, nesta ordem:

### 4.1 Shell e navegação

- sidebar por domínio: Operação, Gestão, Inteligência e Sistema
- workspace e perfil persistentes
- rotas e permissões por papel
- estados responsivos e acessíveis

### 4.2 Agora / Priority Queue

- prioridade determinística e explicável
- SLA real, motivo, responsável, claim/release
- máximo de 3–5 itens prioritários e “Ver todas”

### 4.3 Conversa

- lista, busca, filtros e paginação/cursor
- timeline, mídia, falha parcial, retry e composer
- preservação de rascunho

### 4.4 Continuidade e Dossiê Vivo

- origem → desejo atual → próximo passo seguro
- fatos com proveniência, confiança e evidência
- objetivo, confirmado, fricção, último combinado e responsável/prazo

### 4.5 Handoff e follow-up

- transições atômicas e auditáveis
- assignee deve ser membro autorizado
- follow-up retorna a conversa à fila no prazo

### 4.6 Resultado

- ganho/perdido, valor em centavos, serviço, motivo e operador
- projeção do funil atualizada sem editar fatos históricos

### Gate G4 — Operação diária completa

- [ ] operador conclui o Golden Path sem acessar banco ou WAHA Dashboard
- [ ] refresh não perde estado importante
- [ ] erros permitem retry sem duplicação
- [ ] viewer não executa ações
- [ ] navegação por teclado e mobile principal homologados
- [ ] mocks removidos do runtime de produção

---

## Fase 5 — Copiloto supervisionado e governança de IA

**Skills:** `/spec` da fatia → implementação Gemini → `/review` → `/cso` → `/qa`

### Trabalho

- Criar provider de LLM server-side, nunca chamado diretamente pelo navegador.
- Injetar contexto comercial autorizado e limitado.
- Exigir evidências para fatos, fricções e recomendações.
- Separar fato confirmado, inferência e hipótese.
- Aplicar policy engine determinístico antes de apresentar/enviar ação.
- Registrar modelo, versão de prompt/policy, tokens, latência, custo e decisão humana.
- Começar com sugestão → rascunho → aprovação humana.
- Definir fallback sem IA que preserve atendimento humano.

### Gate G5 — IA segura e útil

- [ ] nenhuma ação de alto impacto é autônoma
- [ ] recomendação mostra evidência e confiança
- [ ] PII e segredos não vazam em logs
- [ ] prompt injection e conteúdo adversarial possuem testes
- [ ] queda do provedor não bloqueia conversa humana
- [ ] aprovação/rejeição humana é auditável

---

## Fase 6 — Proof of Traffic e resultado comercial

**Skills:** `/spec` da fatia → implementação Gemini → `/review` → `/qa` → `/benchmark`

### Trabalho

- Capturar origem, campanha, anúncio, criativo, UTM e confiança de atribuição.
- Associar aquisição à jornada e ao outcome sem atribuição forçada.
- Integrar gasto de mídia por fonte oficial quando disponível.
- Calcular receita, conversão e ROAS somente com dados válidos.
- Implementar Meta CAPI via outbox idempotente, quando aprovado.
- Diferenciar `confirmado`, `inferido`, `não atribuído` e `dado indisponível`.

### Gate G6 — Métricas honestas

- [ ] dashboard nunca apresenta mock como real
- [ ] receita deriva de outcome confirmado
- [ ] ROAS não aparece sem custo e atribuição válidos
- [ ] totais reconciliam com registros-base
- [ ] CAPI possui idempotência, retry e auditoria

---

## Fase 7 — Design final, acessibilidade e desempenho

**Skills:** `/design-review` → `/qa` → `/benchmark` → `/devex-review`

### Trabalho

- Validar hierarquia e redução de densidade informacional.
- Aplicar bounded containers e cores semânticas com parcimônia.
- Homologar desktop operacional e mobile essencial.
- Cobrir loading, empty, partial, offline, forbidden e error.
- Implementar lazy loading/code splitting nas rotas pesadas.
- Medir listas longas, Realtime, renderizações e bundle.
- Tornar setup local reproduzível e erros acionáveis.

### Gate G7 — Qualidade de produto

- [ ] nenhum fluxo P0 depende de texto cortado ou hover
- [ ] contraste, foco, teclado e touch targets aprovados
- [ ] bundle e rotas pesadas tratados
- [ ] nenhuma lista ilimitada ou assinatura Realtime vazando
- [ ] setup novo funciona seguindo apenas README

---

## Fase 8 — Segurança, recuperação e pré-produção

**Skills:** `/cso` → `/health` → `/qa` → `/benchmark`

### Trabalho

- Secret scan no repositório e histórico relevante.
- Testes de autorização negativa e cross-tenant.
- CORS, rate limit, headers, validação e sanitização.
- Logs estruturados sem PII/segredos.
- health, readiness e dependências obrigatórias.
- backup automatizado e restore comprovado.
- staging com domínio, TLS e dados de teste.
- runbook de incidente e rollback.

### Gate G8 — Go/No-Go de staging

- [ ] zero P0/P1 de segurança
- [ ] backup restaurado em ambiente separado
- [ ] readiness degrada quando DB/Redis/worker/canal falham
- [ ] testes unitários, integração e E2E verdes
- [ ] UAT de Francisco concluído
- [ ] rollback ensaiado

---

## Fase 9 — Entrega e canário

**Skills:** `/setup-deploy` → `/ship` → `/land-and-deploy` → `/canary`

### Ordem

1. Preparar infraestrutura e CI/CD idempotente.
2. Publicar staging e repetir o Golden Path.
3. Gerar PR final com evidências e checklist.
4. Fazer merge apenas com G0–G8 verdes.
5. Publicar produção inicialmente para um workspace piloto.
6. Acompanhar canário e ampliar gradualmente.

### Métricas do canário

- taxa de webhooks aceitos e deduplicados
- latência inbound → UI
- latência de primeira resposta
- falhas e retries outbound
- tamanho/idade da DLQ
- aprovação/rejeição das sugestões da IA
- conversas sem responsável ou próximo passo
- outcomes e atribuição não reconciliados

### Gate G9 — Produção homologada

- [ ] piloto utiliza o sistema em operação real
- [ ] nenhuma perda/duplicação crítica de mensagem
- [ ] alertas e runbooks funcionam
- [ ] kill switch testado
- [ ] critérios de rollback conhecidos
- [ ] decisão explícita de ampliar, corrigir ou reverter

---

## Fase 10 — Documentação e encerramento

**Skills:** `/document-release` → `/context-save` → `/retro`

### Artefatos finais

- README real de instalação/operação
- arquitetura e contratos atualizados
- catálogo de migrations e políticas RLS
- runbook WAHA, Supabase, backup, restore e deploy
- manual owner/operator/viewer
- checklist de onboarding de novo workspace
- release notes com limitações conhecidas
- backlog P1/P2 pós-piloto
- relatório da retrospectiva

## 5. Ciclo obrigatório de cada fatia do Gemini

```text
Codex define escopo + aceite
  → Gemini cria branch
  → Gemini implementa banco/backend/frontend/testes da fatia
  → Gemini executa checks e documenta evidências
  → Codex roda /review
  → /cso se houver superfície sensível
  → /design-review e /qa se houver interface
  → correções retornam ao Gemini
  → Codex revalida
  → /ship somente com gate verde
```

Relatório mínimo exigido do Gemini:

```markdown
## Fatia implementada
## Branch e commit
## Arquivos alterados
## Decisões tomadas
## Migrations e rollback
## Testes executados e resultado integral
## Evidências do Golden Path
## Segurança e tenancy verificadas
## Pendências reais
## Como reproduzir
```

## 6. Ordem imediata recomendada

1. Executar `/health` e `/qa-only` no checkout atual.
2. Produzir a spec P0 canônica.
3. Rodar `/autoplan` sobre essa spec e confirmar suas premissas com Francisco.
4. Decidir a estratégia de integração do kernel `new-sales-os` antes de escrever outro backend.
5. Entregar primeiro Supabase/Auth/Tenancy.
6. Depois homologar WAHA inbound e outbound reais.
7. Só então conectar as telas P0 e remover mocks.
8. Introduzir IA supervisionada depois que a operação humana estiver estável.
9. Integrar atribuição/Proof of Traffic após outcomes confiáveis.
10. Executar hardening, staging, UAT, canário e documentação final.

## 7. Definição final de pronto

O SOS Sales estará pronto quando um usuário novo conseguir entrar, acessar apenas seu workspace, conectar um canal autorizado, receber uma conversa real, compreender origem e contexto, assumir ou aprovar uma resposta, enviar sem duplicação, programar continuidade, registrar resultado e visualizar atribuição honesta — e quando a equipe conseguir reiniciar, restaurar, monitorar e reverter o sistema sem depender do criador do código.
