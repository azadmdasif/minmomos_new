import { supabase } from './supabase';
import { ChannelMessage, MinslackTask, MinslackChannel, TaskComment } from '../components/minslack/types';
import { ProjectItem } from '../components/minslack/MinSlack';

// ==========================================
// UUID & DM CHANNEL HELPERS
// ==========================================
export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isGuid(str: string): boolean {
  if (!str) return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);
}

export function getDmChannelName(user1: string, user2: string): string {
  const u1 = (user1 || '').trim().toLowerCase();
  const u2 = (user2 || '').trim().toLowerCase();
  return `dm-${[u1, u2].sort().join('-')}`;
}

export function getDmChannelId(user1: string, user2: string): string {
  return getDmChannelName(user1, user2);
}

export function isSameDmChannel(chan1: string, chan2: string): boolean {
  if (!chan1 || !chan2) return false;
  const c1 = chan1.toLowerCase();
  const c2 = chan2.toLowerCase();
  if (c1 === c2) return true;
  if (c1.startsWith('dm-') && c2.startsWith('dm-')) {
    const parts1 = c1.substring(3).split('-').map(p => p.trim()).sort().join('-');
    const parts2 = c2.substring(3).split('-').map(p => p.trim()).sort().join('-');
    return parts1 === parts2;
  }
  return false;
}

function normalizeProjectStatus(s?: string): 'on_track' | 'at_risk' | 'delayed' {
  if (!s) return 'on_track';
  const val = s.toLowerCase().replace(/[\s-]/g, '_');
  if (val === 'at_risk' || val === 'warning' || val === 'critical') return 'at_risk';
  if (val === 'delayed' || val === 'stuck') return 'delayed';
  return 'on_track';
}

// ==========================================
// IN-MEMORY CACHE TO REDUCE EGRESS
// ==========================================
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 10000; // 10 second cache TTL
let messagesCache: CacheEntry<ChannelMessage[]> | null = null;
let tasksCache: CacheEntry<MinslackTask[]> | null = null;
let channelsCache: CacheEntry<MinslackChannel[]> | null = null;
let projectsCache: CacheEntry<ProjectItem[]> | null = null;

export function invalidateMinSlackCache() {
  messagesCache = null;
  tasksCache = null;
  channelsCache = null;
  projectsCache = null;
}

// ==========================================
// MESSAGES STORAGE
// ==========================================
export async function fetchSupabaseMessages(forceRefresh = false): Promise<ChannelMessage[] | null> {
  try {
    const now = Date.now();
    if (!forceRefresh && messagesCache && (now - messagesCache.timestamp < CACHE_TTL_MS)) {
      return messagesCache.data;
    }

    const { data, error } = await supabase
      .from('minslack_messages')
      .select('id, channel_id, author, author_role, text, created_at, tags, flagged, flag_reason, parent_id')
      .order('created_at', { ascending: true })
      .limit(500);

    if (error) {
      console.warn('Supabase fetch messages error:', error.message);
      return messagesCache ? messagesCache.data : null;
    }

    if (!data) return [];

    const parentMap = new Map<string, ChannelMessage>();
    const replyRows: any[] = [];

    data.forEach((row: any) => {
      const msg: ChannelMessage = {
        id: row.id,
        channelId: row.channel_id,
        author: row.author,
        authorRole: row.author_role || 'Member',
        text: row.text,
        createdAt: row.created_at,
        tags: row.tags || [],
        flagged: row.flagged || false,
        flagReason: row.flag_reason || undefined,
        replies: [],
      };

      if (!row.parent_id) {
        parentMap.set(row.id, msg);
      } else {
        replyRows.push(row);
      }
    });

    // Attach replies to parents
    replyRows.forEach((row: any) => {
      const parent = parentMap.get(row.parent_id);
      const replyMsg: ChannelMessage = {
        id: row.id,
        channelId: row.channel_id,
        author: row.author,
        authorRole: row.author_role || 'Member',
        text: row.text,
        createdAt: row.created_at,
        tags: row.tags || [],
        flagged: row.flagged || false,
        flagReason: row.flag_reason || undefined,
      };
      if (parent) {
        parent.replies = parent.replies || [];
        parent.replies.push(replyMsg);
      }
    });

    const parsed = Array.from(parentMap.values());
    messagesCache = { data: parsed, timestamp: Date.now() };
    return parsed;
  } catch (err) {
    console.warn('Failed to load messages from Supabase:', err);
    return messagesCache ? messagesCache.data : null;
  }
}

