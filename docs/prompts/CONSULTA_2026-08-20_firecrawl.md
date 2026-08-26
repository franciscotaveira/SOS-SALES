# Consulta — Análise competitiva via Firecrawl MCP (2026-08-20)

Execução do prompt [`CONSULTA_DOCUMENTOS_IA.md`](./CONSULTA_DOCUMENTOS_IA.md), `MODO_INTERATIVO=nao`.

**Documentos lidos (existência confirmada via `cat`):**

- `/tmp/analysis/final_analysis/SOS_SALES_COMPETITOR_ANALYSIS.md` (doravante `ANALYSIS.md`)
- `/tmp/analysis/github_info/dev_search_results.json` (doravante `dev_search.json`)
- `/tmp/analysis/github_info/scraped_repos.json` (doravante `scraped.json`)

---

### RESPOSTA PARA [A1] — padrões de arquitetura comuns

O único documento com conteúdo analítico é o `ANALYSIS.md`. Ele aponta quatro padrões transversais: separação núcleo/UI ("modular design"), exposição via API ("API-first"), adoção de MCP como camada de integração, e forte investimento em documentação. Na stack, JS/TS domina as UIs e servidores MCP; Python domina os frameworks de IA (Pipecat, CrewAI).

Os dois JSON não contêm dados de arquitetura: `dev_search.json` lista só 18 nomes de repositório e `scraped.json` tem 2 erros e 1 entrada com `language: "Unknown"`. Portanto, os padrões acima são afirmações do autor do relatório, não derivadas de código ou README inspecionados.

**EVIDÊNCIA VERIFICÁVEL**

- `ANALYSIS.md:Key Findings §1 Technology Stack Patterns` — "JS/TS dominant in web agent UIs / MCP servers; Python in AI frameworks; trends: MCP adoption, modular design, API-first, docs focus"
- `ANALYSIS.md:Key Findings §3 Common Patterns` — separation of concerns, strong docs, community engagement, integration focus, extensibility
- `dev_search.json` — 18 objetos com apenas a chave `repo`
- `scraped.json` — `anything-llm: "No content returned"`, `crewAI: "No content returned"`, `firecrawl-mcp-server: language "Unknown", stars "Unknown"`

---

### RESPOSTA PARA [A2] — uso do Firecrawl MCP Server e limitações

O servidor foi executado via **stdio** (`node /tmp/analysis/firecrawl-mcp-server/dist/index.js`) em vez de HTTP, expondo 25 ferramentas; as usadas foram `firecrawl_search` (com `categories: ["developer"]`), `firecrawl_scrape` e `firecrawl_map`. A escolha por stdio é justificada no documento como forma de evitar conflito com portas já em uso (3000, 5000, 5002, 5173, 9119) — alinhado ao CLAUDE.md do projeto.

Limitação registrada: o scraping de repositórios GitHub falhou por proteção anti-bot. O próprio relatório marca isso como "✅ validating need for alternative approaches", o que é uma reclassificação de falha em sucesso. `scraped.json` confirma: 2 de 3 alvos sem conteúdo, e o terceiro com metadados todos "Unknown" apesar de `markdown_length: 70906`.

**EVIDÊNCIA VERIFICÁVEL**

- `ANALYSIS.md:Methodology` — stdio transport, caminho do binário, 25 tools, `firecrawl_search` com `categories: ["developer"]`
- `ANALYSIS.md:Conclusion` — lista de portas evitadas (3000, 5000, 5002, 5173, 9119)
- `ANALYSIS.md:Technical Validation` — "Repository scraping attempted (results show GitHub's bot protection, validating need for alternative approaches)"
- `scraped.json` — os 3 registros citados em A1

---

### RESPOSTA PARA [B3] — três práticas adaptáveis ao SOS Sales

