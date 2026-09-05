# Low-ticket SOS Vendas

Coleção de 48 produtos digitais de aplicação única para WhatsApp, operação comercial e implantação profissional de IA.

## O que está neste diretório
- `pXX-*/`: pacote individual com `material.pdf`, fonte editável, página de venda e README.
- `releases/`: ZIP pronto para anexar ou entregar.
- `cakto-import.json`: manifesto de importação com preço, imagem, página, entrega e estado do checkout.
- `cakto-checkouts.json`: fatos confirmados no painel Cakto que sobrevivem à regeneração da vitrine.
- `landing/produtos/downloads/`: ZIPs usados como entrega por e-mail da Cakto até a migração para uma área de membros.
- `PRECIFICACAO.md`: mapa de preços-teste e hipóteses de pacote.

## Regenerar
```bash
python3 scripts/low-ticket/generate_products.py
```

## Publicação segura
A vitrine pública já lista os 48 itens. A publicação na Cakto exige sessão autenticada e conferência do conteúdo entregue; por isso os checkouts permanecem nulos no manifesto até a etapa de importação. Os links em `downloads/` são provisórios e compartilháveis; migrar para Cakto Members antes de escalar anúncios.
