# Dependency Map

## Grafo principal

```text
G-00 → G-01/G-02 → G-03..G-06
   ↓
P-01..P-06 + OPS-F
   ├────────→ UI foundation
   ↓
CH-00..CH-12
   ↓
CRM-01..CRM-07
   ├────────→ UI-01..UI-10
   ├────────→ META-01..CAPI-06
   └────────→ AI-01..AI-10
                    ↓
             ONB-01..ONB-10
                    ↓
                   OPS-R
                    ↓
             MIG-01..MIG-09
                    ↓
             Beta → GA
```

## Paralelismo permitido

- revisão da fundação visual enquanto CH é estabilizado;
- especificação Meta/CAPI após contratos comerciais estabilizarem;
- desenho de evals de IA após modelo de handoff;
- observabilidade e runbooks acompanham todas as fases;
- migração pode ser preparada sem executar cutover.

## Dependências externas

| ID | Dependência | Afeta | Tratamento |
|---|---|---|---|
| EXT-01 | projeto Supabase/JWKS de homologação | sessão/onboarding | `BLOCKED_EXTERNAL`; testes locais não equivalem a homologação |
| EXT-02 | Meta App Review e permissões | Embedded Signup/WABA/CAPI | trilha externa com evidência oficial |
| EXT-03 | elegibilidade de coexistência | número Haven | validar antes de qualquer cutover |
| EXT-04 | ativos Meta corretos | atribuição/CAPI | inventário e diagnóstico por workspace |
| EXT-05 | ambiente WAHA homologável | CH-09/10 | profile Docker e instância de teste |
| EXT-06 | agenda externa/Trinks | CRM-06 | porta agnóstica; decidir se requisito do piloto |

Bloqueio externo não para trabalho independente. O board deve indicar responsável, próxima verificação e alternativa segura.
