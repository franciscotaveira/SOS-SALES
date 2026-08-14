import React from 'react';
import { AcquisitionContext, Recommendation, ContinuityStep } from '../../types/cockpit';
import { ContinuityRibbon } from './ContinuityRibbon';

interface ContinuityLineProps {
  acquisition: AcquisitionContext;
  lastLeadMessage: string;
  recommendation?: Recommendation;
  continuitySteps?: ContinuityStep[];
  onApplyRecommendation?: () => void;
  className?: string;
}

/**
 * ContinuityLine is an alias / wrapper around the streamlined ContinuityRibbon component.
 */
export const ContinuityLine: React.FC<ContinuityLineProps> = (props) => {
  return <ContinuityRibbon {...props} />;
};
