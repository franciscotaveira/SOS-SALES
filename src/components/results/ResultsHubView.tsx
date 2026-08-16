import React, { useState } from 'react';
import { Workspace, Journey } from '../../types/cockpit';
import { SalesOsGateway, HttpSalesOsGateway } from '../../services/salesOsGateway';
import { ManagerDashboardView } from '../dashboard/ManagerDashboardView';
import { TrafficProofView } from './TrafficProofView';
import { LiveTrafficProofView } from './LiveTrafficProofView';
import { PieChart, BarChart3, TrendingUp } from 'lucide-react';

export type ResultsSubTab = 'analytics' | 'traffic_proof';

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

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8fafc] overflow-y-auto">
      {/* Top Header / Mode Switcher */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#e2e8f0] px-6 py-3 shadow-2xs">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <BarChart3 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900">
                  Resultados Comerciais & Métricas
                </h1>
                <span className="bg-emerald-50 text-emerald-700 font-bold text-[10.5px] px-2 py-0.5 rounded-full border border-emerald-200">
                  Gestão Executiva
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Auditoria de ROI da IA, Atribuição Meta Ads e ROAS Comercial Real.
              </p>
            </div>
          </div>

          {/* Subcategory Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              id="results-tab-analytics"
              onClick={() => setActiveSubTab('analytics')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeSubTab === 'analytics'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <PieChart className="w-3.5 h-3.5 text-purple-600" />
              <span>Analytics & ROI da IA</span>
            </button>

            <button
              id="results-tab-traffic-proof"
              onClick={() => setActiveSubTab('traffic_proof')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeSubTab === 'traffic_proof'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              <span>Proof of Traffic & ROAS</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content Rendering */}
      <div className="flex-1">
        {activeSubTab === 'analytics' ? (
          <ManagerDashboardView />
        ) : (
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
      </div>
    </div>
  );
};
