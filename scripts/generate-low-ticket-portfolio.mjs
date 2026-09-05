#!/usr/bin/env node

/**
 * Gera os kits locais da esteira low-ticket a partir do catálogo de hipóteses.
 *
 * Os arquivos gerados são rascunhos de validação. O script não publica,
 * envia e-mail, cria páginas remotas nem altera a Cakto.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { marked } = require("marked");

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, "docs", "CATALOGO_POSSIBILIDADES_LOW_TICKET_2026-09-05.md");
const OUT_ROOT = path.join(ROOT, "docs", "low-ticket", "portfolio");
const DATE = "05/09/2026";

const categoryConfig = {
  1: {
    title: "Mensagens para copiar, adaptar e enviar",
    buyer: "vendedor, autônomo ou dono que atende pessoalmente pelo WhatsApp",
    format: "Notion + PDF",
    fields: [
      ["Situação", "select: primeiro contato, dúvida, objeção, retomada, pós-venda"],
      ["Contexto conhecido", "text: o que o cliente já informou"],
      ["Objetivo desta mensagem", "text"],
      ["Resposta adaptável", "text"],
      ["Próxima ação", "text"],
      ["Condição de parada", "text"],
      ["Aprovada em", "date"],
    ],
    views: "Biblioteca por situação; mensagens em revisão; mensagens aprovadas; itens que precisam de handoff.",
    steps: [
      "Escolha uma situação real e escreva o contexto que já é conhecido.",
      "Defina o objetivo da próxima mensagem antes de redigir o texto.",
      "Escreva uma versão curta, com uma ação clara e uma condição de parada.",
      "Teste com um exemplo fictício e registre o que precisou ser adaptado.",
      "Aprove somente mensagens que respeitam preço, disponibilidade e limites reais da empresa.",
    ],
    guardrail: "Não enviar automaticamente, não inventar preço ou disponibilidade e não transformar o material em spam.",
  },
  2: {
    title: "Apresentação comercial pronta para editar",
    buyer: "prestador de serviço, pequeno comércio ou profissional independente",
    format: "PDF + Notion",
    fields: [
      ["Oferta", "text"],
      ["Cliente / segmento", "text"],
      ["Problema e objetivo", "text"],
      ["Entregáveis", "text"],
      ["Não incluído", "text"],
      ["Prazo e premissas", "text"],
      ["Investimento e validade", "text"],
      ["Próximo passo / aceite", "text"],
    ],
    views: "Propostas em rascunho; aguardando resposta; aceitas; vencidas; pedidos fora do escopo.",
    steps: [
      "Descreva o problema do cliente antes de apresentar a solução.",
      "Liste entregáveis observáveis e explicite o que fica fora do escopo.",
      "Registre premissas, dependências, prazo, investimento e validade.",
      "Faça uma revisão por outra pessoa ou use a própria checklist antes de enviar.",
      "Marque a próxima ação e a data de retorno no momento do envio.",
    ],
    guardrail: "Não prometer resultado financeiro, integração ou prazo que dependa de acesso ainda não fornecido.",
  },
  3: {
    title: "Conteúdo e entrada de conversas",
    buyer: "dono de negócio, vendedor ou responsável por conteúdo",
    format: "Notion + PDF",
    fields: [
      ["Oferta relacionada", "relation/text"],
      ["Dúvida ou dor observada", "text"],
      ["Ângulo", "select: prova, explicação, comparação, bastidor, objeção"],
      ["Formato e canal", "select"],
      ["Roteiro / briefing", "text"],
      ["CTA e intenção esperada", "text"],
      ["Evidência e resultado", "text"],
      ["Status", "select: ideia, em produção, aprovado, publicado, revisado"],
    ],
    views: "Calendário da oferta; pautas por dúvida; peças em produção; resultados por campanha.",
    steps: [
      "Escolha uma oferta real que possa receber conversas.",
      "Registre uma dúvida ou objeção observada, sem inventar a voz do público.",
      "Crie um ângulo e um roteiro que levem a uma ação específica.",
      "Publique uma peça e registre a origem das conversas recebidas.",
      "Revise o que gerou conversa útil, não somente alcance.",
    ],
    guardrail: "Não prometer alcance, leads ou vendas. Não usar depoimentos, imagens ou dados sem autorização.",
  },
  4: {
    title: "Agenda, comparecimento e atendimento de serviços",
    buyer: "negócio de serviços com horários marcados",
    format: "Notion + PDF",
    fields: [
      ["Pessoa / oportunidade", "text"],
      ["Serviço", "text"],
      ["Data e horário confirmados", "date/text"],
      ["Local / instruções", "text"],
      ["Política aplicável", "text"],
      ["Ação esperada", "text"],
      ["Status", "select: solicitado, confirmado, remarcação, cancelado, concluído"],
      ["Responsável / handoff", "person/text"],
    ],
    views: "Agenda de hoje; confirmações pendentes; remarcações; faltas; handoffs.",
    steps: [
      "Registre somente horários e condições confirmados pelo negócio.",
      "Envie a orientação necessária e peça uma ação objetiva.",
      "Marque confirmação, remarcação ou cancelamento, sem apagar o histórico.",
      "Encaminhe exceções para a pessoa responsável.",
      "Revise semanalmente faltas, remarcações e pontos de confusão.",
    ],
    guardrail: "Não afirmar disponibilidade sem consulta válida. Para nichos regulados, revisar o conteúdo com profissional habilitado.",
  },
  5: {
    title: "Pós-venda e relacionamento com clientes",
    buyer: "negócio com compradores existentes",
    format: "Notion + PDF",
    fields: [
      ["Cliente", "text"],
      ["Última compra / atendimento", "date/text"],
      ["Ocasião de contato", "select: recebimento, uso, avaliação, indicação, recompra, renovação"],
      ["Elegibilidade", "select: sim, não, revisar"],
      ["Preferência / consentimento", "text"],
      ["Próxima ação", "text"],
      ["Resultado / margem", "text"],
      ["Saída", "select: respondeu, concluiu, opt-out, encerrar"],
    ],
    views: "Clientes elegíveis; contatos agendados; opt-outs; recompra; renovação; aprendizados.",
    steps: [
      "Defina a ocasião do contato e quem não deve ser abordado.",
      "Confirme se a mensagem é pertinente à relação e à preferência registrada.",
      "Ofereça uma ação simples e registre a resposta.",
      "Pare no opt-out, na ausência de pertinência ou no limite definido.",
      "Meça resultado e margem antes de repetir a ação.",
    ],
    guardrail: "Respeitar consentimento, opt-out, políticas do canal e a legislação aplicável. O kit não substitui revisão jurídica.",
  },
  6: {
    title: "Planilhas e pequenas ferramentas comerciais",
    buyer: "dono, autônomo ou gestor de pequena equipe",
    format: "Planilha/Notion + PDF",
    fields: [
      ["Registro", "title"],
      ["Origem / canal", "select/text"],
      ["Etapa / status", "select"],
      ["Valor ou custo", "number"],
      ["Próxima ação", "text"],
      ["Data da próxima ação", "date"],
      ["Responsável", "person/text"],
      ["Resultado / motivo de perda", "text"],
    ],
    views: "Hoje; atrasados; por canal; ganhos e perdas; revisão semanal; dados desconhecidos.",
    steps: [
      "Copie o modelo e preencha o exemplo antes de inserir dados reais.",
      "Defina quais campos são obrigatórios para sua decisão.",
      "Registre uma próxima ação ou um motivo explícito para encerrar.",
      "Faça uma revisão semanal com números e amostra de registros.",
      "Corrija o processo quando houver dados ausentes, não maquie o indicador.",
    ],
    guardrail: "Ferramenta manual não substitui CRM, integração ou CAPI. Não tratar correlação como atribuição causal.",
  },
  7: {
    title: "Treinamento e padrão de atendimento",
    buyer: "dono ou líder que precisa orientar vendedores",
    format: "PDF + Notion",
    fields: [
      ["Pessoa", "person/text"],
      ["Habilidade / cenário", "text"],
      ["Material de referência", "url/text"],
      ["Simulação realizada", "date/text"],
      ["Critério de prontidão", "text"],
      ["Evidência observada", "text"],
      ["Próximo treino", "date/text"],
      ["Status", "select: não iniciado, em treino, acompanhado, pronto, reciclar"],
    ],
    views: "Plano de 5 dias; simulações; pontos de handoff; pessoas em reciclagem; prontidão.",
    steps: [
      "Defina a função e o comportamento que a pessoa precisa demonstrar.",
      "Apresente o padrão com um exemplo fictício e uma exceção.",
      "Faça uma simulação curta e registre evidências observáveis.",
      "Dê uma correção por vez e repita o cenário.",
      "Libere a pessoa somente quando o critério de prontidão estiver preenchido.",
    ],
    guardrail: "É treinamento interno, não certificação oficial. Não expor dados pessoais de clientes nas simulações.",
  },
  8: {
    title: "Produtos para quem vende implantação de IA",
    buyer: "freelancer, consultor ou pequena agência",
    format: "PDF + Notion",
    fields: [
      ["Projeto / cliente", "text"],
      ["Etapa", "select: descoberta, proposta, configuração, teste, aceite, operação"],
      ["Dependência", "text"],
      ["Responsável", "person/text"],
      ["Risco / decisão", "text"],
      ["Evidência / aceite", "text"],
      ["Suporte e atualização", "text"],
      ["Próximo passo", "text"],
    ],
    views: "Projetos por etapa; bloqueios; decisões pendentes; aceite; manutenção; escopo extra.",
    steps: [
      "Descreva o resultado do projeto e as premissas antes de falar de ferramenta.",
      "Separe setup, recorrência, consumo, suporte e itens fora do escopo.",
      "Registre dependências e responsáveis em uma página compartilhável.",
      "Colete evidência de teste e aceite antes de declarar a etapa concluída.",
      "Feche a entrega com limites, documentação e canal de suporte definidos.",
    ],
    guardrail: "Não prometer conformidade, vendas ou disponibilidade sem evidência. Não solicitar senhas em templates.",
  },
};

const slugify = (input) => input
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 72);

const esc = (value) => String(value).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, " ");

function parseCatalog(markdown) {
  const lines = markdown.split(/\r?\n/);
  let category = 0;
  let buyer = "";
  const products = [];
  for (const line of lines) {
    const heading = line.match(/^##\s+(\d+)\.\s+(.+)/);
    if (heading) {
      category = Number(heading[1]);
      buyer = "";
      continue;
    }
    if (line.startsWith("Comprador:")) {
      buyer = line.replace(/^Comprador:\s*/, "").trim();
      continue;
    }
    if (!/^\|\s*\d{2}\s*\|/.test(line)) continue;
    const parts = line.split("|").slice(1, -1).map((item) => item.trim());
    if (parts.length < 4 || parts[0] === "ID") continue;
    const [id, name, delivery, mark] = parts;
    const config = categoryConfig[category] || categoryConfig[8];
    const buyerText = (buyer || config.buyer).replace(/\.+$/, "");
    products.push({ id, name, delivery, mark, category, buyer: buyerText, config });
  }
  return products;
}

