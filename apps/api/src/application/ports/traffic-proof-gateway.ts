import { AuthenticatedActor } from './operator-authenticator.js';

export interface TrafficProofPeriod {
  from: string;
  to: string;
  /** Bounded number of campaign/source groups returned by the report. */
  limit: number;
}

/** Cohort report: acquisition occurred within the requested inclusive dates. */
export interface TrafficProofCampaign {
  source: string;
  campaignId: string | null;
  campaignName: string | null;
  acquiredLeads: number;
  wonOutcomes: number;
  lostOutcomes: number;
  revenueMinor: number;
  /** Null deliberately means no imported spend evidence for this group. */
  spendMinor: number | null;
  /** Null deliberately means spend is unknown or zero, so ROAS cannot be proven. */
  roas: number | null;
  currency: 'BRL';
}

export interface TrafficProofGateway {
  getTrafficProof(
    actor: AuthenticatedActor,
    workspaceId: string,
    period: TrafficProofPeriod,
  ): Promise<TrafficProofCampaign[] | null>;
}
