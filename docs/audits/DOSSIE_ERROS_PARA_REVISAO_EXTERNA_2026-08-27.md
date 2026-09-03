# Dossiê de Erros para Revisão Externa — Sales OS Lean / SOS-SALES

> **Objetivo deste documento:** dar a uma IA externa (sem acesso ao repositório) contexto suficiente para julgar, por si, se cada erro identificado é real, qual a sua gravidade, e se a resolução proposta é sólida.
> **Natureza:** revisão de especificação/arquitetura. Nada aqui tocou produção, WABA, credenciais, número, token, webhook ou CAPI. É documentação.
> **Data:** 27 Ago 2026

---

## 0. Contexto do sistema (o mínimo para julgar)

**Produto:** cockpit comercial para continuidade de vendas via WhatsApp. Integra WhatsApp através de dois caminhos: WAHA (WhatsApp HTTP API, não-oficial) e Meta WABA Cloud API v20.0 (oficial). Envia eventos de conversão de volta à Meta via CAPI (Conversions API).

**Dois repositórios em jogo:**
- **SOS-SALES** — o sistema atual, já em funcionamento. Arquitetura hexagonal (portas/adaptadores). Fonte de contratos e adaptadores comprovados.
- **Sales OS Lean** — reconstrução "lean" em curso, por *strangler pattern* (substituir o sistema antigo peça a peça, mantendo-o vivo até a nova peça provar paridade). Stack: Next.js (app router) + NextAuth + Prisma + PostgreSQL; API Fastify; monorepo pnpm; Docker Lab isolado.

**Documento sob revisão:** o "Prompt Mestre de Construção" do Sales OS Lean (a especificação canónica que dita como o novo sistema deve ser construído).

**Baseline declarada como fechada:** `NEXT_SESSION.md` marca os itens 1–4 da "sequência obrigatória" como concluídos. A evidência tem alcances diferentes: build e identidade JWT foram implementados no Lab; os portes foram testados localmente; já "Haven em modo observador" significa apenas que existe um pacote observer estruturalmente incapaz de enviar, com sinks em memória/console. **Não existe conexão real com número, webhook, WABA ou tráfego Haven.** "Haven" é o piloto inicial, ainda bloqueado como integração externa.

**Invariantes centrais do spec (bem escolhidos, não são o problema):**
- `ownership_epoch` monotónico, com **dono único por `phone_number_id`** (o identificador do número de telefone WABA). Rollback **incrementa** o epoch, nunca o reutiliza.
- Concorrência de controlo de conversa via `conversation_control` com `control_generation` monotónico + versão otimista.
- Outbox/worker durável em Postgres para efeitos externos críticos (nunca fire-and-forget).
- Fail-closed por omissão.
- Provider de IA atrás de porta (`ConversationAgentPort`).

O veredito global é que o spec é **forte e defensável** para evolução no Lab. Os itens abaixo combinam **dívidas transitórias, ambiguidades operacionais e lacunas de especificação**. Nem todos são contradições lógicas, e nenhum autoriza promoção para produção.

---

## RISCO PRIORITÁRIO #1 — NextAuth JWT é uma etapa transitória sem critério de retirada fechado

### Os dois factos que criam a dívida transitória
1. **Baseline, dada como FECHADA e evidenciada** (`NEXT_SESSION.md`, item 2 da sequência obrigatória):
   > "Trocar `x-lab-actor-id` por sessão/JWT oficial antes de qualquer ambiente além do Lab. → identidade derivada de **JWT NextAuth verificado (HS256)**, caminho Lab atrás de gate."
   Há evidência de sessão registada para este item. A identidade já foi **portada** para o novo sistema como `SessionClaims` + `deriveIdentity` (item 3, também fechado).

2. **Alvo canónico do Prompt Mestre** (§3.2 / o seu ADR 2):
   > **Supabase Auth/JWT validado pelo Fastify** é a fonte de verdade de identidade; RBAC + RLS por `workspace_id`. NextAuth é classificado como **`RETIRE_AFTER_PARITY`** (aposentar depois de provada paridade).

