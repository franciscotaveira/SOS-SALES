import { describe, expect, it } from 'vitest';
import { HumanizerKernel, HUMANIZER_PROMPT_DIRECTIVES } from '../../src/infrastructure/ai/humanizer-kernel.js';

describe('HumanizerKernel — Banco Oculto de Humanização', () => {
  it('contém diretrizes de prompt anti-robô completas', () => {
    expect(HUMANIZER_PROMPT_DIRECTIVES).toContain('BANCO OCULTO DE HUMANIZAÇÃO');
    expect(HUMANIZER_PROMPT_DIRECTIVES).toContain('PROIBIÇÃO TERMINANTE DE CLICHÊS DE IA');
    expect(HUMANIZER_PROMPT_DIRECTIVES).toContain('CADÊNCIA E RITMO DE WHATSAPP');
    expect(HUMANIZER_PROMPT_DIRECTIVES).toContain('ZERO LISTAS COM MINI-TÍTULOS BUROCRÁTICOS');
    expect(HUMANIZER_PROMPT_DIRECTIVES).toContain('NENHUM TRAVESSÃO LONGO');
  });

  it('substitui travessões longos (em-dash e en-dash) por pontuação natural', () => {
    const raw = 'O plano mensal custa R$ 97 — e inclui todos os recursos — sem taxa de adesão.';
    const result = HumanizerKernel.humanizeReply(raw);
    expect(result).not.toContain('—');
    expect(result).toContain('O plano mensal custa R$ 97, e inclui todos os recursos, sem taxa de adesão.');
  });

  it('remove aberturas artificiais de chatbot (Certamente, Compreendo perfeitamente sua dor)', () => {
    const raw = 'Certamente! Compreendo perfeitamente sua dúvida. Temos o plano mensal por R$ 97.';
    const result = HumanizerKernel.humanizeReply(raw);
    expect(result).not.toMatch(/^certamente/i);
    expect(result).not.toMatch(/compreendo perfeitamente/i);
    expect(result).toContain('Temos o plano mensal por R$ 97.');
  });

  it('remove blocos <think> caso vazem de modelos com reasoning', () => {
    const raw = '<think>O usuário quer saber o preço. Vou falar R$ 97.</think>Olá! Nosso plano é R$ 97/mês.';
    const result = HumanizerKernel.humanizeReply(raw);
    expect(result).not.toContain('<think>');
    expect(result).not.toContain('O usuário quer saber');
    expect(result).toBe('Olá! Nosso plano é R$ 97/mês.');
  });

  it('preserva o envelope JSON da primeira linha em respostas do Receptionist', () => {
    const raw = `{"intent":"inquiry","escalate":false,"sendBookingFlow":false}
Certamente! O plano mensal custa R$ 97 — com ativação imediata.`;
    const result = HumanizerKernel.humanizeReply(raw);
    const lines = result.split('\n');
    expect(lines[0]).toBe('{"intent":"inquiry","escalate":false,"sendBookingFlow":false}');
    expect(lines.slice(1).join('\n')).not.toContain('Certamente!');
    expect(lines.slice(1).join('\n')).not.toContain('—');
  });

  it('limpa fechos robóticos pasteurizados', () => {
    const raw = 'O agendamento foi confirmado para amanhã às 14h. Estamos à disposição para esclarecer qualquer dúvida!';
    const result = HumanizerKernel.humanizeReply(raw);
    expect(result).not.toContain('Estamos à disposição para esclarecer qualquer dúvida');
  });
});
