import React, { useState, useEffect } from 'react';
import { Workspace } from '../../types/cockpit';
import {
  Users,
  UserPlus,
  Shield,
  CheckCircle2,
  AlertCircle,
  MoreVertical,
  Mail,
  Phone,
  Percent,
  Sliders,
  Trash2,
  Edit2,
  Lock,
  Sparkles,
  Search,
  UserCheck,
  Clock,
  Briefcase,
} from 'lucide-react';

export type UserRole = 'admin' | 'supervisor' | 'operator' | 'financial';
export type UserStatus = 'online' | 'busy' | 'break' | 'offline';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  maxDiscountPercent: number;
  assignedQueues: string[];
  avatarUrl?: string;
  createdAt: string;
  lastActiveAt: string;
}

interface TeamManagerProps {
  workspace: Workspace;
}

export function resolveWorkspaceTeamDefaults(wsId: string, wsName?: string): TeamMember[] {
  const normId = (wsId || '').toLowerCase();
  const normName = (wsName || '').toLowerCase();

  // 1. Haven Escovaria & Esmalteria
  if (normId.includes('haven') || normName.includes('haven') || normName.includes('escovaria')) {
    return [
      {
        id: 'usr-haven-01',
        name: 'Francisco Rios',
        email: 'francisco@havenescovaria.com.br',
        phone: '+55 49 98844-7562',
        role: 'admin',
        status: 'online',
        maxDiscountPercent: 20,
        assignedQueues: ['Recepção Geral', 'Noivas & Eventos', 'VIP'],
        createdAt: '2026-01-10T10:00:00Z',
        lastActiveAt: 'Agora mesmo',
      },
      {
        id: 'usr-haven-02',
        name: 'Beatriz Vasconcelos',
        email: 'bia@havenescovaria.com.br',
        phone: '+55 49 99123-4567',
        role: 'supervisor',
        status: 'online',
        maxDiscountPercent: 15,
        assignedQueues: ['Recepção Geral', 'Agendamentos Trinks'],
        createdAt: '2026-02-01T14:00:00Z',
        lastActiveAt: 'Há 3 min',
      },
      {
        id: 'usr-haven-03',
        name: 'Camila Ferreira',
        email: 'camila@havenescovaria.com.br',
        phone: '+55 49 99876-5432',
        role: 'operator',
        status: 'busy',
        maxDiscountPercent: 10,
        assignedQueues: ['Escovaria Express', 'Esmalteria'],
        createdAt: '2026-03-15T09:00:00Z',
        lastActiveAt: 'Há 12 min',
      },
    ];
  }

  // 2. Sora Spa
  if (normId.includes('sora') || normName.includes('sora') || normName.includes('spa')) {
    return [
      {
        id: 'usr-sora-01',
        name: 'Francisco Rios',
        email: 'francisco@soraspa.com.br',
        phone: '+55 49 98844-7562',
        role: 'admin',
        status: 'online',
        maxDiscountPercent: 20,
        assignedQueues: ['Atendimento VIP', 'Headspa'],
        createdAt: '2026-01-15T10:00:00Z',
        lastActiveAt: 'Agora mesmo',
      },
      {
        id: 'usr-sora-02',
        name: 'Dra. Lilian Terapeuta',
        email: 'lilian@soraspa.com.br',
        phone: '+55 49 99123-7788',
        role: 'supervisor',
        status: 'online',
        maxDiscountPercent: 15,
        assignedQueues: ['Headspa Coreano', 'Massagens Relaxantes'],
        createdAt: '2026-02-10T14:00:00Z',
        lastActiveAt: 'Há 5 min',
      },
    ];
  }

  // 3. SOS Vendas - Matriz Principal / Sovereign Master
  return [
    {
      id: 'usr-sos-01',
      name: 'Francisco Rios (Master)',
      email: 'franciscotaveira.mkt@gmail.com',
      phone: '+55 49 98844-7562',
      role: 'admin',
      status: 'online',
      maxDiscountPercent: 50,
      assignedQueues: ['Comercial Direto', 'Enterprise', 'Parcerias'],
      createdAt: '2026-01-01T08:00:00Z',
      lastActiveAt: 'Agora mesmo',
    },
    {
      id: 'usr-sos-02',
      name: 'Sofia SDR (Copilot IA)',
      email: 'sofia.sdr@iaparavendas.tech',
      phone: '+55 49 98844-7560',
      role: 'operator',
      status: 'online',
      maxDiscountPercent: 20,
      assignedQueues: ['Triagem CTWA Meta Ads', 'Qualificação PME'],
      createdAt: '2026-02-10T11:00:00Z',
      lastActiveAt: 'Há 1 min',
    },
  ];
}

