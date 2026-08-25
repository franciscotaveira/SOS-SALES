export interface WabaChannelInfo {
  verifiedPhone?: string;
  displayPhone?: string;
  verifiedName?: string;
  phoneNumberId?: string;
  wabaId?: string;
  qualityRating?: string;
}

export interface WabaChannelInfoGateway {
  findConnectedByWorkspaceId(workspaceId: string): Promise<WabaChannelInfo | null>;
}