### Julgamento corrigido
Isto é uma **dívida arquitetural real**, não uma contradição fatal: uma baseline pode implementar temporariamente NextAuth e manter Supabase Auth como destino, desde que a transição seja explícita. O erro foi marcar a etapa como fechada sem fechar também o critério de retirada. Como o Lean permanece no Lab e ainda não possui sessões produtivas a preservar, não há benefício comprovado em manter dois emissores simultâneos.

### Riscos concretos que isto abre
- **HS256 é simétrico:** a mesma chave assina e verifica. Supabase Auth normalmente usa assinatura assimétrica (JWKS). Uma "ponte" que aceite ambos os emissores durante uma janela tem de verificar **assinatura por emissor** e não misturar segredos — caso contrário abre-se um buraco de confiança (aceitar tokens de um emissor com a chave de outro).
- **Mapeamento de claims implícito:** `sub`, `workspace_id`, `role` têm de ter correspondência **explícita** entre o token NextAuth e o token Supabase. Se um campo mudar de nome ou de semântica (ex.: `workspace_id` no topo vs. dentro de `app_metadata`), o RLS por `workspace_id` pode falhar aberto ou fechado silenciosamente.
- **Sessões vivas no corte:** não está definido o que acontece a sessões ativas no momento do cutover. Invalidação em massa? Dupla aceitação temporária? Sem isto, o corte arrisca deslogar utilizadores ou aceitar tokens que já deviam ter morrido.
- **Invariante do frontend:** o Prompt Mestre exige que o frontend **nunca** toque `service_role` nem segredos. Qualquer desenho de ponte tem de respeitar isto.

### Resolução recomendada para o ADR 0001
**Cutover direto no Lab para Supabase Auth antes de qualquer ambiente externo.** Preservar `SessionClaims`/`deriveIdentity` apenas como contrato de domínio, adaptando o emissor e o mapeamento de claims. Não criar janela de dupla aceitação HS256 + JWKS sem necessidade produtiva concreta.

**Requisitos que qualquer opção tem de cumprir:** (a) paridade de claims explícita; (b) estratégia de cutover com ponto de rollback e destino das sessões vivas; (c) **critério de retirement falsificável** (ex.: "N cenários de identidade P0 verdes sob Supabase Auth em Lab **e** zero caminhos que ainda emitam/aceitem JWT NextAuth"); (d) frontend nunca toca `service_role`.

### Critério falsificável de conclusão
- Cenários P0 de identidade passam com token Supabase real no Lab.
- Fastify valida issuer, audience, assinatura e expiração.
- `sub` é cruzado com membership persistida; organização/papel não são concedidos por header livre.
- Não existe caminho promovível que emita ou aceite JWT NextAuth.
- Frontend nunca recebe `service_role` ou segredo de assinatura.

---

## RISCO CRÍTICO #2 — O protocolo de titularidade WABA entre SOS blue e Lean não está fechado

### Os dois factos que precisam de um protocolo comum
1. **`reuse-manifest.md` + Prompt Mestre:**
   > SOS-SALES é **fonte de reuso seletivo, NÃO dependência de runtime**. (Isto é: dele portam-se contratos/adaptadores; ele não fica vivo a servir tráfego real durante a migração.)

2. **GSTACK UNRESOLVED #1** (uma questão em aberto do próprio processo):
   > Admite **manter o SOS como runtime "blue" durante o strangler**. (Isto é: o SOS **fica vivo em produção** enquanto o Lean cresce ao lado — padrão blue/green.)

### Julgamento corrigido
As afirmações **não são mutuamente exclusivas**. "Lean não depende do SOS em runtime" significa que o Lean não precisa chamar o SOS para funcionar. O SOS pode continuar como sistema blue atendendo produção durante a migração. A falha real é não definir como a titularidade do número passa de um sistema para o outro sem dupla execução.

