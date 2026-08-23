/**
 * SOS SALES — CLEAN LIGHT SIMULATOR & CALCULATOR ENGINE
 * Inspired by AbacatePay Clean Design
 */

const LEADS_DATA = [
  {
    id: 1,
    name: 'Roberto Silva',
    initials: 'RS',
    avatarBg: '#0F172A',
    company: 'Clínica OdontoPrime',
    origin: 'Meta Ads • Ortodontia Invisível',
    val: 'R$ 3.800,00',
    messages: [
      { text: 'Boa tarde! Vi o anúncio de vocês no Instagram sobre o tratamento com alinhador.', time: '14:22' },
      { text: 'Gostaria de saber o valor e se tem horário para avaliação esta semana.', time: '14:23' }
    ],
    copilot: 'Olá Roberto! Temos horário na quinta às 14h com o Dr. Marcos. Na condição deste anúncio, você garante o scanner 3D gratuito e parcelamento em até 10x sem juros (R$ 3.800). Posso confirmar sua vaga?',
    facts: [
      '🎯 Interesse: Alinhador Invisível',
      '📍 Chapecó/SC',
      '⚡ SLA: 2 minutos restantes'
    ]
  },
  {
    id: 2,
    name: 'Mariana Costa',
    initials: 'MC',
    avatarBg: '#0D9488',
    company: 'Studio Lemos Estética',
    origin: 'Meta Ads • Protocolo Rejuvenescimento',
    val: 'R$ 1.200,00',
    messages: [
      { text: 'Olá! O protocolo Glow tem tempo de recuperação?', time: '14:35' },
      { text: 'Tenho um evento sábado, dá tempo de fazer amanhã?', time: '14:36' }
    ],
    copilot: 'Olá Mariana! O protocolo Glow é sem downtime (você sai pronta no mesmo dia!). Temos uma vaga promocional amanhã às 10h por R$ 1.200 no PIX. Quer que eu reserve seu horário agora?',
    facts: [
      '🎯 Procedimento: Glow Peel',
      '📅 Data do Evento: Sábado',
      '⚡ Sem contraindicação'
    ]
  },
  {
    id: 3,
    name: 'Carlos Mendes',
    initials: 'CM',
    avatarBg: '#334155',
    company: 'Auto Mecânica Sul',
    origin: 'WhatsApp Direto',
    val: 'R$ 850,00',
    messages: [
      { text: 'Boa tarde! Ficou pronto o orçamento da troca de pastilhas e óleo do Civic?', time: '14:40' }
    ],
    copilot: 'Fala Carlos! Ficou R$ 850 com peças originais e garantia total. Se aprovar agora, liberamos seu carro pronto hoje até as 18h. Posso iniciar o serviço?',
    facts: [
      '🚗 Veículo: Civic 2021',
      '💰 Orçamento: R$ 850,00',
      '⏱️ Entrega: Hoje às 18h'
    ]
  }
];

let selectedLead = 0;