function markMeaning(mark) {
  if (mark.includes("C")) return "Comparar com EKO e Conversas Prontas antes de publicar.";
  if (mark.includes("P")) return "Tema já apareceu na pesquisa interna; validar se há material existente.";
  return "Hipótese acrescentada ao catálogo; criar e validar do zero.";
}

function outputFormat(product) {
  return product.config.format;
}

function sampleFor(product) {
  const c = product.config;
  const examples = {
    1: "Situação: “orçamento enviado”; Contexto conhecido: “cliente pediu prazo”; Objetivo desta mensagem: “confirmar se há dúvida”; Próxima ação: “cliente responder ou encerrar”;",
    2: "Oferta: “implantação de atendimento”; Cliente / segmento: “empresa Aurora”; Entregáveis: “configuração, teste e treinamento”; Não incluído: “gestão diária”;",
    3: "Oferta relacionada: “serviço principal”; Dúvida observada: “quanto custa e quando começa?”; Ângulo: “explicação”; CTA: “pedir diagnóstico”;",
    4: "Pessoa / oportunidade: “Cliente Aurora”; Serviço: “sessão inicial”; Data e horário confirmados: “10/09, 14h”; Ação esperada: “confirmar presença”;",
    5: "Cliente: “Cliente Aurora”; Última compra: “01/08”; Ocasião de contato: “uso inicial”; Elegibilidade: “revisar”; Próxima ação: “perguntar se precisa de ajuda”;",
    6: "Registro: “Oportunidade Aurora”; Origem / canal: “indicação”; Etapa / status: “em revisão”; Próxima ação: “enviar proposta”; Resultado: “a preencher”;",
    7: "Pessoa: “Vendedor Aurora”; Habilidade / cenário: “responder preço com contexto”; Simulação realizada: “10/09”; Critério de prontidão: “não inventa condição”;",
    8: "Projeto / cliente: “Empresa Aurora”; Etapa: “proposta”; Dependência: “aprovar escopo”; Responsável: “gestor do projeto”; Próximo passo: “marcar revisão”;",
  };
  return `Exemplo fictício — ${examples[product.category] || "Registro: “Empresa Aurora”; Contexto: “caso fictício”; Resultado: “registrar, executar uma vez e revisar”;"}`;
}