O risco colide diretamente com um **invariante de segurança operacional**:

- A tabela `channel_runtime_ownership` modela `owner_runtime` como `blue|green` com um `ownership_epoch` monotónico. Este desenho **pressupõe dois runtimes vivos** a competir pela titularidade do mesmo `phone_number_id`.
- **Se o "blue" for o SOS em produção**, então o handoff de titularidade (passar o número de "blue" para "green") é um handoff **entre dois sistemas distintos e independentes** — não entre duas versões do mesmo runtime.
- O spec **não especifica** esse protocolo de handoff entre sistemas distintos: quem incrementa o epoch, como o SOS reconhece que perdeu a titularidade e para de consumir, e como se garante um **único owner em todo o instante**.

### O invariante inegociável em jogo
**Um só ingress owner e uma só cadeia de processamento por `phone_number_id`, em qualquer instante.** Se dois sistemas achAm simultaneamente que são donos do mesmo número:
- **Duplo processamento do mesmo webhook** — a mesma mensagem recebida é processada por SOS **e** Lean, gerando respostas duplicadas ao cliente, duplo disparo de automações, e potencialmente **dupla contagem de conversões no CAPI**.
- **Race de titularidade** — sem um protocolo de handoff atómico entre os dois sistemas, existe uma janela em que ambos consomem. `ownership_epoch` sozinho não resolve isto se o incremento de epoch e a paragem de consumo do sistema antigo não estiverem coordenados.

### Relação com autenticação
Este risco bloqueia qualquer onda que toque WABA, outbound ou CAPI, mas **não bloqueia o cutover de autenticação no Lab**. Auth e handoff WABA podem ser resolvidos em paralelo, mantendo limites separados.

### Resolução recomendada para o ADR 0002
O SOS permanece temporariamente como **runtime blue e único owner real** do webhook/WABA. O Lean continua sem dependência operacional do SOS e recebe apenas fixtures, replay ou eventos espelhados em modo observer, sem outbound e sem CAPI. No cutover controlado: bloquear novas claims no SOS, drenar/reconciliar trabalho em curso, incrementar o epoch numa autoridade central, ativar o Lean com o novo epoch e rejeitar workers stale. Rollback sempre cria um epoch novo.

**Requisitos que qualquer opção tem de cumprir:** (a) um só ingress owner e uma só cadeia por `phone_number_id` a todo o instante; (b) rollback incrementa o epoch, nunca o reutiliza; (c) nenhum segundo consumidor concorrente para o mesmo webhook/número.

### Critério falsificável de conclusão
- Apenas um runtime possui lease válido para processar o `phone_number_id`.
- Cada claim e efeito externo carrega o `ownership_epoch`; epoch stale falha fechado.
- Duplicatas de webhook são idempotentes durante retry/replay.
- Outbound e CAPI permanecem desativados no Lean até o cutover autorizado.
- Drenagem, ativação e rollback possuem reconciliação, não apenas healthcheck.

---

## Erros/lacunas de menor gravidade (registar agora, resolver nas fases próprias)

### #3 — CAPI: correção de outcome vs. dedup/supersession da Meta (blocker antes de `CAPI_TEST`)
O spec deriva `event_id` **determinístico** por `workspace + journey + outcome-version`. Uma correção de resultado (ex.: uma venda que afinal foi cancelada) gera **nova `outcome-version` → novo `event_id`**.
**Problema:** a interação entre esse novo `event_id` e o mecanismo de **dedup/supersession do lado da Meta** não está especificada. A Meta deduplica eventos por `event_id`; um `event_id` novo para o "mesmo" evento corrigido pode ser tratado como um **evento adicional**, levando a **dupla contagem** de uma conversão que era suposto ser uma correção.
**Ação:** especificar a semântica de supersession (como a Meta trata o par antigo/novo `event_id`) **antes** de `CAPI_TEST`. Pode ficar para a fase de CAPI, mas registado como blocker já.
**Nota:** dependência externa `[UNVERIFIED EXTERNAL]` — o comportamento exato de dedup da Meta tem de ser confirmado contra a documentação oficial da CAPI, não assumido.