export async function syncMessagesToSupabase(messages: ChannelMessage[], channelMap?: Map<string, string>): Promise<void> {
  try {
    messagesCache = { data: messages, timestamp: Date.now() };

    if (messages.length === 0) return;

    const payload: any[] = [];
    for (const m of messages) {
      let targetChanUuid = m.channelId;

      // 1. If channelId is already a UUID, keep it
      if (!isGuid(targetChanUuid)) {
        const nameLower = (targetChanUuid || '').trim().toLowerCase();

        // 2. Lookup in channelMap
        if (channelMap && channelMap.has(nameLower)) {
          targetChanUuid = channelMap.get(nameLower)!;
        }

        // 3. Lookup in channelsCache
        if (!isGuid(targetChanUuid) && channelsCache?.data) {
          const match = channelsCache.data.find(
            c => c.id === targetChanUuid || c.name.toLowerCase() === nameLower
          );
          if (match && isGuid(match.id)) {
            targetChanUuid = match.id;
          }
        }

        // 4. Query Supabase minslack_channels by name or create if missing
        if (!isGuid(targetChanUuid) && nameLower) {
          try {
            const { data: existing } = await supabase
              .from('minslack_channels')
              .select('id')
              .eq('name', nameLower)
              .maybeSingle();

            if (existing && existing.id && isGuid(existing.id)) {
              targetChanUuid = existing.id;
            } else {
              const newUuid = generateUuid();
              const { error: insErr } = await supabase.from('minslack_channels').insert([{
                id: newUuid,
                name: nameLower,
                description: nameLower.startsWith('dm-') ? `Direct message channel ${nameLower}` : `Channel ${nameLower}`,
                is_private: nameLower.startsWith('dm-')
              }]);
              if (!insErr) {
                targetChanUuid = newUuid;
              }
            }
          } catch (e) {
            console.warn('Error ensuring channel in Supabase:', e);
          }
        }
      }

      if (isGuid(targetChanUuid)) {
        const mainMsgId = isGuid(m.id) ? m.id : generateUuid();
        payload.push({
          id: mainMsgId,
          channel_id: targetChanUuid,
          author: m.author,
          author_role: m.authorRole || 'Member',
          text: m.text,
          created_at: m.createdAt || new Date().toISOString(),
          tags: m.tags || [],
          flagged: m.flagged || false,
          flag_reason: m.flagReason || null,
          parent_id: null,
        });

        if (m.replies && m.replies.length > 0) {
          m.replies.forEach(r => {
            payload.push({
              id: isGuid(r.id) ? r.id : generateUuid(),
              channel_id: targetChanUuid,
              author: r.author,
              author_role: r.authorRole || 'Member',
              text: r.text,
              created_at: r.createdAt || new Date().toISOString(),
              tags: r.tags || [],
              flagged: r.flagged || false,
              flag_reason: r.flagReason || null,
              parent_id: mainMsgId,
            });
          });
        }
      }
    }

    if (payload.length > 0) {
      const { error } = await supabase.from('minslack_messages').upsert(payload, { onConflict: 'id' });
      if (error) {
        console.warn('Supabase messages upsert error:', error.message);
      }
    }
  } catch (err) {
    console.warn('Error syncing messages to Supabase:', err);
  }
}