function productReadme(product, slug) {
  const c = product.config;
  return `# ${product.name}\n\n> **Rascunho de validação** · gerado em ${DATE}\n\n## Cartão da oferta\n\n- **Comprador:** ${product.buyer}.\n- **Formato:** ${outputFormat(product)}.\n- **Preço:** hipótese a testar; definir somente após validar compra e esforço de suporte.\n- **Resultado comprado:** ${product.delivery}.\n- **Origem no catálogo:** grupo ${product.category}, ID ${product.id}.\n- **Sobreposição:** ${markMeaning(product.mark)}\n\n## Promessa de uma frase\n\n> Resolva “${product.delivery.toLowerCase()}” com um modelo finito que você copia, preenche e usa em um caso real.\n\n## O que está incluído\n\n1. [Guia em PDF](./GUIA.pdf) e [fonte editável](./GUIA_PDF.md);\n2. [Template pronto para duplicar no Notion](./NOTION_TEMPLATE.md);\n3. exemplo fictício, checklist de conclusão e limites de uso;\n4. arquivo de dados quando o produto se beneficia de planilha.\n\n## O que não está incluído\n\n- implantação, automação, gestão de campanha ou acesso a contas;\n- consultoria ilimitada ou personalização individual;\n- promessa de vendas, leads, agenda cheia ou conformidade;\n- dados reais de clientes, depoimentos ou credenciais.\n\n## Como a pessoa usa\n\n1. Duplique a página ou abra o PDF.\n2. Preencha um único caso real.\n3. Execute a rotina uma vez.\n4. Registre evidência, pendência e próxima ação.\n5. Repita apenas depois de revisar o resultado.\n\n## Critério de sucesso do piloto\n\n- o comprador completa o artefato sem acompanhamento individual;\n- consegue explicar a diferença entre o template e o EKO;\n- usa o resultado em até sete dias;\n- aponta uma melhoria concreta ou decide que a dor não é prioritária.\n\n## Próximo movimento\n\nNão cadastrar como produto público antes de conferir o inventário e os complementos da Cakto. Se o caso pedir operação diária, encaminhar para uma solução adequada, como SOS Sales, em vez de ampliar este template.\n`;
}

