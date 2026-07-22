import { supabase } from './supabase';
import { ChannelMessage, MinslackTask, MinslackChannel } from '../components/minslack/types';
import { ProjectItem } from '../components/minslack/MinSlack';

// ==========================================
// MESSAGES STORAGE
// ==========================================
export async function fetchSupabaseMessages(): Promise<ChannelMessage[] | null> {
  try {
    const { data, error } = await supabase
      .from('minslack_messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetch messages error (using local storage fallback):', error.message);
      return null;
    }

    if (!data) return [];

    return data.map((row: any) => ({
      id: row.id,
      channelId: row.channel_id,
      author: row.author,
      authorRole: row.author_role || 'Member',
      text: row.text,
      createdAt: row.created_at,
      tags: row.tags || [],
      flagged: row.flagged || false,
      flagReason: row.flag_reason || undefined,
      replies: row.replies || [],
    }));
  } catch (err) {
    console.warn('Failed to load messages from Supabase:', err);
    return null;
  }
}

export async function syncMessagesToSupabase(messages: ChannelMessage[]): Promise<void> {
  try {
    // Save locally first
    localStorage.setItem('minslack_messages', JSON.stringify(messages));

    if (messages.length === 0) return;

    const payload = messages.map(m => ({
      id: m.id,
      channel_id: m.channelId,
      author: m.author,
      author_role: m.authorRole,
      text: m.text,
      created_at: m.createdAt,
      tags: m.tags || [],
      flagged: m.flagged || false,
      flag_reason: m.flagReason || null,
      replies: m.replies || [],
    }));

    const { error } = await supabase.from('minslack_messages').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.warn('Supabase messages upsert error:', error.message);
    }
  } catch (err) {
    console.warn('Error syncing messages to Supabase:', err);
  }
}

// ==========================================
// TASKS STORAGE
// ==========================================
export async function fetchSupabaseTasks(): Promise<MinslackTask[] | null> {
  try {
    const { data, error } = await supabase
      .from('minslack_tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetch tasks error (using local storage fallback):', error.message);
      return null;
    }

    if (!data) return [];

    return data.map((row: any) => ({
      id: row.id,
      title: row.title,
      description: row.description || '',
      status: row.status,
      tags: row.tags || [],
      assignee: row.assignee || 'Unassigned',
      creator: row.creator || 'System',
      priority: row.priority || 'medium',
      flagged: row.flagged || false,
      flagReason: row.flag_reason || undefined,
      flaggedBy: row.flagged_by || undefined,
      createdAt: row.created_at,
      comments: row.comments || [],
    }));
  } catch (err) {
    console.warn('Failed to load tasks from Supabase:', err);
    return null;
  }
}

export async function syncTasksToSupabase(tasks: MinslackTask[]): Promise<void> {
  try {
    localStorage.setItem('minslack_tasks', JSON.stringify(tasks));

    if (tasks.length === 0) return;

    const payload = tasks.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description || '',
      status: t.status,
      tags: t.tags || [],
      assignee: t.assignee || 'Unassigned',
      creator: t.creator || 'System',
      priority: t.priority || 'medium',
      flagged: t.flagged || false,
      flag_reason: t.flagReason || null,
      flagged_by: t.flaggedBy || null,
      created_at: t.createdAt,
      comments: t.comments || [],
    }));

    const { error } = await supabase.from('minslack_tasks').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.warn('Supabase tasks upsert error:', error.message);
    }
  } catch (err) {
    console.warn('Error syncing tasks to Supabase:', err);
  }
}

// ==========================================
// CHANNELS STORAGE
// ==========================================
export async function fetchSupabaseChannels(): Promise<MinslackChannel[] | null> {
  try {
    const { data, error } = await supabase.from('minslack_channels').select('*');
    if (error) return null;
    if (!data) return [];

    return data.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      isPrivate: row.is_private || false,
      members: row.members || [],
    }));
  } catch (err) {
    return null;
  }
}

export async function syncChannelsToSupabase(channels: MinslackChannel[]): Promise<void> {
  try {
    localStorage.setItem('minslack_channels', JSON.stringify(channels));

    if (channels.length === 0) return;

    const payload = channels.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
      is_private: c.isPrivate || false,
      members: c.members || [],
    }));

    await supabase.from('minslack_channels').upsert(payload, { onConflict: 'id' });
  } catch (err) {
    console.warn('Error syncing channels to Supabase:', err);
  }
}

// ==========================================
// PROJECTS STORAGE
// ==========================================
export async function fetchSupabaseProjects(): Promise<ProjectItem[] | null> {
  try {
    const { data, error } = await supabase.from('minslack_projects').select('*');
    if (error) return null;
    if (!data) return [];

    return data.map((row: any) => ({
      id: row.id,
      name: row.name,
      owner: row.owner,
      progress: row.progress || 0,
      startDate: row.start_date || '',
      endDate: row.end_date || '',
      status: row.status || 'on_track',
      tags: row.tags || [],
    }));
  } catch (err) {
    return null;
  }
}

export async function syncProjectsToSupabase(projects: ProjectItem[]): Promise<void> {
  try {
    localStorage.setItem('minslack_projects', JSON.stringify(projects));

    if (projects.length === 0) return;

    const payload = projects.map(p => ({
      id: p.id,
      name: p.name,
      owner: p.owner,
      progress: p.progress || 0,
      start_date: p.startDate,
      end_date: p.endDate,
      status: p.status,
      tags: p.tags || [],
    }));

    await supabase.from('minslack_projects').upsert(payload, { onConflict: 'id' });
  } catch (err) {
    console.warn('Error syncing projects to Supabase:', err);
  }
}

// ==========================================
// REAL-TIME SUBSCRIPTIONS
// ==========================================
export function subscribeToMinSlackRealtime(callbacks: {
  onMessagesChange: () => void;
  onTasksChange: () => void;
  onChannelsChange?: () => void;
  onProjectsChange?: () => void;
}) {
  const channel = supabase
    .channel('minslack_cloud_sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'minslack_messages' }, () => {
      callbacks.onMessagesChange();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'minslack_tasks' }, () => {
      callbacks.onTasksChange();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'minslack_channels' }, () => {
      if (callbacks.onChannelsChange) callbacks.onChannelsChange();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'minslack_projects' }, () => {
      if (callbacks.onProjectsChange) callbacks.onProjectsChange();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
