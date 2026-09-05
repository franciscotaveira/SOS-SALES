import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { marked } = require('/Users/franciscotaveira.ads/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/marked');
const dir = path.resolve('docs/low-ticket/portfolio/08-orcamento-claro-em-uma-pagina/v2');
const css = `@page {size:A4;margin:18mm} body{font:11pt/1.5 Arial,sans-serif;color:#192b38;max-width:850px;margin:32px auto;padding:24px}h1{font-size:30pt;color:#006b58}h2{font-size:19pt;border-bottom:2px solid #00a884;padding-bottom:8px;margin-top:32px}h3{font-size:14pt}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eef5f3;border:1px solid #cadbd5;padding:16px;font:10pt/1.5 Arial,sans-serif}h1,h2,h3{page-break-after:avoid}p,li{orphans:3;widows:3}button{padding:9px 16px;background:#006b58;color:white;border:0;border-radius:6px;cursor:pointer}@media print{button,nav{display:none}body{margin:0;padding:0;max-width:none}}`;
for (const name of ['KIT','MODELO']) {
 const md = fs.readFileSync(path.join(dir,`${name}.md`),'utf8');
 const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name==='KIT'?'Proposta pronta com IA':'Modelo de proposta'}</title><style>${css}</style></head><body><nav><button onclick="window.print()">Imprimir / salvar PDF</button></nav>${marked.parse(md)}<script>document.querySelectorAll('pre').forEach(p=>{const b=document.createElement('button');b.textContent='Copiar prompt';b.onclick=async()=>{try{await navigator.clipboard.writeText(p.textContent);b.textContent='Copiado';}catch{b.textContent='Selecione o texto e copie manualmente';}};p.before(b);});</script></body></html>`;
 fs.writeFileSync(path.join(dir,`${name}.html`),html);
}
console.log('KIT.html e MODELO.html gerados.');