// ==========================================
// TASKS STORAGE
// ==========================================
export async function fetchSupabaseTasks(forceRefresh = false): Promise<MinslackTask[] | null> {
  try {
    const now = Date.now();
    if (!forceRefresh && tasksCache && (now - tasksCache.timestamp < CACHE_TTL_MS)) {
      return tasksCache.data;
    }

    // 1. Fetch tasks from minslack_tasks
    let taskRows: any[] | null = null;
    let taskErr: any = null;

    const { data: selectWithDeadline, error: deadlineErr } = await supabase
      .from('minslack_tasks')
      .select('id, title, description, status, tags, assignee, creator, priority, flagged, flag_reason, flagged_by, created_at, deadline')
      .order('created_at', { ascending: false })
      .limit(200);

    if (deadlineErr) {
      // Fallback if deadline column does not exist yet
      const { data: selectWithoutDeadline, error: noDeadlineErr } = await supabase
        .from('minslack_tasks')
        .select('id, title, description, status, tags, assignee, creator, priority, flagged, flag_reason, flagged_by, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      
      taskRows = selectWithoutDeadline;
      taskErr = noDeadlineErr;
    } else {
      taskRows = selectWithDeadline;
    }

    if (taskErr) {
      console.warn('Supabase fetch tasks error:', taskErr.message);
      return tasksCache ? tasksCache.data : null;
    }

    if (!taskRows) return [];

    // 2. Fetch task comments from minslack_task_comments
    const taskIds = taskRows.map(t => t.id);
    const commentsMap = new Map<string, TaskComment[]>();

    if (taskIds.length > 0) {
      const { data: commentRows, error: commentErr } = await supabase
        .from('minslack_task_comments')
        .select('id, task_id, author, author_role, text, created_at')
        .in('task_id', taskIds)
        .order('created_at', { ascending: true });

      if (!commentErr && commentRows) {
        commentRows.forEach((c: any) => {
          const list = commentsMap.get(c.task_id) || [];
          list.push({
            id: c.id,
            author: c.author,
            authorRole: c.author_role || 'Member',
            text: c.text,
            createdAt: c.created_at,
          });
          commentsMap.set(c.task_id, list);
        });
      }
    }

    // 3. Map tasks with their comments
    const parsed: MinslackTask[] = taskRows.map((row: any) => ({
      id: row.id,
      title: row.title,
      description: row.description || '',
      status: row.status || 'todo',
      tags: row.tags || [],
      assignee: row.assignee || 'Unassigned',
      creator: row.creator || 'System',
      priority: row.priority || 'medium',
      flagged: row.flagged || false,
      flagReason: row.flag_reason || undefined,
      flaggedBy: row.flagged_by || undefined,
      createdAt: row.created_at,
      deadline: row.deadline || undefined,
      comments: commentsMap.get(row.id) || [],
    }));

    tasksCache = { data: parsed, timestamp: Date.now() };
    return parsed;
  } catch (err) {
    console.warn('Failed to load tasks from Supabase:', err);
    return tasksCache ? tasksCache.data : null;
  }
}

export async function syncTasksToSupabase(tasks: MinslackTask[]): Promise<void> {
  try {
    tasksCache = { data: tasks, timestamp: Date.now() };

    if (tasks.length === 0) return;

    const taskPayload: any[] = [];
    const commentPayload: any[] = [];

    tasks.forEach(t => {
      const taskUuid = isGuid(t.id) ? t.id : generateUuid();

      taskPayload.push({
        id: taskUuid,
        title: t.title,
        description: t.description || '',
        status: t.status || 'todo',
        tags: t.tags || [],
        assignee: t.assignee || 'Unassigned',
        creator: t.creator || 'System',
        priority: t.priority || 'medium',
        flagged: t.flagged || false,
        flag_reason: t.flagReason || null,
        flagged_by: t.flaggedBy || null,
        created_at: t.createdAt || new Date().toISOString(),
        deadline: t.deadline || null,
      });

      if (t.comments && t.comments.length > 0) {
        t.comments.forEach(c => {
          commentPayload.push({
            id: isGuid(c.id) ? c.id : generateUuid(),
            task_id: taskUuid,
            author: c.author,
            author_role: c.authorRole || 'Member',
            text: c.text,
            created_at: c.createdAt || new Date().toISOString(),
          });
        });
      }
    });

    const { error: tErr } = await supabase.from('minslack_tasks').upsert(taskPayload, { onConflict: 'id' });
    if (tErr) {
      if (tErr.message && tErr.message.includes('deadline')) {
        // Fall back to upserting without deadline if column does not exist in schema yet
        const cleanPayload = taskPayload.map(({ deadline, ...rest }) => rest);
        const { error: retryErr } = await supabase.from('minslack_tasks').upsert(cleanPayload, { onConflict: 'id' });
        if (retryErr) console.warn('Supabase tasks upsert retry error:', retryErr.message);
      } else {
        console.warn('Supabase tasks upsert error:', tErr.message);
      }
    }

    if (commentPayload.length > 0) {
      const { error: cErr } = await supabase.from('minslack_task_comments').upsert(commentPayload, { onConflict: 'id' });
      if (cErr) {
        console.warn('Supabase task comments upsert error:', cErr.message);
      }
    }
  } catch (err) {
    console.warn('Error syncing tasks to Supabase:', err);
  }
}

// ==========================================
// CHANNELS & DM STORAGE
// ==========================================
export async function fetchSupabaseChannels(forceRefresh = false): Promise<MinslackChannel[] | null> {
  try {
    const now = Date.now();
    if (!forceRefresh && channelsCache && (now - channelsCache.timestamp < CACHE_TTL_MS)) {
      return channelsCache.data;
    }

    const { data, error } = await supabase
      .from('minslack_channels')
      .select('id, name, description, is_private');

    if (error) {
      console.warn('Supabase fetch channels error:', error.message);
      return channelsCache ? channelsCache.data : null;
    }

    if (!data) return [];

    const parsed: MinslackChannel[] = data.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      isPrivate: row.is_private || false,
      members: row.name.startsWith('dm-') ? row.name.substring(3).split('-') : [],
    }));

    channelsCache = { data: parsed, timestamp: Date.now() };
    return parsed;
  } catch (err) {
    return channelsCache ? channelsCache.data : null;
  }
}