1. **Documentação modular por módulo/fluxo** (Pipecat, CrewAI): o relatório cita repositórios dedicados só a docs (`pipecat-ai/docs`, `nickbaumann98/cline_docs`, `gitroomhq/postiz-docs`) como sinal de que documentação é tratada como produto.
2. **Biblioteca de exemplos por caso de uso** (`pipecat-examples`, `crewAI-examples`, `firecrawl-app-examples`): repositórios de exemplos separados do núcleo — para o SOS Sales, corresponderia a uma pasta de fluxos prontos por tipo de negócio, mantendo o núcleo agnóstico de nicho.
3. **Orquestração por papéis** (CrewAI): o relatório sugere mapear papéis de venda (qualificação, follow-up, fechamento) como agentes com responsabilidade única.

As três práticas estão no documento como recomendação do autor; nenhuma foi verificada contra o código dos concorrentes (ver A1/A2).

**EVIDÊNCIA VERIFICÁVEL**

- `ANALYSIS.md:Gaps and Opportunities › Areas for Enhancement` — itens 1 (modular documentation pattern), 3 (example library per niche), 4 (process orientation — CrewAI roles)
- `dev_search.json` — nomes `pipecat-ai/docs`, `pipecat-ai/pipecat-examples`, `crewAIInc/crewAI-examples`, `firecrawl/firecrawl-app-examples`, `gitroomhq/postiz-docs`, `nickbaumann98/cline_docs`
- `ANALYSIS.md:Key Findings §2 Repository-Specific Insights` — CrewAI "role-based orchestration"

---

### RESPOSTA PARA [B4] — lacunas comuns dos concorrentes

Não há menção a lacunas específicas por concorrente nos documentos fornecidos. O `ANALYSIS.md` formula as oportunidades como afirmações genéricas ("competitors often overlook…") sem apontar qual repositório deixa de fazer o quê, e os JSON não trazem conteúdo que permita verificar.

O que existe é uma lista de áreas em que o SOS Sales *poderia* diferenciar-se (design ADHD-first, "Menos é Mais", framework de verificação "tem que testar tudo"). Essas áreas são derivadas das preferências do utilizador, não de uma comparação com os 18 repositórios.

**EVIDÊNCIA VERIFICÁVEL**

- `ANALYSIS.md:Gaps and Opportunities › Areas for Enhancement` — formulações genéricas sem atribuição a repositório
- `ANALYSIS.md:Medium Term` — "ADHD-first design system", "'tem que testar tudu' verification framework", "'Menos é Mais' design system (gap-2/4/6, text-xs minimum)"
- `scraped.json` — ausência de conteúdo que permita comparação

---

### RESPOSTA PARA [B5] — o que o SOS Sales já faz bem, e a base

O relatório lista: fluxos otimizados para TDAH, templates universais, princípio "Menos é Mais", cultura "tem que testar tudo" e deploy não convencional. A base é explícita no próprio título da secção: **"Inferred from User Preferences"** — ou seja, foi extraído do histórico de conversa com o utilizador, não de inspeção do código do SOS Sales nem de comparação com concorrentes.

**EVIDÊNCIA VERIFICÁVEL**

- `ANALYSIS.md:Gaps and Opportunities › What SOS Sales Does Well (Inferred from User Preferences)` — os 5 itens e o qualificador "Inferred"

---

### RESPOSTA PARA [C6] — evidência verificável vs. inferência

| Afirmação | Tipo | Fonte |
| --- | --- | --- |
| Firecrawl MCP corre via stdio e expõe 25 tools | Verificável (procedimento descrito) | `ANALYSIS.md:Methodology`, `Technical Validation` |
| `firecrawl_search` devolveu 18 repositórios | Verificável (dados brutos) | `dev_search.json` |
| Scraping do GitHub falhou | Verificável (dados brutos) | `scraped.json` |
| Padrões de arquitetura (MCP, modular, API-first) | Inferência — sem dados brutos | `ANALYSIS.md:Key Findings §1, §3` |
| Insights por repositório (ex.: AnythingLLM multi-LLM) | Inferência — `brouser_uses` é explicitamente "based on name" | `ANALYSIS.md:Key Findings §2` |
| Forças do SOS Sales | Inferência do perfil do utilizador | `ANALYSIS.md:What SOS Sales Does Well` |
| Lacunas dos concorrentes | Inferência sem atribuição | `ANALYSIS.md:Areas for Enhancement` |