### #4 — Blast radius do plano de dados único (não aceitar como padrão produtivo)
O piloto Haven usa o **mesmo projeto/DB Supabase** para Lab e produção do piloto (*single data plane*, sem buffer de staging entre os dois).
**Problema:** raio de dano elevado. Sem tampão, um erro no piloto toca o mesmo plano de dados que o Lab.
**Ação:** separar planos de dados de Lab e produção antes do piloto real. Se uma restrição externa forçar plano único, isso vira exceção explícita com backup, restore testado, privilégios mínimos e autorização humana.

### #5 — Sem gate numérico de cobertura de testes
O padrão do utilizador é **80%**. O spec tem 12 cenários P0 e integridade de teste, mas **nenhum limiar numérico no CI**.
**Ação:** adicionar gate numérico de cobertura.

### #6 — Cancelamento atómico de follow-up não está no modelo de domínio
O cancelamento atómico de follow-up (cenário P0 #8) aparece nos cenários de teste mas **não está modelado no domínio** (§5.4).
**Ação:** especificar o mecanismo (estado + transição atómica).

### #7 — Precedência entre `ownership_epoch` e `control_generation` indefinida
Não há semântica definida para o caso em que `ownership_epoch` é válido mas `control_generation` está stale (ou vice-versa).
**Ação:** definir a ordem de validação e o resultado. (Relevante para os mesmos races de concorrência do #2.)

### #8 — LGPD ausente (blocker para DoD de GA)
Sem política de retenção, direitos do titular, ou base de consentimento.
**Ação:** entrar num DoD de GA (General Availability) + ADR próprio.

### #9 — Instabilidade do North Star (Closed-Loop Coverage)
A métrica "Closed-Loop Coverage" fica **ruidosa sob baixa cobertura de atribuição** (denominador pequeno → percentagem instável).
**Ação:** definir um piso de cohort ou uma banda de confiança antes de usar a métrica para decisões.

### Dependências externas Meta (#4/#5 do GSTACK)
Elegibilidade WABA e aprovação de Business Agent estão **fora do nosso controlo** e corretamente rotuladas `[UNVERIFIED EXTERNAL]`. O roadmap **não deve prometer datas** ancoradas em aprovações da Meta.

---

## Recomendação de prioridade (da revisão)

Antes de qualquer integração externa:
1. **Corrigir a verdade de estado:** Haven observer é pacote local, não conexão real.
2. **Fechar ADR 0001:** cutover direto para Supabase Auth no Lab.
3. **Fechar ADR 0002:** SOS permanece blue e único owner real até handoff autorizado.
4. **Separar o plano de dados de Lab e produção.**

Podem ficar para fases posteriores, mas **registados como blockers agora:**
3. **#3** (supersession CAPI) — antes de `CAPI_TEST`.
4. **#8** (LGPD) — num DoD de GA.

---

## O que já foi feito vs. o que falta (para a IA revisora saber onde estamos)

- **Feito:** ADR 0001 e ADR 0002 existem como *stubs* em estado **Proposed**.
- **Decisão recomendada:** ADR 0001 = cutover direto Supabase no Lab; ADR 0002 = SOS blue/owner único até cutover, sem dependência runtime do Lean.
- **Falta:** o dono aceitar formalmente as decisões; corrigir `NEXT_SESSION.md`; registar #3 e #8 como blockers formais; endereçar #4–#7 e #9 nas fases próprias.

## Limite ativo (não violar)
Toda esta análise é documentação/arquitetura. Executar qualquer handoff real, tocar número/token/webhook/CAPI reais, enviar mensagem ou alterar campanhas exige **autorização explícita + evidência de Lab**. Nada aqui autoriza isso.
