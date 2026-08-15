<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/46f1b961-4409-4534-b2d6-f5721fb204d9

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Operação autenticada

O cockpit só inicia em modo de API quando as três variáveis abaixo estão presentes:

```bash
VITE_SOS_API_URL=https://api.seudominio.com/api/v1
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica
```

O cliente Supabase no navegador usa apenas a chave pública e fornece o JWT da
sessão ao transporte do SOS Sales. Nunca exponha uma `service_role` no frontend.
Sem as três variáveis, builds de produção falham fechados e não exibem fixtures.
Para uma demonstração visual isolada, use somente `VITE_DEMO_MODE=true` fora de
produção; esse modo não se conecta ao Supabase ou à API.
