const CONTACT_URL = 'https://wa.me/5549988447562?text=Olá!%20Quero%20conversar%20sobre%20a%20operação%20comercial%20da%20minha%20empresa.';
const AGENT_OPTIMIZATION_URL = 'https://wa.me/5549988447562?text=Olá!%20Quero%20diagnosticar%20e%20otimizar%20um%20agente%20de%20IA%20da%20minha%20empresa.';
document.querySelectorAll('[data-contact]').forEach((link) => { link.href = CONTACT_URL; link.target = '_blank'; link.rel = 'noreferrer'; });
document.querySelectorAll('[data-agent-optimization]').forEach((link) => { link.href = AGENT_OPTIMIZATION_URL; link.target = '_blank'; link.rel = 'noreferrer'; });
document.querySelectorAll('.faq-list button').forEach((button) => button.addEventListener('click', () => { const open = button.getAttribute('aria-expanded') === 'true'; button.setAttribute('aria-expanded', String(!open)); button.nextElementSibling.hidden = open; }));