function guide(product) {
  const c = product.config;
  const fieldsTable = c.fields.map(([name, type]) => `| ${esc(name)} | ${esc(type)} |`).join("\n");
  const steps = c.steps.map((step, i) => `${i + 1}. ${step}`).join("\n");
  return `# ${product.name}\n\n**Guia de aplicação — rascunho para validação**\n\n## Para que serve\n\nEste kit foi desenhado para ${product.buyer}. Ele ajuda a produzir: **${product.delivery}**. O kit não instala ferramentas nem opera contas do comprador.\n\n## Antes de começar\n\n- escolha uma situação real, mas remova nomes, telefones e qualquer dado que não seja necessário;\n- reúna somente as informações que a empresa consegue confirmar;\n- defina quem aprova preço, prazo, disponibilidade ou comunicação;\n- abra o template no Notion ou use a ficha em PDF.\n\n## Roteiro de uso\n\n${steps}\n\n## Ficha mínima\n\n| Campo | Tipo / orientação |\n|---|---|\n${fieldsTable}\n\n## Exemplo fictício\n\n${sampleFor(product)}\n\n## Revisão antes de usar\n\n- [ ] O resultado desta ficha pode ser verificado por outra pessoa?\n- [ ] As informações estão atualizadas e têm uma fonte conhecida?\n- [ ] O próximo passo tem responsável e prazo?\n- [ ] Existe uma condição explícita para parar, encerrar ou transferir?\n- [ ] Dados pessoais e promessas sem prova foram removidos?\n- [ ] O conteúdo não repete uma entrega já incluída no EKO ou em outro produto ativo?\n\n## Guardrails\n\n${c.guardrail}\n\nSe houver risco operacional, erro de preço, conflito de escopo ou pedido fora da alçada, interrompa a execução e faça handoff humano.\n\n## Como saber se funcionou\n\nA primeira execução deve deixar um artefato preenchido, uma evidência observável e uma próxima decisão. “Ficou bonito” não é critério de conclusão. Registre o que foi usado, o que ficou pendente e quanto suporte foi necessário.\n\n## Próxima oferta possível\n\nSe a pessoa precisa de várias pessoas, histórico, SLA, tarefas recorrentes, automação ou acompanhamento diário, este kit deixa de ser suficiente. O próximo passo deve ser uma solução operacional maior, não mais um PDF com campos.\n\n## Nota de versão\n\nProduto ainda não publicado. Preço, nome, página de venda, políticas e qualquer integração precisam de validação separada.\n`;
}

