import { DiscoveredUrl } from '../parser/types'; // Assuming it's there

export enum ChangeType {
  NEW = 'NEW',
  UPDATED = 'UPDATED',
  REMOVED = 'REMOVED',
  RENAMED = 'RENAMED',
  UNCHANGED = 'UNCHANGED'
}

export interface DiffResult {
  url: DiscoveredUrl;
  changeType: ChangeType;
  previousLoc?: string; // For RENAMED
}
