export type WhatsAppEngineType = 'waba' | 'waha';

export type GroupCategory = 'client_account' | 'agency_internal' | 'launch_squad' | 'support_leads';

export type GroupHealthStatus = 'active' | 'pending_action' | 'idle' | 'muted';

export interface WhatsAppGroup {
  id: string;
  name: string;
  clientName: string;
  avatarUrl?: string;
  participantCount: number;
  unreadCount: number;
  category: GroupCategory;
  engine: WhatsAppEngineType; // WABA (Oficial Meta Cloud API) or WAHA (HTTP Automation / Multi-device)
  healthStatus: GroupHealthStatus;
  lastMessage: {
    sender: string;
    text: string;
    timestamp: string;
    isClient: boolean;
  };
  pendingTaskCount: number;
  nextMilestone?: string;
  assignedManagerName: string;
  pinned: boolean;
  tags: string[];
  notes?: string;
}

export interface EngineConfig {
  waba: {
    enabled: boolean;
    businessAccountId: string;
    phoneNumberId: string;
    status: 'connected' | 'degraded' | 'disconnected';
    qualityRating: 'GREEN' | 'YELLOW' | 'RED';
    messagingLimit: '1k' | '10k' | '100k' | 'unlimited';
    templateCount: number;
    verifiedName: string;
  };
  waha: {
    enabled: boolean;
    sessionName: string;
    endpointUrl: string;
    status: 'connected' | 'scanning_qr' | 'stopped';
    batteryLevel?: number;
    isMultiDevice: boolean;
    uptimeHours: number;
  };
  preferredRouting: {
    directSales: 'waba' | 'waha';
    groupManagement: 'waba' | 'waha';
    massBroadcast: 'waba' | 'waha';
    leadNurturing: 'waba' | 'waha';
  };
}
