import React, { useState } from 'react';
import { Workspace, Journey } from '../../types/cockpit';
import { SalesOsGateway, HttpSalesOsGateway } from '../../services/salesOsGateway';
import { ManagerDashboardView } from '../dashboard/ManagerDashboardView';
import { TrafficProofView } from './TrafficProofView';
import { LiveTrafficProofView } from './LiveTrafficProofView';
import { CampaignLinksTab } from '../campaigns/CampaignLinksTab';
import { WabaTemplatesTab } from '../campaigns/WabaTemplatesTab';
import { TrackingSettings } from '../settings/TrackingSettings';
import {
  PieChart,
  TrendingUp,
  Link2,
  FileText,
  Target,
  Megaphone
} from 'lucide-react';

export type ResultsSubTab = 'analytics' | 'traffic_proof' | 'campaign_links' | 'waba_templates' | 'tracking';

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
      label: 'Analytics & ROI da IA',
      icon: PieChart,
      color: 'text-purple-600',
    },
    {
      id: 'traffic_proof' as ResultsSubTab,
      label: 'Campanhas & Anúncios (Click WA)',
      icon: TrendingUp,
      color: 'text-emerald-600',
    },
    {
      id: 'campaign_links' as ResultsSubTab,
      label: 'Links & QR Codes',
      icon: Link2,
      color: 'text-blue-600',
    },
    {
      id: 'waba_templates' as ResultsSubTab,
      label: 'Modelos WABA (Templates)',
      icon: FileText,
      color: 'text-amber-600',
    },
    {
      id: 'tracking' as ResultsSubTab,
      label: 'Traqueamento & Pixels',
      icon: Target,
      color: 'text-indigo-600',
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8fafc] overflow-y-auto">
      {/* Top Header & Subcategory Switcher */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#e2e8f0] px-6 py-3.5 shadow-2xs">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs shrink-0">
              <Megaphone className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 font-heading">
                  Gestão de Campanhas & Tráfego
                </h1>
                <span className="bg-emerald-50 text-emerald-700 font-bold text-[10.5px] px-2 py-0.5 rounded-full border border-emerald-200">
                  Marketing & Atribuição
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Auditoria de ROI da IA, Atribuição Meta Ads, Links Click WA, Modelos de Mensagem e Traqueamento CAPI.
              </p>
            </div>
          </div>

          {/* Clean Unified Pill Navigation */}
          <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200 text-xs overflow-x-auto no-scrollbar">
            {SUB_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`results-tab-${tab.id}`}
                  onClick={() => setActiveSubTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${tab.color}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content Rendering based on selected Subtab */}
      <div className="flex-1 pb-12">
        {activeSubTab === 'analytics' && <ManagerDashboardView />}

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

        {activeSubTab === 'campaign_links' && (
          <CampaignLinksTab workspace={workspace} />
        )}

        {activeSubTab === 'waba_templates' && (
          <WabaTemplatesTab workspace={workspace} />
        )}

        {activeSubTab === 'tracking' && (
          <div className="max-w-6xl mx-auto p-6">
            <TrackingSettings workspace={workspace} />
          </div>
        )}
      </div>
    </div>
  );
};