document.addEventListener('DOMContentLoaded', () => {
  renderLeads();
  selectLead(0);
  initCalculator();
  initStrategicPopup();

  // Approve button
  document.getElementById('sim-btn-approve')?.addEventListener('click', () => {
    const lead = LEADS_DATA[selectedLead];
    const chatBox = document.getElementById('sim-chat-box');
    if (!chatBox) return;

    const bubble = document.createElement('div');
    bubble.className = 'p-3.5 rounded-2xl bg-[#DCFCE7] border border-green-200 text-slate-900 ml-6 shadow-sm animate-fadeIn';
    bubble.innerHTML = `
      <div class="flex items-center justify-between text-[10px] text-green-800 font-bold mb-1">
        <span>Você (Via Meta Cloud API Oficial)</span>
        <span class="text-green-700 flex items-center gap-1 font-mono">14:41 <span class="text-blue-600 font-bold">✓✓</span></span>
      </div>
      <p class="leading-relaxed text-xs text-slate-800">${lead.copilot}</p>
    `;
    chatBox.appendChild(bubble);
    chatBox.scrollTop = chatBox.scrollHeight;
    showNotification('✓ Resposta oficial WABA enviada com entrega garantida!');
  });

  // Native WABA Pix button
  document.getElementById('sim-btn-pix')?.addEventListener('click', () => {
    const lead = LEADS_DATA[selectedLead];
    const chatBox = document.getElementById('sim-chat-box');
    if (!chatBox) return;

    const bubble = document.createElement('div');
    bubble.className = 'p-4 rounded-2xl bg-white border-2 border-emerald-500 text-slate-900 ml-6 shadow-md animate-fadeIn';
    bubble.innerHTML = `
      <div class="flex items-center justify-between text-[10px] text-emerald-800 font-bold pb-2 border-b border-slate-100">
        <span class="flex items-center gap-1">💳 Cobrança Pix Nativa Meta</span>
        <span class="text-emerald-700 font-mono">14:41 • WABA</span>
      </div>
      <div class="mt-2.5">
        <div class="text-xs font-bold text-slate-900">${lead.company} — ${lead.facts[0]?.replace('🎯 ', '') || 'Serviço Exclusivo'}</div>
        <div class="text-lg font-display font-black text-emerald-600 mt-0.5">${lead.val}</div>
      </div>
      <div class="mt-3 flex gap-2">
        <button class="flex-1 py-2 bg-emerald-600 text-white rounded-xl font-bold text-[11px] flex items-center justify-center gap-1 shadow-xs">
          <span>Copiar Código Pix</span>
        </button>
        <button class="px-3 py-2 bg-slate-100 text-slate-700 rounded-xl font-semibold text-[11px]">
          Detalhes
        </button>
      </div>
      <div class="mt-2 text-[10px] text-slate-400 flex items-center justify-between font-sans">
        <span>Padrão Banco Central</span>
        <span class="text-emerald-600 font-bold">● Aguardando Pagamento</span>
      </div>
    `;
    chatBox.appendChild(bubble);
    chatBox.scrollTop = chatBox.scrollHeight;
    showNotification('⚡ Cartão Pix Nativo WABA gerado com botão de 1 clique!');
  });

  // Won button
  document.getElementById('sim-btn-won')?.addEventListener('click', () => {
    const lead = LEADS_DATA[selectedLead];
    const chatBox = document.getElementById('sim-chat-box');
    if (chatBox) {
      const bubble = document.createElement('div');
      bubble.className = 'p-3 rounded-2xl bg-emerald-900 text-white ml-6 shadow-md text-xs animate-fadeIn';
      bubble.innerHTML = `
        <div class="flex items-center justify-between text-[10px] text-emerald-300 font-bold mb-1">
          <span>🎉 Pagamento Confirmado via Webhook</span>
          <span class="font-mono">14:42</span>
        </div>
        <p class="text-[11px] text-emerald-100 font-medium">Pix de <strong>${lead.val}</strong> recebido. Pedido alterado para <strong>GANHO</strong> e evento <strong>Purchase</strong> disparado no Meta CAPI!</p>
      `;
      chatBox.appendChild(bubble);
      chatBox.scrollTop = chatBox.scrollHeight;
    }
    showNotification(`🏆 Venda de ${lead.val} confirmada! Meta CAPI otimizado com sucesso.`);
  });
});

function renderLeads() {
  const container = document.getElementById('sim-leads-list');
  if (!container) return;

  container.innerHTML = LEADS_DATA.map((lead, idx) => `
    <div onclick="selectLead(${idx})" class="p-3.5 rounded-2xl border cursor-pointer transition-all ${idx === selectedLead ? 'bg-white border-green-500 shadow-sm ring-2 ring-green-500/20' : 'bg-white/80 border-slate-200 hover:border-slate-300'}">
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-full text-white font-bold text-[10px] flex items-center justify-center shadow-xs" style="background-color: ${lead.avatarBg}">
            ${lead.initials}
          </div>
          <div>
            <h5 class="font-display font-bold text-slate-950 text-xs">${lead.name}</h5>
            <p class="text-[10px] text-slate-500">${lead.company}</p>
          </div>
        </div>
        <span class="text-[11px] font-mono font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-lg border border-green-200">${lead.val}</span>
      </div>
      <p class="text-[11px] text-slate-600 mt-2 truncate">${lead.messages[lead.messages.length - 1].text}</p>
    </div>
  `).join('');
}

