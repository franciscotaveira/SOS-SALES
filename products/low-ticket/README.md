# Low-ticket SOS Vendas

Coleção de 48 produtos digitais de aplicação única para WhatsApp, operação comercial e implantação profissional de IA.

## O que está neste diretório
- `pXX-*/`: pacote individual com `material.pdf`, fonte editável, página de venda e README.
- `releases/`: ZIP pronto para anexar ou entregar.
- `cakto-import.json`: manifesto de importação com preço, imagem, página e estado do checkout.
- `PRECIFICACAO.md`: mapa de preços-teste e hipóteses de pacote.

## Regenerar
```bash
python3 scripts/low-ticket/generate_products.py
```

## Publicação segura
A vitrine pública já lista os 48 itens. A publicação na Cakto exige sessão autenticada e conferência do conteúdo entregue; por isso os checkouts permanecem nulos no manifesto até a etapa de importação.
