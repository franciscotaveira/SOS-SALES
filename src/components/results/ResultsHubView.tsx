import React, { useState } from 'react';
import { Workspace, Journey } from '../../types/cockpit';
import { SalesOsGateway, HttpSalesOsGateway } from '../../services/salesOsGateway';
import { ManagerDashboardView } from '../dashboard/ManagerDashboardView';
import { TrafficProofView } from './TrafficProofView';
import { LiveTrafficProofView } from './LiveTrafficProofView';
import { CampaignLinksTab } from '../campaigns/CampaignLinksTab';
import { WabaTemplatesTab } from '../campaigns/WabaTemplatesTab';
import { MassBroadcastView } from '../campaigns/MassBroadcastView';
import { TrackingSettings } from '../settings/TrackingSettings';
import { LtvConfigManager } from '../settings/LtvConfigManager';
import {
  PieChart,
  TrendingUp,
  Link2,
  FileText,
  Target,
  Megaphone,
  Radio,
  Sparkles,
} from 'lucide-react';

export type ResultsSubTab = 'analytics' | 'traffic_proof' | 'broadcast' | 'campaign_links' | 'waba_templates';

interface ResultsHubViewProps {
  workspace: Workspace;
  gateway: SalesOsGateway;
  journeys: Journey[];
  isAuthenticatedApiMode?: boolean;
  activeSubTab?: ResultsSubTab;
  onChangeSubTab?: (subTab: ResultsSubTab) => void;
}

export const ResultsHubView: React.FC<ResultsHubViewProps> = ({
  workspace,
  gateway,
  journeys,
  isAuthenticatedApiMode = false,
  activeSubTab: externalActiveSubTab,
  onChangeSubTab: externalOnChangeSubTab,
}) => {
  const [internalSubTab, setInternalSubTab] = useState<ResultsSubTab>('analytics');
  const activeSubTab = externalActiveSubTab !== undefined ? externalActiveSubTab : internalSubTab;
  const setActiveSubTab = externalOnChangeSubTab !== undefined ? externalOnChangeSubTab : setInternalSubTab;

  const SUB_TABS = [
    {
      id: 'analytics' as ResultsSubTab,
      label: 'Analytics & ROI',
      icon: PieChart,
    },
    {
      id: 'traffic_proof' as ResultsSubTab,
      label: 'Campanhas & Anúncios (CTWA)',
      icon: TrendingUp,
    },
    {
      id: 'broadcast' as ResultsSubTab,
      label: 'Disparo em Massa (Broadcast)',
      icon: Radio,
    },
    {
      id: 'campaign_links' as ResultsSubTab,
      label: 'Links & QR Codes',
      icon: Link2,
    },
    {
      id: 'waba_templates' as ResultsSubTab,
      label: 'Modelos WABA (Templates)',
      icon: FileText,
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--sos-canvas)] overflow-y-auto">
      {/* Top Header & Subcategory Switcher */}
      <div className="sticky top-0 z-10 bg-[var(--sos-surface)] border-b border-[var(--sos-border)] px-4 py-3 shadow-2xs">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--sos-action)]/10 text-[var(--sos-action)] flex items-center justify-center shadow-xs shrink-0">
              <Megaphone className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold text-[var(--sos-ink)] font-heading">
                  Gestão de Campanhas & Tráfego
                </h1>
                <span className="bg-[var(--sos-success-subtle)] text-[var(--sos-success)] font-bold text-xs px-1.5 py-0.5 rounded-full border border-[var(--sos-success)]/30">
                  Marketing & Atribuição
                </span>
              </div>
              <p className="text-[10px] text-[var(--sos-muted)]">
                Auditoria de ROI da IA, Atribuição Meta Ads, Links Click WA, Modelos de Mensagem e Traqueamento CAPI.
              </p>
            </div>
          </div>

          {/* Clean Unified Pill Navigation */}
          <div className="flex items-center gap-1 bg-[var(--sos-border)]/30 p-1 rounded-xl border border-[var(--sos-border)] text-xs overflow-x-auto no-scrollbar">
            {SUB_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`results-tab-${tab.id}`}
                  onClick={() => setActiveSubTab(tab.id)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-[var(--sos-surface)] text-[var(--sos-ink)] shadow-2xs'
                      : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)] hover:bg-[var(--sos-surface)]/50'
                  }`}
                >
                  <Icon className="w-3 h-3 text-[var(--sos-muted)]" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content Rendering based on selected Subtab */}
      <div className="flex-1 pb-8">
        {activeSubTab === 'analytics' && <ManagerDashboardView workspace={workspace} />}

        {activeSubTab === 'traffic_proof' && (
          isAuthenticatedApiMode && gateway instanceof HttpSalesOsGateway ? (
            <LiveTrafficProofView
              workspaceId={workspace.id}
              gateway={gateway}
            />
          ) : (
            <TrafficProofView
              workspace={workspace}
              gateway={gateway}
              journeys={journeys}
            />
          )
        )}

        {activeSubTab === 'broadcast' && (
          <MassBroadcastView workspace={workspace} />
        )}

        {activeSubTab === 'campaign_links' && (
          <CampaignLinksTab workspace={workspace} />
        )}

        {activeSubTab === 'waba_templates' && (
          <WabaTemplatesTab workspace={workspace} />
        )}
      </div>
    </div>
  );
};
