export type MinslackTag = 'ops' | 'hr' | 'stock' | 'kitchen' | 'finance' | 'promo' | 'pos' | 'tech' | 'other';

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';

export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface TaskComment {
  id: string;
  author: string;
  authorRole?: string;
  text: string;
  createdAt: string;
}

export interface MinslackTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  tags: MinslackTag[];
  assignee: string; // username or "Unassigned"
  creator: string;
  priority: PriorityLevel;
  flagged: boolean;
  flagReason?: string;
  flaggedBy?: string;
  createdAt: string;
  comments: TaskComment[];
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  author: string;
  authorRole: string;
  text: string;
  createdAt: string;
  tags?: MinslackTag[];
  flagged?: boolean;
  flagReason?: string;
  replies?: ChannelMessage[];
}

export interface MinslackChannel {
  id: string;
  name: string;
  description: string;
  isPrivate?: boolean;
  unreadCount?: number;
  members?: string[];
}

export interface MinslackNotification {
  id: string;
  type: 'task_assigned' | 'dm' | 'mention';
  title: string;
  description: string;
  author: string;
  createdAt: string;
  targetTab: 'chat' | 'board';
  targetChannelId?: string;
  targetTaskId?: string;
  targetTask?: MinslackTask;
}
