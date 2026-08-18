# POLÍTICA DE PRIVACIDADE E CONFORMIDADE LGPD

> **SOS Sales — Sistema de Inteligência de Vendas**  
> **MCT LTDA** | Chapecó, Santa Catarina | CNPJ: `[INSERIR CNPJ]`  
> **Última Atualização:** Agosto de 2026

---

### 1. INTRODUÇÃO E COMPROMISSO
A **MCT LTDA** tem como pilar fundamental a segurança da informação, a privacidade e a conformidade integral com a **Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 - LGPD)** e o **Marco Civil da Internet (Lei nº 12.965/2014)**.

Esta Política de Privacidade esclarece como os dados são coletados, tratados, armazenados e protegidos na plataforma **SOS Sales**.

---

### 2. PAPÉIS SOB A LGPD (CONTROLADOR VS. OPERADOR)

Na relação estabelecida entre a MCT LTDA e seus clientes B2B (empresas assinantes da plataforma):

1. **A EMPRESA CLIENTE (CONTRATANTE) É A CONTROLADORA:**
   - É a pessoa jurídica que detém o relacionamento comercial direto com os titulares dos dados (seus clientes finais e leads que entram em contato pelo WhatsApp).
   - É responsável exclusiva por definir a finalidade do tratamento, a base legal aplicável (consentimento, execução de contrato, cumprimento de obrigação legal ou legítimo interesse) e por responder diretamente às solicitações dos titulares.

2. **A MCT LTDA É A OPERADORA:**
   - Realiza o tratamento e processamento técnico dos dados pessoais **estritamente em nome e segundo as instruções da Controladora (Cliente)**, limitando-se às funcionalidades necessárias para a execução do software SaaS contratado.

---

### 3. DADOS TRATADOS PELA PLATAFORMA

Para a execução dos serviços de CRM e automação comercial, a SOS Sales processa as seguintes categorias de dados:

| Categoria de Dado | Exemplos | Finalidade de Tratamento |
| :--- | :--- | :--- |
| **Dados do Operador/Usuário** | Nome, e-mail, senha criptografada, cargo | Autenticação, controle de acesso e auditoria de ações no sistema. |
| **Dados de Contatos / Leads** | Nome, número de telefone (WhatsApp), identificador de conversa | Gestão do atendimento, histórico de mensagens e roteamento comercial. |
| **Mensagens e Interações** | Conteúdo das mensagens de texto trocadas | Armazenamento do histórico comercial, geração de sugestões de resposta pelo Copilot e resgate de vácuo comercial. |
| **Metadados e Atribuição** | ID do anúncio Meta, UTMs de campanha, valor de transação | Atribuição de faturamento ao tráfego pago via Meta Conversions API (CAPI). |

---

### 4. USO DE INTELIGÊNCIA ARTIFICIAL E NÃO-TREINAMENTO PÚBLICO

1. **Segurança e Privacidade em LLMs:** As mensagens processadas pelos motores de IA da plataforma (via OpenRouter / provedores de nível corporativo) utilizam endpoints de inferência comerciais com cláusula de **Zero Data Retention** e **Não Utilização para Treinamento de Modelos Públicos**.
2. **Isolamento de Conhecimento:** O motor de evolução de playbook (*Hive-Mind*) sintetiza apenas regras semânticas de vendas dentro do banco de dados isolado (*tenant isolation*) de cada Workspace, sem vazamento de dados confidenciais entre empresas distintas.

---

### 5. ARMAZENAMENTO, SEGURANÇA E RETENÇÃO DE DADOS

1. **Infraestrutura Soberana:** Os dados são armazenados em infraestrutura segura com banco de dados PostgreSQL/Supabase e volumes criptografados, protegidos por conexões TLS 1.3 (HTTPS/WSS) e políticas de *Row-Level Security* (RLS).
2. **Retenção:** Os dados permanecem armazenados enquanto a conta da Controladora estiver ativa na plataforma.
3. **Eliminação:** Após o término do contrato, a Controladora poderá solicitar a exportação ou exclusão definitiva dos dados em até 30 (trinta) dias.

---

### 6. COMPARTILHAMENTO COM TERCEIROS (SUB-PROCESSADORES)
A MCT LTDA utiliza estritamente provedores de infraestrutura essenciais para a operação do software:
- **Provedor de Banco de Dados / Nuvem:** Supabase Inc. / VPS Dedicado;
- **Provedor de Cache / Fila em Memória:** Redis;
- **Provedor de Inferência de IA:** OpenRouter / Anthropic / Google Vertex AI (sob termos empresariais de privacidade);
- **Provedor de Atribuição:** Meta Platforms Inc. (Graph API / CAPI para dados de conversão comercial).

Nenhum dado é vendido, alugado ou compartilhado com terceiros para fins de marketing ou publicidade sem autorização da Controladora.

---

### 7. DIREITOS DOS TITULARES DE DADOS
Os titulares de dados pessoais possuem direitos garantidos pelo Art. 18 da LGPD (confirmação de tratamento, acesso, correção, eliminação, portabilidade).

Como a MCT LTDA atua como **Operadora**, qualquer solicitação de titular recebida diretamente será encaminhada à **Controladora** responsável para que esta avalie e autorize a ação correspondente.

---

### 8. ENCARREGADO DE DADOS (DPO) & CONTATO
Para questões relacionadas à privacidade, proteção de dados e requisições LGPD:
- **Encarregado (DPO):** Equipe de Segurança e Governança MCT LTDA
- **E-mail de Contato:** `privacidade@mct.com.br` / `contato@iaparavendas.tech`
- **Endereço:** Chapecó/SC, Brasil.