export async function syncChannelsToSupabase(channels: MinslackChannel[]): Promise<void> {
  try {
    channelsCache = { data: channels, timestamp: Date.now() };

    if (channels.length === 0) return;

    const payload = channels.map(c => ({
      id: isGuid(c.id) ? c.id : generateUuid(),
      name: c.name,
      description: c.description || '',
      is_private: c.isPrivate || false,
    }));

    const { error } = await supabase.from('minslack_channels').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.warn('Supabase channels upsert error:', error.message);
    }
  } catch (err) {
    console.warn('Error syncing channels to Supabase:', err);
  }
}

export async function deleteChannelFromSupabase(channelId: string, channelName?: string): Promise<void> {
  try {
    if (channelsCache) {
      channelsCache.data = channelsCache.data.filter(c => c.id !== channelId && c.name !== channelName);
    }
    if (isGuid(channelId)) {
      await supabase.from('minslack_channels').delete().eq('id', channelId);
    }
    if (channelName) {
      await supabase.from('minslack_channels').delete().eq('name', channelName.toLowerCase());
    }
  } catch (err) {
    console.warn('Error deleting channel from Supabase:', err);
  }
}

export async function ensureDmChannel(
  user1: string,
  user2: string,
  currentChannels: MinslackChannel[]
): Promise<{ channel: MinslackChannel; channels: MinslackChannel[] }> {
  const dmName = getDmChannelName(user1, user2);
  const existing = currentChannels.find(c => c.name.toLowerCase() === dmName.toLowerCase());

  if (existing) {
    return { channel: existing, channels: currentChannels };
  }

  // Check Supabase if it exists remotely
  try {
    const { data } = await supabase
      .from('minslack_channels')
      .select('id, name, description, is_private')
      .eq('name', dmName)
      .maybeSingle();

    if (data) {
      const remoteChan: MinslackChannel = {
        id: data.id,
        name: data.name,
        description: data.description || '',
        isPrivate: data.is_private || true,
        members: [user1, user2]
      };
      const updatedList = [...currentChannels, remoteChan];
      channelsCache = { data: updatedList, timestamp: Date.now() };
      return { channel: remoteChan, channels: updatedList };
    }
  } catch (err) {
    console.warn('Error checking remote DM channel:', err);
  }

  // Create new DM channel in Supabase
  const newDm: MinslackChannel = {
    id: generateUuid(),
    name: dmName,
    description: `Direct message between ${user1} and ${user2}`,
    isPrivate: true,
    members: [user1, user2]
  };

  try {
    await supabase.from('minslack_channels').insert([{
      id: newDm.id,
      name: newDm.name,
      description: newDm.description,
      is_private: true
    }]);
  } catch (err) {
    console.warn('Error inserting DM channel into Supabase:', err);
  }

  const updatedList = [...currentChannels, newDm];
  channelsCache = { data: updatedList, timestamp: Date.now() };
  return { channel: newDm, channels: updatedList };
}

