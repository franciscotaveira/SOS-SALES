# GUIA DE BLINDAGEM JURÍDICA, PROPRIEDADE INTELECTUAL E SEGREDO COMERCIAL

> **MCT OS Sovereign Architecture** | MCT LTDA (Chapecó/SC)  
> **Objetivo:** Estratégia prática para proteger o código, a marca, os algoritmos e evitar cópia/plágio por concorrentes ou clientes desonestos.

---

## 1. REGISTRO OFICIAL NO INPI (BRASIL)

Para blindar o SOS Sales de forma incontestável na esfera judicial brasileira, execute as seguintes ações no **INPI (Instituto Nacional da Propriedade Industrial)**:

### A) Registro de Programa de Computador (Software)
- **Base Legal:** Lei nº 9.609/1998 (Lei do Software) e Lei nº 9.610/1998.
- **Como Funciona:** O INPI permite o registro 100% digital de software. Você gera o *hash criptográfico (SHA-512)* do código-fonte compilado ou do repositório, assina digitalmente com certificado e-CNPJ/e-CPF e submete no portal e-Software do INPI.
- **Custo:** Taxa federal em torno de R$ 185 a R$ 415 (pagamento único).
- **Resultado:** Certificado oficial de titularidade com validade internacional de **50 anos** a partir de 1º de janeiro do ano subsequente à sua criação.
- **Força Jurídica:** Serve como prova cabal em ações de busca e apreensão, liminares de bloqueio de sistemas cópias e indenizações por danos morais/materiais.

### B) Registro de Marca
- **Registrar Marca:** `SOS SALES` e/ou `SOVEREIGN SALES` nas classes:
  - **Classe 09:** Softwares gravados ou baixáveis, aplicativos para gestão de vendas.
  - **Classe 35:** Serviços de gestão e assessoria comercial e vendas.
  - **Classe 42:** Serviços de computação em nuvem, SaaS e suporte de software.

---

## 2. ESTRATÉGIA DE SEGREDO COMERCIAL (TRADE SECRET)

O código e as regras de negócio de alto valor não devem ser acessíveis nem auditáveis pelo cliente final:

1. **Arquitetura 100% SaaS Centralizada:**
   - O cliente final **NUNCA** recebe arquivos de código, scripts backend, banco de dados ou prompts em seu computador/servidor.
   - Todo o processamento ocorre no seu servidor soberano VPS (`179.197.72.221`). O cliente acessa apenas a interface web compilada (`dist/`).
2. **Minificação & Obfuscação:**
   - O frontend é compilado com Vite/Rollup com remoção de comentários, variáveis comprimidas e sem arquivos `.map` (sourcemaps desabilitados em produção).
3. **Cláusula Penal no Contrato B2B:**
   - O contrato estipula expressamente a **multa não compensatória de R$ 200.000,00** por tentativa de engenharia reversa ou desenvolvimento de solução concorrente durante o contrato e por até 2 anos após o término.

---

## 3. CHECKLIST PRÁTICO PARA CADA NOVA VENDA 1x1

Antes de liberar o acesso de qualquer cliente:

- [ ] **1. Assinatura Digital do Contrato:**
  - Enviar o `CONTRATO_PRESTACAO_SERVICOS_SAAS.md` + `ACORDO_PROCESSAMENTO_DADOS_DPA.md` via plataforma de assinatura digital (ex.: Clicksign, DocuSign, Autentique ou ZapSign).
  - Assinatura com validade jurídica (MP 2.200-2/2001).
- [ ] **2. Confirmação do Pagamento do Setup:**
  - Liberar o workspace somente após a compensação do valor de implementação/setup.
- [ ] **3. Criação de Workspace Isolado:**
  - Criar o tenant com UUID próprio no banco e conceder acesso aos operadores via e-mail corporativo.
- [ ] **4. Onboarding com Registro de Termos:**
  - O primeiro login exibe o aceite dos *Termos de Uso* e *Política de Privacidade*.

---

*MCT LTDA — Proteção Soberana de Ativos Digitais*