function notionTemplate(product) {
  const c = product.config;
  const properties = c.fields.map(([name, type]) => `- **${name}** — ${type}`).join("\n");
  const sampleCells = c.fields.map(([name]) => name === c.fields[0][0] ? "Empresa Aurora" : name === c.fields[1][0] ? "Exemplo fictício" : "preencher");
  const tableHeader = c.fields.map(([name]) => name).join(" | ");
  const tableSep = c.fields.map(() => "---").join(" | ");
  const tableRow = sampleCells.join(" | ");
  return `# ${product.name} — template duplicável\n\n> Copie esta página para o seu workspace. Ela é um ponto de partida editável, não um sistema hospedado pela nossa equipe.\n\n## Como duplicar\n\n1. Abra a página pública do produto quando ela for publicada.\n2. Clique em **Duplicate / Duplicar**.\n3. Escolha o seu workspace.\n4. Renomeie a cópia e apague o exemplo fictício antes de inserir dados reais.\n\n## Database principal: ${product.name}\n\n**Propriedades**\n\n${properties}\n\n**Visualizações sugeridas**\n\n- ${c.views}\n- Filtro padrão: mostrar somente itens que têm próxima ação ou status pendente.\n- Ordenação padrão: próxima ação crescente; depois, risco ou prioridade.\n\n## Registro inicial\n\n| ${tableHeader} |\n| ${tableSep} |\n| ${tableRow} |\n\nO registro acima é fictício. Substitua-o por um caso real somente depois de revisar privacidade, consentimento e necessidade de cada campo.\n\n## Template de página\n\n### Contexto\n\n- O que aconteceu?\n- O que já está confirmado?\n- Qual é o resultado desejado?\n\n### Decisão / execução\n\n- Próxima ação:\n- Responsável:\n- Prazo:\n- Evidência esperada:\n\n### Exceções e handoff\n\n- O que não pode ser decidido aqui?\n- Quem assume?\n- Qual resumo precisa ser transferido?\n\n### Fechamento\n\n- Resultado observado:\n- O que ficou pendente:\n- Próxima revisão:\n\n## Regras de manutenção\n\n- Não transforme todas as tabelas em campos obrigatórios: mantenha somente o que sustenta uma decisão.\n- Faça uma revisão semanal e arquive o que foi encerrado sem apagar histórico.\n- Não coloque senhas, tokens, documentos sensíveis ou dados de clientes sem necessidade.\n- Se a rotina passar a exigir envio automático, filas ou multiusuário, reavalie o uso de CRM/SOS Sales.\n`;
}