// ==========================================
// PROJECTS STORAGE
// ==========================================
export async function fetchSupabaseProjects(forceRefresh = false): Promise<ProjectItem[] | null> {
  try {
    const now = Date.now();
    if (!forceRefresh && projectsCache && (now - projectsCache.timestamp < CACHE_TTL_MS)) {
      return projectsCache.data;
    }

    const { data, error } = await supabase
      .from('minslack_projects')
      .select('id, name, owner, progress, start_date, end_date, status, tags');

    if (error) {
      console.warn('Supabase fetch projects error:', error.message);
      return projectsCache ? projectsCache.data : null;
    }

    if (!data) return [];

    const parsed: ProjectItem[] = data.map((row: any) => ({
      id: row.id,
      name: row.name,
      owner: row.owner || 'System',
      progress: row.progress || 0,
      startDate: row.start_date || '',
      endDate: row.end_date || '',
      status: row.status || 'on_track',
      tags: row.tags || [],
    }));

    projectsCache = { data: parsed, timestamp: Date.now() };
    return parsed;
  } catch (err) {
    return projectsCache ? projectsCache.data : null;
  }
}

export async function syncProjectsToSupabase(projects: ProjectItem[]): Promise<void> {
  try {
    projectsCache = { data: projects, timestamp: Date.now() };

    if (projects.length === 0) return;

    const payload = projects.map(p => ({
      id: isGuid(p.id) ? p.id : generateUuid(),
      name: p.name,
      owner: p.owner || 'System',
      progress: p.progress || 0,
      start_date: p.startDate || new Date().toISOString().split('T')[0],
      end_date: p.endDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      status: normalizeProjectStatus(p.status),
      tags: p.tags || [],
    }));

    const { error } = await supabase.from('minslack_projects').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.warn('Supabase projects upsert error:', error.message);
    }
  } catch (err) {
    console.warn('Error syncing projects to Supabase:', err);
  }
}

// ==========================================
// REAL-TIME SUBSCRIPTIONS
// ==========================================
let msgDebounceTimer: any = null;
let taskDebounceTimer: any = null;
let chanDebounceTimer: any = null;
let projDebounceTimer: any = null;

export function subscribeToMinSlackRealtime(callbacks: {
  onMessagesChange: () => void;
  onTasksChange: () => void;
  onChannelsChange?: () => void;
  onProjectsChange?: () => void;
}) {
  const channel = supabase
    .channel('minslack_cloud_sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'minslack_messages' }, () => {
      if (msgDebounceTimer) clearTimeout(msgDebounceTimer);
      msgDebounceTimer = setTimeout(() => callbacks.onMessagesChange(), 500);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'minslack_tasks' }, () => {
      if (taskDebounceTimer) clearTimeout(taskDebounceTimer);
      taskDebounceTimer = setTimeout(() => callbacks.onTasksChange(), 500);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'minslack_task_comments' }, () => {
      if (taskDebounceTimer) clearTimeout(taskDebounceTimer);
      taskDebounceTimer = setTimeout(() => callbacks.onTasksChange(), 500);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'minslack_channels' }, () => {
      if (callbacks.onChannelsChange) {
        if (chanDebounceTimer) clearTimeout(chanDebounceTimer);
        chanDebounceTimer = setTimeout(() => callbacks.onChannelsChange!(), 500);
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'minslack_projects' }, () => {
      if (callbacks.onProjectsChange) {
        if (projDebounceTimer) clearTimeout(projDebounceTimer);
        projDebounceTimer = setTimeout(() => callbacks.onProjectsChange!(), 500);
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