window.selectLead = function(index) {
  selectedLead = index;
  renderLeads();
  const lead = LEADS_DATA[index];

  document.getElementById('sim-lead-name').textContent = `${lead.name} — ${lead.company}`;
  document.getElementById('sim-lead-origin').textContent = lead.origin;
  document.getElementById('sim-lead-val').textContent = lead.val;
  
  const avatarEl = document.getElementById('sim-lead-avatar');
  if (avatarEl) {
    avatarEl.textContent = lead.initials;
    avatarEl.style.backgroundColor = lead.avatarBg;
  }

  const chatBox = document.getElementById('sim-chat-box');
  if (chatBox) {
    chatBox.innerHTML = lead.messages.map(m => `
      <div class="p-3 rounded-2xl bg-white border border-slate-200/80 text-slate-800 mr-6 shadow-sm">
        <div class="flex items-center justify-between text-[10px] text-slate-400 mb-1">
          <span class="font-semibold text-slate-700">${lead.name}</span>
          <span class="font-mono">${m.time}</span>
        </div>
        <p class="leading-relaxed text-xs">${m.text}</p>
      </div>
    `).join('');
  }

  document.getElementById('sim-copilot-text').textContent = lead.copilot;
  
  const factsBox = document.getElementById('sim-facts-box');
  if (factsBox) {
    factsBox.innerHTML = lead.facts.map(f => `
      <div class="px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 text-[10px] border border-slate-200 font-medium">
        ${f}
      </div>
    `).join('');
  }
};

function initCalculator() {
  const leadsIn = document.getElementById('calc-leads-input');
  const ticketIn = document.getElementById('calc-ticket-input');
  const agentsIn = document.getElementById('calc-agents-input');
  if (!leadsIn || !ticketIn || !agentsIn) return;

  function update() {
    const leads = Number(leadsIn.value);
    const ticket = Number(ticketIn.value);
    const agents = Number(agentsIn.value);

    document.getElementById('calc-leads-display').textContent = `${leads} leads/dia`;
    document.getElementById('calc-ticket-display').textContent = `R$ ${ticket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('calc-agents-display').textContent = `${agents} atendente${agents > 1 ? 's' : ''}`;

    // 1. Vendas perdidas por demora (4% de conversão evaporada)
    const monthlyTotal = leads * 30;
    const additionalSales = monthlyTotal * 0.04;
    const lostSales = additionalSales * ticket;

    // 2. Horas desperdiçadas digitando textos manuais repetitivos (~30h/mês por atendente)
    const wastedHours = agents * 30;
    const laborCostPerHour = 25; // R$ 25/hora de custo CLT/PJ médio
    const wastedLaborCost = wastedHours * laborCostPerHour;

    document.getElementById('calc-lost-sales-display').textContent = `R$ ${lostSales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('calc-lost-hours-display').textContent = `~${wastedHours} horas/mês`;
    document.getElementById('calc-lost-cost-display').textContent = `R$ ${wastedLaborCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }

  leadsIn.addEventListener('input', update);
  ticketIn.addEventListener('input', update);
  agentsIn.addEventListener('input', update);
  update();
}

function showNotification(msg) {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-2xl bg-slate-950 text-white font-sans text-xs shadow-2xl flex items-center gap-2.5 border border-slate-800';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function initStrategicPopup() {
  const popup = document.getElementById('strategic-popup');
  const popupContent = document.getElementById('strategic-popup-content');
  const closeBtn = document.getElementById('close-popup-btn');
  const dismissBtn = document.getElementById('dismiss-popup-btn');
  if (!popup || !popupContent) return;

  let shown = sessionStorage.getItem('sos_popup_seen');

  function openPopup() {
    if (shown) return;
    shown = true;
    sessionStorage.setItem('sos_popup_seen', 'true');
    popup.classList.remove('opacity-0', 'pointer-events-none');
    popup.classList.add('opacity-100');
    popupContent.classList.remove('scale-95');
    popupContent.classList.add('scale-100');
  }

  function closePopup() {
    popup.classList.remove('opacity-100');
    popup.classList.add('opacity-0', 'pointer-events-none');
    popupContent.classList.remove('scale-100');
    popupContent.classList.add('scale-95');
  }

  // 1. Exit intent on desktop (mouse leaves top)
  document.addEventListener('mouseleave', (e) => {
    if (e.clientY <= 20) {
      openPopup();
    }
  });

  // 2. Timer fallback after 25 seconds
  setTimeout(() => {
    openPopup();
  }, 25000);

  // Close handlers
  closeBtn?.addEventListener('click', closePopup);
  dismissBtn?.addEventListener('click', closePopup);
  popup.addEventListener('click', (e) => {
    if (e.target === popup) {
      closePopup();
    }
  });
}