Em resumo: só a **metodologia de coleta** e a **lista de nomes** têm dados brutos. Tudo que é análise competitiva é opinião do autor sem material de suporte nos ficheiros.

**EVIDÊNCIA VERIFICÁVEL**

- `ANALYSIS.md:Key Findings §2` — "Brouser_uses (based on name)"
- `ANALYSIS.md:Files Generated` — `analyses/repos_analysis.json` marcado como placeholder
- `dev_search.json`, `scraped.json` — conteúdo integral conforme A1

---

### RESPOSTA PARA [C7] — ações mensuráveis (30 dias)

O `ANALYSIS.md:Immediate Actions` propõe integrações (CRM, WhatsApp/Telegram/email, Meta Ads/Google Ads, analytics) e fluxos de exemplo por negócio (Brazuca, Escovaria Haven, Suzana, genérico); `Conclusion › Recommended Next Step` sugere um piloto MCP com uma ferramenta de negócio. Nenhuma ação vem com responsável, prazo ou métrica — isso é acrescentado abaixo em PRÓXIMOS PASSOS.

**EVIDÊNCIA VERIFICÁVEL**

- `ANALYSIS.md:Immediate Actions` — lista de integrações e fluxos de exemplo
- `ANALYSIS.md:Conclusion › Recommended Next Step` — piloto MCP com CRM ou plataforma de ads

---

### RESUMO EXECUTIVO

- Dos 3 ficheiros, só o `ANALYSIS.md` tem análise; os JSON têm 18 nomes de repo e 3 scrapes falhados.
- A coleta (stdio, 25 tools, `firecrawl_search`) está bem documentada; a análise competitiva não tem dados brutos de suporte.
- As "forças do SOS Sales" são inferidas das preferências do utilizador, não comparadas com concorrentes.
- Lacunas dos concorrentes: sem evidência por repositório.
- Ações úteis e agnósticas de nicho: docs modulares, biblioteca de exemplos, agentes por papel.

### PRÓXIMOS PASSOS CONFIRMÁVEIS

1. **Refazer a coleta com fonte que não bloqueie bots** (API GitHub `gh repo view --json` ou `gh api` para README/stars/language dos 18 repos) · Francisco / Claude · até 27/08 · métrica: `scraped.json` com 18/18 entradas sem `"error"` e sem `"Unknown"`.
2. **Reescrever `Key Findings §1–§3` citando README/código** de cada repo · Claude · até 03/09 · métrica: 100% das afirmações de arquitetura com link para ficheiro do repo fonte.
3. **Criar `docs/examples/` com 1 fluxo genérico + 1 por negócio piloto** seguindo o padrão `*-examples` dos concorrentes · Francisco · até 10/09 · métrica: fluxo genérico corre ponta a ponta no Docker Lab (`localhost:3333`).
4. **Piloto MCP com uma integração real** (candidato: Meta Ads, já há tooling no projeto) · Claude · até 19/09 · métrica: 1 tool MCP chamada a partir do SOS Sales com resposta registrada em log.
5. **Substituir "Inferred from User Preferences" por evidência** — levantar 3 métricas do produto atual (ex.: cliques por ação, tempo até primeira resposta) · Francisco · até 19/09 · métrica: secção reescrita com números medidos.

### LACUNAS

- B4 — lacunas por concorrente: sem cobertura.
- A1 — padrões de arquitetura: afirmados, mas sem dados brutos nos ficheiros.
- Stars, linguagem e licença dos 18 repositórios: ausentes (`scraped.json` só "Unknown"/erro).
- Qualquer comparação de funcionalidade SOS Sales × concorrente: ausente.

---

## Veredicto sobre o formato

Aguentou. O que funcionou: a regra de citação obrigatória expôs imediatamente que 2 dos 3 documentos são quase vazios, e a frase fixa "Não há menção a…" evitou inventar lacunas dos concorrentes. O que ficou frágil: com fontes finas, a secção de EVIDÊNCIA repete os mesmos 3 registros do JSON em várias respostas — aceitável, mas vale considerar uma regra "citar uma vez e referenciar" para documentos pequenos. A secção LACUNAS (acrescentada ao prompt do Hermes) foi a mais útil para o leitor.
