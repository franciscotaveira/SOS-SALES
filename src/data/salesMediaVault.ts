export interface SalesMediaResource {
  id: string;
  workspaceId: string;
  type: 'audio' | 'image' | 'video' | 'pdf' | 'document';
  title: string;
  authorOrSpeaker?: string;
  category: string;
  description: string;
  url: string;
  durationSeconds?: number;
  fileSizeFormatted?: string;
  thumbnailUrl?: string;
  recommendedStages?: string[];
  recommendedTriggerKeywords?: string[];
  captionText?: string;
  uploadedAt: string;
}

export const defaultSalesMediaVault: SalesMediaResource[] = [
  // ==========================================================================
  // HAVEN ESCOVARIA & ESMALTERIA
  // ==========================================================================
  {
    id: 'vault-haven-audio-micro-suzana',
    workspaceId: 'ws-haven-beauty',
    type: 'audio',
    title: 'Áudio Suzana · Explicação Micropigmentação Nanoblading',
    authorOrSpeaker: 'Suzana (Especialista em Micropigmentação)',
    category: 'Sobrancelhas & Estética Facial',
    description: 'Áudio acolhedor e seguro explicando o processo do nanoblading fio a fio, anestésico tópico (sem dor), cicatrização e retoque incluso em 30 dias.',
    url: 'https://assets.mixkit.co/active_storage/sfx/2874/2874-preview.mp3',
    durationSeconds: 48,
    fileSizeFormatted: '760 KB',
    recommendedStages: ['QUALIFICADO', 'PROPOSTA', 'NEGOCIACAO'],
    recommendedTriggerKeywords: ['micropigmentacao', 'nanoblading', 'fios', 'doi', 'sobrancelha', 'falha'],
    captionText: '🎙️ *Áudio da Especialista Suzana:* "Oi! Gravei este áudio rápido explicando certinho como funciona o nosso procedimento de Nanoblading fio a fio, o anestésico e a garantia de resultado super natural!"',
    uploadedAt: '2026-08-16T10:00:00Z',
  },
  {
    id: 'vault-haven-audio-escova-bia',
    workspaceId: 'ws-haven-beauty',
    type: 'audio',
    title: 'Áudio Bia · Escova Express sem hora marcada',
    authorOrSpeaker: 'Bia (Concierge Haven)',
    category: 'Cortes & Escovas',
    description: 'Explicação sobre a conveniência de chegar a qualquer momento no salão boutique no Centro de Chapecó com lavagem ozonizada inclusa.',
    url: 'https://assets.mixkit.co/active_storage/sfx/2874/2874-preview.mp3',
    durationSeconds: 34,
    fileSizeFormatted: '540 KB',
    recommendedStages: ['LEAD', 'QUALIFICADO'],
    recommendedTriggerKeywords: ['escova', 'sem hora marcada', 'preco', '59', 'lavagem'],
    captionText: '🎙️ *Áudio da Concierge Bia:* "Oi! Passando para te explicar como funciona nossa escovaria express sem hora marcada. É só chegar!"',
    uploadedAt: '2026-08-16T11:00:00Z',
  },
  {
    id: 'vault-haven-pdf-catalogo',
    workspaceId: 'ws-haven-beauty',
    type: 'pdf',
    title: 'Catálogo Oficial de Serviços & Preços Haven 2026',
    authorOrSpeaker: 'Diretoria Haven',
    category: 'Menu Completo',
    description: 'Menu em PDF de alta resolução com toda a grade de escovas, cortes, esmalteria em gel, micropigmentação e combos.',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    fileSizeFormatted: '1.8 MB',
    recommendedStages: ['PROPOSTA', 'NEGOCIACAO'],
    recommendedTriggerKeywords: ['catalogo', 'tabela', 'precos', 'servicos', 'pdf', 'menu'],
    captionText: '📄 *Catálogo Oficial Haven 2026:* Segue nosso menu completo em PDF com todos os serviços de escovaria, esmalteria em gel e estética facial.',
    uploadedAt: '2026-08-16T09:00:00Z',
  },
  {
    id: 'vault-haven-img-antes-depois-micro',
    workspaceId: 'ws-haven-beauty',
    type: 'image',
    title: 'Foto · Antes & Depois Micropigmentação Fio a Fio',
    authorOrSpeaker: 'Suzana',
    category: 'Sobrancelhas & Estética Facial',
    description: 'Demonstração real do preenchimento e simetria de sobrancelhas com técnica nanoblading.',
    url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=800&auto=format&fit=crop&q=80',
    fileSizeFormatted: '420 KB',
    recommendedStages: ['QUALIFICADO', 'PROPOSTA'],
    recommendedTriggerKeywords: ['foto', 'antes e depois', 'resultado', 'sobrancelha'],
    captionText: '✨ *Resultado Real Nanoblading:* Veja a naturalidade dos fios desenhados um a um pela especialista Suzana.',
    uploadedAt: '2026-08-16T11:30:00Z',
  },
  {
    id: 'vault-haven-img-gel-blindagem',
    workspaceId: 'ws-haven-beauty',
    type: 'image',
    title: 'Foto · Esmaltação em Gel & Blindagem Diamante',
    authorOrSpeaker: 'Equipe Haven',
    category: 'Unhas',
    description: 'Unhas perfeitas com esmaltação em gel e blindagem com durabilidade de até 21 dias.',
    url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&auto=format&fit=crop&q=80',
    fileSizeFormatted: '380 KB',
    recommendedStages: ['QUALIFICADO', 'PROPOSTA'],
    recommendedTriggerKeywords: ['unhas', 'gel', 'blindagem', 'foto', 'durabilidade'],
    captionText: '💅 *Esmaltação em Gel Haven:* Brilho espelhado com acabamento de alta joalheria e durabilidade de até 21 dias.',
    uploadedAt: '2026-08-16T11:40:00Z',
  },

  // ==========================================================================
  // SOS SALES OFICIAL
  // ==========================================================================
  {
    id: 'vault-sos-audio-francisco',
    workspaceId: 'ws-sos-sales-official',
    type: 'audio',
    title: 'Áudio Francisco · Apresentação Copilot & Fila com SLA',
    authorOrSpeaker: 'Francisco Rios (Fundador SOS Sales)',
    category: 'Apresentação Comercial',
    description: 'Áudio direto ao ponto demonstrando como o SOS Sales recupera vendas de WhatsApp em menos de 30 segundos.',
    url: 'https://assets.mixkit.co/active_storage/sfx/2874/2874-preview.mp3',
    durationSeconds: 52,
    fileSizeFormatted: '820 KB',
    recommendedStages: ['QUALIFICADO', 'PROPOSTA'],
    recommendedTriggerKeywords: ['como funciona', 'sos sales', 'copilot', 'audio', 'demonstracao'],
    captionText: '🎙️ *Áudio do Francisco (Fundador):* "Oi! Gravei este áudio rápido explicando como a nossa engenharia de continuidade cognitiva estanca o prejuízo de leads perdidos no WhatsApp."',
    uploadedAt: '2026-08-16T08:00:00Z',
  },
  {
    id: 'vault-sos-pdf-proposta',
    workspaceId: 'ws-sos-sales-official',
    type: 'pdf',
    title: 'Proposta Comercial SOS Sales · Programa Empresa Amiga',
    authorOrSpeaker: 'MCT Tecnologia',
    category: 'Proposta & Planos',
    description: 'Documento PDF com os detalhes do Plano Anual com 50% OFF (12x R$ 97) e garantia incondicional de 7 dias.',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    fileSizeFormatted: '1.2 MB',
    recommendedStages: ['PROPOSTA', 'NEGOCIACAO'],
    recommendedTriggerKeywords: ['proposta', 'plano', 'valor', 'contrato', 'pdf'],
    captionText: '📄 *Proposta Oficial SOS Sales:* Segue o descritivo completo com o subsídio de 50% do Programa Empresa Amiga.',
    uploadedAt: '2026-08-16T08:30:00Z',
  },

  // ==========================================================================
  // SORA RITUAL SPA
  // ==========================================================================
  {
    id: 'vault-sora-audio-camila',
    workspaceId: 'ws-sora-spa',
    type: 'audio',
    title: 'Áudio Dra. Camila · Experiência de Headspa Coreano',
    authorOrSpeaker: 'Dra. Camila (Tricologista Sora)',
    category: 'Rituais Sensoriais',
    description: 'Explicação sobre a tricoscopia capilar com microcâmera, cascata de água morna e massagem craniana relaxante.',
    url: 'https://assets.mixkit.co/active_storage/sfx/2874/2874-preview.mp3',
    durationSeconds: 45,
    fileSizeFormatted: '710 KB',
    recommendedStages: ['QUALIFICADO', 'PROPOSTA'],
    recommendedTriggerKeywords: ['headspa', 'como funciona', 'ritual', 'relaxamento', 'audio'],
    captionText: '🎙️ *Áudio da Dra. Camila:* "Entenda como nosso ritual de Headspa sensorial alivia o estresse e trata o couro cabeludo profundamente com microcâmera."',
    uploadedAt: '2026-08-16T09:30:00Z',
  },
];

export function getSalesMediaForWorkspace(workspaceId: string): SalesMediaResource[] {
  const normId = (workspaceId || '').toLowerCase();
  
  if (normId.includes('haven') || normId.includes('escovaria')) {
    return defaultSalesMediaVault.filter((r) => r.workspaceId === 'ws-haven-beauty');
  }
  if (normId.includes('sora') || normId.includes('spa')) {
    return defaultSalesMediaVault.filter((r) => r.workspaceId === 'ws-sora-spa');
  }
  return defaultSalesMediaVault.filter((r) => r.workspaceId === 'ws-sos-sales-official');
}