const ROLE_LABELS: Record<UserRole, { label: string; color: string; desc: string }> = {
  admin: {
    label: 'Administrador',
    color: 'bg-rose-50 text-rose-700 border-rose-200',
    desc: 'Acesso total a faturamento, conexões, catálogo e gestão de usuários.',
  },
  supervisor: {
    label: 'Supervisor Comercial',
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    desc: 'Monitora todas as conversas, aprova descontos e gerencia filas.',
  },
  operator: {
    label: 'Atendente / Operador',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    desc: 'Atende conversas atribuídas, usa o Copilot 1-clique e envia orçamentos.',
  },
  financial: {
    label: 'Financeiro',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    desc: 'Auditoria de comprovantes Pix, emissão de cobranças e relatórios de ROAS.',
  },
};

const STATUS_LABELS: Record<UserStatus, { label: string; dot: string }> = {
  online: { label: 'Disponível', dot: 'bg-emerald-500' },
  busy: { label: 'Em Atendimento', dot: 'bg-amber-500' },
  break: { label: 'Em Pausa / Intervalo', dot: 'bg-slate-400' },
  offline: { label: 'Desconectado', dot: 'bg-slate-300' },
};

export const TeamManager: React.FC<TeamManagerProps> = ({ workspace }) => {
  const defaultMembers = React.useMemo(
    () => resolveWorkspaceTeamDefaults(workspace.id, workspace.name),
    [workspace.id, workspace.name]
  );

  const storageKey = `sos_sales_team_v3_${workspace.id}`;

  const [members, setMembers] = useState<TeamMember[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return defaultMembers;
  });

  // Re-sync when switching workspaces in the multi-tenant header dropdown
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      setMembers(saved ? JSON.parse(saved) : defaultMembers);
    } catch {
      setMembers(defaultMembers);
    }
  }, [workspace.id, workspace.name, storageKey, defaultMembers]);

  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  // New/Edit Member Form State
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    phone: string;
    role: UserRole;
    maxDiscountPercent: number;
    assignedQueues: string;
  }>({
    name: '',
    email: '',
    phone: '',
    role: 'operator',
    maxDiscountPercent: 10,
    assignedQueues: 'Geral, Atendimento',
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(members));
    } catch {}
  }, [members, storageKey]);

  // Limite generoso — não bloqueia operação real. Pode ser configurado via plano.
  const maxSeats = Math.max(workspace.activeOperatorCount || 50, 50);
  const occupiedSeats = members.length;
  const seatPercentage = Math.min(100, Math.round((occupiedSeats / maxSeats) * 100));

  const filteredMembers = members.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenAddModal = () => {
    setEditingMember(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      role: 'operator',
      maxDiscountPercent: 10,
      assignedQueues: 'Recepção, WhatsApp',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (member: TeamMember) => {
    setEditingMember(member);
    setFormData({
      name: member.name,
      email: member.email,
      phone: member.phone,
      role: member.role,
      maxDiscountPercent: member.maxDiscountPercent,
      assignedQueues: member.assignedQueues.join(', '),
    });
    setIsModalOpen(true);
  };

  const handleSaveMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) return;

    const queuesArray = formData.assignedQueues
      .split(',')
      .map((q) => q.trim())
      .filter(Boolean);

    if (editingMember) {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === editingMember.id
            ? {
                ...m,
                name: formData.name.trim(),
                email: formData.email.trim(),
                phone: formData.phone.trim(),
                role: formData.role,
                maxDiscountPercent: Number(formData.maxDiscountPercent),
                assignedQueues: queuesArray.length > 0 ? queuesArray : ['Geral'],
              }
            : m
        )
      );
    } else {
      const newMember: TeamMember = {
        id: `usr-${Date.now()}`,
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || '+55 49 90000-0000',
        role: formData.role,
        status: 'online',
        maxDiscountPercent: Number(formData.maxDiscountPercent),
        assignedQueues: queuesArray.length > 0 ? queuesArray : ['Recepção'],
        createdAt: new Date().toISOString(),
        lastActiveAt: 'Agora mesmo',
      };
      setMembers((prev) => [...prev, newMember]);
    }

    setIsModalOpen(false);
  };

  const handleDeleteMember = (id: string) => {
    if (confirm('Tem certeza que deseja remover este usuário da equipe? O acesso será revogado imediatamente.')) {
      setMembers((prev) => prev.filter((m) => m.id !== id));
    }
  };

  return (
    <div id="team-manager-view" className="space-y-6">
      {/* Top Banner: Seats Capacity */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            <h2 className="text-base font-bold text-slate-900 font-heading">
              Gestão de Equipe & Atendentes Multi-Usuário
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Adicione múltiplos operadores para responderem simultaneamente no mesmo WhatsApp com distribuição inteligente de filas.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200 shrink-0">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Assentos Ativos</div>
            <div className="text-sm font-extrabold text-slate-900">
              {occupiedSeats} <span className="text-slate-400 font-normal">de</span> {maxSeats} operadores
            </div>
          </div>

          <div className="w-24 bg-slate-200 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                seatPercentage > 85 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${seatPercentage}%` }}
            />
          </div>

          <button
            onClick={handleOpenAddModal}
            className="py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs bg-purple-600 hover:bg-purple-700 text-white"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Adicionar Usuário</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome, e-mail ou cargo..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
          />
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Mostrando <strong>{filteredMembers.length}</strong> membros
        </div>
      </div>

      {/* Team Members Table / Cards */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
              <tr>
                <th className="py-3 px-4">Operador / Membro</th>
                <th className="py-3 px-4">Cargo & Permissões</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Alçada Desconto</th>
                <th className="py-3 px-4">Filas Atribuídas</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                    Nenhum membro encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => {
                  const roleConfig = ROLE_LABELS[member.role] || ROLE_LABELS.operator;
                  const statusConfig = STATUS_LABELS[member.status] || STATUS_LABELS.offline;

                  return (
                    <tr key={member.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Name & Contact */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-xs">
                            {member.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-xs">{member.name}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <Mail className="w-3 h-3 text-slate-400" />
                              <span>{member.email}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${roleConfig.color}`}>
                          {roleConfig.label}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-800">
                          <div className={`w-2 h-2 rounded-full ${statusConfig.dot}`} />
                          <span>{statusConfig.label}</span>
                        </div>
                      </td>

                      {/* Discount Limit */}
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          Até {member.maxDiscountPercent}%
                        </span>
                      </td>

                      {/* Queues */}
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {member.assignedQueues.map((q, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-slate-600 border border-slate-200"
                            >
                              {q}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEditModal(member)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-purple-700 hover:bg-purple-50 transition-colors"
                            title="Editar usuário"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteMember(member.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                            title="Remover acesso"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Add/Edit Member */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                  <UserCheck className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-900 font-heading">
                  {editingMember ? 'Editar Membro da Equipe' : 'Convidar Novo Operador'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMember} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Ana Paula Martins"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">E-mail Corporativo</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="ana@empresa.com.br"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+55 49 99999-9999"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Cargo / Permissão</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  >
                    <option value="operator">Atendente / Operador</option>
                    <option value="supervisor">Supervisor Comercial</option>
                    <option value="financial">Financeiro</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Alçada de Desconto Máx.</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={formData.maxDiscountPercent}
                      onChange={(e) => setFormData({ ...formData, maxDiscountPercent: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Filas Designadas</label>
                  <input
                    type="text"
                    value={formData.assignedQueues}
                    onChange={(e) => setFormData({ ...formData, assignedQueues: e.target.value })}
                    placeholder="Recepção, WhatsApp"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white transition-colors shadow-2xs"
                >
                  {editingMember ? 'Salvar Alterações' : 'Convidar Operador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