function csvFor(product) {
  if (product.category !== 6 && product.id !== "44") return null;
  const headers = product.config.fields.map(([name]) => name);
  const values = headers.map((_, i) => i === 0 ? "Empresa Aurora" : i === 1 ? "WhatsApp orgânico" : i === 2 ? "em revisão" : "preencher");
  return `${headers.join(",")}\n${values.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")}\n`;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function htmlDocument(title, markdown) {
  const body = marked.parse(markdown);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title><style>
@page{size:A4;margin:20mm 18mm 18mm}body{font-family:Arial,Helvetica,sans-serif;color:#152238;line-height:1.45;font-size:10.5pt}h1{color:#0b132b;font-size:24pt;border-bottom:2px solid #00a884;padding-bottom:6pt}h2{color:#2563eb;font-size:15pt;margin-top:20pt}h3{color:#7c3aed;font-size:12pt}blockquote{border-left:4px solid #00a884;padding:6pt 10pt;background:#f0fdf4}table{border-collapse:collapse;width:100%;margin:8pt 0}th{background:#0b132b;color:white;text-align:left}td,th{border:1px solid #cbd5e1;padding:5pt;vertical-align:top}code{background:#f1f5f9;padding:1pt 3pt}li{margin:3pt 0}.foot{color:#64748b;font-size:8pt;border-top:1px solid #cbd5e1;margin-top:20pt;padding-top:5pt}</style></head><body>${body}<div class="foot">SOS Sales · rascunho de validação · ${DATE}</div></body></html>`;
}

function renderPdf(productDir, title, markdown) {
  const htmlPath = path.join(productDir, "GUIA.html");
  const pdfPath = path.join(productDir, "GUIA.pdf");
  write(htmlPath, htmlDocument(title, markdown));
  const soffice = process.env.SOFFICE_BIN || "/Users/franciscotaveira.ads/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice";
  const result = spawnSync(soffice, ["--headless", "--convert-to", "pdf", "--outdir", productDir, htmlPath], { encoding: "utf8" });
  if (result.status !== 0 || !fs.existsSync(pdfPath)) {
    return { ok: false, error: `${result.stderr || result.stdout || "soffice falhou"}`.trim() };
  }
  return { ok: true };
}

function writeIndex(products) {
  const grouped = new Map();
  for (const product of products) {
    if (!grouped.has(product.category)) grouped.set(product.category, []);
    grouped.get(product.category).push(product);
  }
  let out = `# Portfólio low-ticket — kits gerados\n\nGerado em ${DATE}. São **${products.length} rascunhos de validação**, não produtos publicados. Cada pasta contém uma oferta, um guia PDF, um template Notion e, quando aplicável, um CSV inicial.\n\n## Regras de uso\n\n- Não publicar ou cadastrar na Cakto sem conferir o catálogo ativo e os complementos do EKO.\n- Cada kit resolve uma tarefa finita; operação recorrente, automação e multiusuário pertencem a uma solução maior.\n- Todos os exemplos são fictícios. Substitua-os somente após revisar privacidade e autorização.\n- Preço, promessa e volume de procura continuam sujeitos a validação.\n\n## Mapa por grupo\n\n`;
  for (const [category, list] of grouped) {
    out += `### ${category}. ${categoryConfig[category]?.title || `Grupo ${category}`}\n\n`;
    for (const p of list) {
      const slug = `${p.id}-${slugify(p.name)}`;
      out += `- [${p.id} — ${p.name}](./portfolio/${slug}/README.md) · ${p.config.format} · marca ${p.mark}\n`;
    }
    out += "\n";
  }
  out += `## Pacotes sugeridos\n\n- **Atendimento e relacionamento:** 01–06, 19–30, 31–36.\n- **Conteúdo e aquisição:** 13–18.\n- **Operação e equipe:** 37–42.\n- **Profissional de implantação:** 43–48.\n\nOs intervalos são atalhos de navegação do catálogo, não autorização para criar bundles. Compare entregas e sobreposições antes de cobrar novamente por conteúdo já incluído.\n`;
  write(path.join(ROOT, "docs", "low-ticket", "README.md"), out);
}

function writeGovernance(products) {
  const rows = products.map((p) => {
    const slug = `${p.id}-${slugify(p.name)}`;
    const overlap = p.mark === "C" ? "ALTA: comparar com EKO/Conversas Prontas" : p.mark === "P" ? "MÉDIA: revisar acervo interno" : "A validar";
    return `| ${p.id} | [${p.name}](./portfolio/${slug}/README.md) | ${p.category} | ${p.mark} | ${overlap} | Rascunho |`;
  }).join("\n");
  write(path.join(ROOT, "docs", "low-ticket", "INVENTARIO_E_GOVERNANCA.md"), `# Inventário e governança dos kits\n\nData: ${DATE}. O painel Cakto não foi consultado nesta geração. “Rascunho” significa arquivo local pronto para revisão, não SKU ativo.\n\n## Estados\n\n- **Rascunho:** conteúdo gerado; ainda precisa de revisão humana, teste com comprador e comparação Cakto.\n- **Piloto:** somente após autorização, com entrega e prazo informados.\n- **Aprovado para publicação:** depois de conferir promessa, suporte, direitos, política e inventário.\n- **Ativo:** somente quando o painel Cakto confirmar.\n\n## Matriz\n\n| ID | Oferta | Grupo | Marca | Risco de sobreposição | Estado |\n|---|---|---:|---|---|---|\n${rows}\n\n## Checklist antes do cadastro\n\n- [ ] Conferir se a Cakto já entrega a mesma coisa com outro nome.\n- [ ] Conferir se o conteúdo não foi prometido no EKO ou em um complemento existente.\n- [ ] Definir comprador e momento de compra em uma frase.\n- [ ] Testar o template numa conta Notion limpa e numa conta sem assinatura, quando aplicável.\n- [ ] Revisar direitos de exemplos, imagens, depoimentos e dados.\n- [ ] Calcular suporte, reembolso e custo de entrega.\n- [ ] Escrever o que não está incluído.\n- [ ] Validar a oferta com piloto pago antes de tráfego em escala.\n\n## Entrega Notion\n\nPreferir página pública com “Allow duplicate as template” e instrução de cópia. Isso deixa o comprador trabalhar na própria cópia. Não prometer que uma plataforma de terceiros ficará disponível para sempre.\n`);
  write(path.join(ROOT, "docs", "low-ticket", "BUNDLES_E_ESTEIRAS.md"), `# Bundles e esteiras\n\n## Princípio\n\nUm bundle reúne tarefas que o mesmo comprador executa no mesmo momento. Não é uma coleção de arquivos sem ordem.\n\n## Esteira de atendimento\n\n1. **Entrada:** uma dor operacional concreta.\n2. **Aplicação:** um kit em PDF/Notion.\n3. **Complemento:** outra tarefa necessária no mesmo ciclo.\n4. **Escala:** SOS Sales ou serviço assistido quando surgem equipe, volume, SLA e automação.\n\n## Bundles candidatos\n\n| Bundle | Inclui | Comprador | Regra |\n|---|---|---|---|\n| Atendimento e relacionamento | 01–06 + 19–30 | negócio que atende e faz pós-venda | Não incluir EKO automaticamente; comparar scripts e políticas |\n| Conteúdo e aquisição | 13–18 | negócio ou responsável por marketing | Só cobrar se houver método de oferta e evidência, não calendário genérico |\n| Operação e equipe | 31–42 | pequeno time | Pode virar bônus de onboarding do SOS Sales quando a função já estiver inclusa |\n| Profissional de implantação | 43–48 | agência, consultor, freelancer | Não misturar com a esteira do dono de negócio |\n\n## Upsell e cross-sell\n\n- **Order bump:** acessório de execução imediata, como uma calculadora ou ficha de decisão.\n- **Cross-sell:** tarefa complementar, como origem da venda depois de follow-up.\n- **Upsell:** mais profundidade, revisão ou serviço assistido, com capacidade e prazo delimitados.\n\nNão transformar um artefato prometido no produto-base em bump. Não vender a mesma entrega com nova capa.\n`);
}

const catalog = fs.readFileSync(CATALOG_PATH, "utf8");
const products = parseCatalog(catalog);
if (products.length === 0) {
  console.error("Nenhuma hipótese encontrada no catálogo.");
  process.exit(1);
}

fs.mkdirSync(OUT_ROOT, { recursive: true });
const failures = [];
for (const product of products) {
  const slug = `${product.id}-${slugify(product.name)}`;
  const dir = path.join(OUT_ROOT, slug);
  const guideText = guide(product);
  write(path.join(dir, "README.md"), productReadme(product, slug));
  write(path.join(dir, "GUIA_PDF.md"), guideText);
  write(path.join(dir, "NOTION_TEMPLATE.md"), notionTemplate(product));
  const csv = csvFor(product);
  if (csv) write(path.join(dir, "MODELO.csv"), csv);
  const pdf = renderPdf(dir, product.name, guideText);
  if (!pdf.ok) failures.push(`${product.id}: ${pdf.error}`);
}
writeIndex(products);
writeGovernance(products);
console.log(`Gerados ${products.length} kits em ${path.relative(ROOT, OUT_ROOT)}.`);
if (failures.length) {
  console.error(`PDFs com falha: ${failures.length}`);
  failures.forEach((failure) => console.error(failure));
  process.exitCode = 2;
} else {
  console.log("PDFs gerados com sucesso.");
}
