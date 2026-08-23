import React from 'react';
import { CompanyProfile, BusinessDayHours } from '../../types/intelligence';
import {
  Building2,
  MapPin,
  Clock,
  ShieldCheck,
  Globe,
  Phone,
  Mail,
  Instagram,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Car,
  CreditCard,
  Save,
  Check,
  Zap,
} from 'lucide-react';

interface CompanyProfileSectionProps {
  profile: CompanyProfile;
  onSaveProfile?: (updated: CompanyProfile) => void;
}

export const CompanyProfileSection: React.FC<CompanyProfileSectionProps> = ({
  profile: initialProfile,
  onSaveProfile,
}) => {
  const [profile, setProfile] = React.useState<CompanyProfile>(initialProfile);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSaveProfile) {
      onSaveProfile(profile);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const dayLabels: Record<string, string> = {
    seg: 'Segunda-feira',
    ter: 'Terça-feira',
    qua: 'Quarta-feira',
    qui: 'Quinta-feira',
    sex: 'Sexta-feira',
    sab: 'Sábado',
    dom: 'Domingo',
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-lg p-3 sm:p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-9 h-9 text-[var(--sos-success)]" />
            <h2 className="text-base font-bold font-heading">{profile.tradeName}</h2>
            <span className="text-[8.5px] bg-[var(--sos-success)]/20 text-[var(--sos-success)] font-bold px-1.5 py-0.5 rounded-full border border-[var(--sos-success)]/30 flex items-center gap-1">
              <ShieldCheck className="w-2.5 h-2.5" /> WhatsApp Oficial Conectado
            </span>
          </div>
          <p className="text-[9.5px] text-[var(--sos-muted)] max-w-2xl">{profile.tagline}</p>
        </div>

        <button
          type="submit"
          id="btn-save-company-profile"
          className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-[var(--sos-success)] hover:bg-[var(--sos-success)]/90 text-[var(--sos-background)] rounded-lg text-[9px] font-bold transition-all shadow-2xs shrink-0 cursor-pointer"
        >
          {saved ? (
            <>
              <Check className="w-3 h-3" />
              <span>Salvo com Sucesso!</span>
            </>
          ) : (
            <>
              <Save className="w-3 h-3" />
              <span>Salvar Dados Oficiais</span>
            </>
          )}
        </button>
      </div>

      {/* WhatsApp Connection Card */}
      <div className="bg-slate-900/40 border border-slate-200 rounded-xl p-4 space-y-3 bg-white shadow-2xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#00A884]/10 text-[#00A884] flex items-center justify-center font-bold">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 font-heading">
                Identificação do WhatsApp da Empresa
              </h3>
              <p className="text-[11px] text-slate-500">
                Dados exibidos para os clientes no WhatsApp
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            Conexão Ativa
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-0.5">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">Nome no WhatsApp</span>
            <p className="font-bold text-slate-800">{profile.wabaOfficialInfo.verifiedName}</p>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-0.5">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">Número Conectado</span>
            <p className="font-bold text-slate-800 font-mono">{profile.wabaOfficialInfo.phoneNumber}</p>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-0.5">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">Qualidade do Número</span>
            <p className="font-bold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Alta Qualidade (Sem bloqueios)
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-0.5">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">Catálogo no WhatsApp</span>
            <p className="font-bold text-indigo-600 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Catálogo Ativo
            </p>
          </div>
        </div>
      </div>

      {/* Grid: Informações Corporativas & Contatos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dados Jurídicos & Institucionais */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Building2 className="w-4 h-4 text-slate-700" />
            <h3 className="text-xs font-bold text-slate-900 font-heading">
              Identificação Empresarial & Segmento
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Nome Comercial (Fantasia)
              </label>
              <input
                type="text"
                value={profile.tradeName}
                onChange={(e) => setProfile({ ...profile, tradeName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00A884]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Razão Social Completa
                </label>
                <input
                  type="text"
                  value={profile.legalName}
                  onChange={(e) => setProfile({ ...profile, legalName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00A884]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  CNPJ / Identificação Fiscal
                </label>
                <input
                  type="text"
                  value={profile.taxId}
                  onChange={(e) => setProfile({ ...profile, taxId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00A884]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Segmento de Atuação
              </label>
              <input
                type="text"
                value={profile.segment}
                onChange={(e) => setProfile({ ...profile, segment: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00A884]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Proposta Única de Valor (Tese da Empresa)
              </label>
              <textarea
                rows={3}
                value={profile.valueProposition}
                onChange={(e) => setProfile({ ...profile, valueProposition: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00A884]"
                placeholder="Explique o diferencial único que o agente de IA deve reforçar nos atendimentos"
              />
            </div>
          </div>
        </div>

        {/* Endereço Físico & Geolocalização */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-rose-500" />
              <h3 className="text-xs font-bold text-slate-900 font-heading">
                Localização Física & Acesso
              </h3>
            </div>
            {profile.address.googleMapsUrl && (
              <a
                href={profile.address.googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-semibold"
              >
                Abrir Maps <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Logradouro / Rua</label>
                <input
                  type="text"
                  value={profile.address.street}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      address: { ...profile.address, street: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00A884]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Número</label>
                <input
                  type="text"
                  value={profile.address.number}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      address: { ...profile.address, number: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00A884]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Bairro</label>
                <input
                  type="text"
                  value={profile.address.neighborhood}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      address: { ...profile.address, neighborhood: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00A884]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Cidade / UF</label>
                <input
                  type="text"
                  value={`${profile.address.city} - ${profile.address.state}`}
                  onChange={(e) => {
                    const parts = e.target.value.split('-');
                    setProfile({
                      ...profile,
                      address: {
                        ...profile.address,
                        city: parts[0]?.trim() || profile.address.city,
                        state: parts[1]?.trim() || profile.address.state,
                      },
                    });
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00A884]"
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">CEP</label>
                <input
                  type="text"
                  value={profile.address.postalCode}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      address: { ...profile.address, postalCode: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00A884]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Car className="w-3.5 h-3.5 text-slate-500" /> Informações de Valet & Estacionamento
              </label>
              <input
                type="text"
                value={profile.parkingAndAccessInfo || ''}
                onChange={(e) => setProfile({ ...profile, parkingAndAccessInfo: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00A884]"
                placeholder="Ex: Valet cortesia na porta com manobrista..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* Horários de Funcionamento Semanal */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <Clock className="w-4 h-4 text-amber-500" />
          <h3 className="text-xs font-bold text-slate-900 font-heading">
            Horários de Atendimento & Funcionamento Semanal
          </h3>
          <span className="text-[10px] text-slate-400 ml-auto">
            Utilizado pelo agente de IA para confirmar agendamentos e horários seguros
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
          {(Object.entries(profile.businessHours) as [keyof typeof profile.businessHours, BusinessDayHours][]).map(([key, day]) => (
            <div
              key={key}
              className={`p-2.5 rounded-lg border flex flex-col justify-between transition-colors ${
                day.isOpen
                  ? 'bg-slate-50/80 border-slate-200 text-slate-800'
                  : 'bg-slate-100/60 border-slate-200 text-slate-400 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-[11px] uppercase tracking-wider text-slate-700">
                  {key}
                </span>
                <input
                  type="checkbox"
                  checked={day.isOpen}
                  onChange={(e) => {
                    setProfile({
                      ...profile,
                      businessHours: {
                        ...profile.businessHours,
                        [key]: { ...day, isOpen: e.target.checked },
                      },
                    });
                  }}
                  className="rounded text-[#00A884] focus:ring-[#00A884]"
                />
              </div>

              {day.isOpen ? (
                <div className="space-y-1">
                  <div className="text-[10px] font-mono text-slate-600 flex items-center justify-between">
                    <span>Abre:</span>
                    <input
                      type="text"
                      value={day.open}
                      onChange={(e) => {
                        setProfile({
                          ...profile,
                          businessHours: {
                            ...profile.businessHours,
                            [key]: { ...day, open: e.target.value },
                          },
                        });
                      }}
                      className="w-12 px-1 py-0.5 text-center bg-white border border-slate-300 rounded font-bold"
                    />
                  </div>
                  <div className="text-[10px] font-mono text-slate-600 flex items-center justify-between">
                    <span>Fecha:</span>
                    <input
                      type="text"
                      value={day.close}
                      onChange={(e) => {
                        setProfile({
                          ...profile,
                          businessHours: {
                            ...profile.businessHours,
                            [key]: { ...day, close: e.target.value },
                          },
                        });
                      }}
                      className="w-12 px-1 py-0.5 text-center bg-white border border-slate-300 rounded font-bold"
                    />
                  </div>
                </div>
              ) : (
                <div className="py-2 text-center text-[11px] italic font-medium text-slate-400">
                  Fechado
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Políticas Comerciais & Formas de Pagamento Aceitas */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <CreditCard className="w-4 h-4 text-purple-600" />
          <h3 className="text-xs font-bold text-slate-900 font-heading">
            Garantias, Políticas de Cancelamento & Formas de Pagamento
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Garantias Oficiais & Políticas de Retoque / Cancelamento
            </label>
            <textarea
              rows={3}
              value={profile.guaranteesAndPolicies}
              onChange={(e) => setProfile({ ...profile, guaranteesAndPolicies: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00A884]"
              placeholder="Ex: Retoque gratuito em 24h, cancelamento sem custo com 2h de antecedência..."
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Meios de Pagamento Aceitos (Alçadas do Agente)
            </label>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {profile.acceptedPaymentMethods.map((method, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-800 border border-purple-200 font-semibold text-xs flex items-center gap-1.5"
                >
                  <Check className="w-3 h-3 text-purple-600" />
                  {method}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-2">
              O agente de IA utiliza essas condições ao formular propostas e gerar links de pagamento rápidos.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
};
