# Runbook — Rotação de Segredos sem Exposição

## Estado

As credenciais rotacionadas em 22 de agosto de 2026 foram novamente expostas em
evidência plaintext. Trate banco, Meta, OpenRouter e NVIDIA como comprometidos
até nova rotação e invalidação comprovadas.

## Regras absolutas

- Nunca copie senha, token, DSN ou conteúdo de `.env` para chat, relatório, RTF,
  issue, commit ou comando inline.
- Não dependa apenas de `HISTCONTROL=ignorespace`. Para atualizar segredos no VPS,
  utilize arquivo temporário com permissão `0600`, editor seguro (`vim`, `nano`) ou
  leitura interativa sem eco (`read -s`); remova o temporário de forma segura logo após o uso.
- Gere e revogue credenciais somente nos dashboards oficiais ou em um terminal
  seguro com entrada oculta.
- Guarde o novo valor diretamente em um gerenciador de senhas.
- Evidência deve conter apenas status booleanos padronizados, códigos HTTP e
  timestamps — nunca segredos, DSNs completas, comandos com valores inline ou
  fingerprints derivados diretamente de credenciais.
- Não remova a contenção do Caddy durante a rotação.

## Sequência obrigatória

1. Preserve logs e registre o início do incidente sem copiar segredos.
2. Rotacione a senha da role de runtime no Supabase pelo fluxo oficial.
3. Revogue e regenere os tokens Meta, OpenRouter e NVIDIA pelos dashboards.
4. Atualize `/opt/sos-sales/.env.production` no VPS com permissões finais `0600 root:root`.
5. Instale/configure a CA do Supabase e mantenha verificação TLS estrita.
6. Force-recreate somente `sos-sales-api` e registre o novo `StartedAt`.
7. Valide que cada credencial anterior falha e a nova funciona.
8. Valide `/health`, `/ready`, logs sanitizados e contenção 403.
9. Remova de forma segura o arquivo plaintext
   `/Users/franciscotaveira.ads/1111 codex/rotations.rtf` somente depois que os
   valores nele contidos forem invalidados.
10. Execute nova varredura de repositório, histórico, assets e artefatos antes
    de iniciar canário.

## Formato oficial de evidência por fornecedor

Para cada fornecedor rotacionado (Supabase, Meta, OpenRouter, NVIDIA), emitir exatamente o bloco:

```text
PROVIDER=<nome>
ROTATED=true
OLD_REJECTED=true
NEW_ACCEPTED=true
RUNTIME_RECREATED=true
STARTED_AT_CHANGED=true
HEALTH_OK=true
READY_OK=true
SECRET_VALUE_EXPOSED=false
```

Qualquer evidência contendo valor secreto, DSN com senha ou token plaintext
invalida a própria rotação e exige novo ciclo imediato.
