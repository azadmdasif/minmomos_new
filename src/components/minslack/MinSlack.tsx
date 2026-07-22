import React, { useState, useEffect, useMemo } from 'react';
import { 
  MessageSquare, 
  Layout, 
  AlertTriangle, 
  CheckCircle2, 
  Plus, 
  Search, 
  Send, 
  Tag as TagIcon, 
  Calendar, 
  X, 
  Check, 
  Trash2, 
  Flag, 
  AlertCircle,
  Hash,
  Sparkles,
  Users,
  Bell,
  AtSign,
  CheckCheck,
  Filter
} from 'lucide-react';
import { MinslackTask, MinslackTag, TaskStatus, PriorityLevel, TaskComment, ChannelMessage, MinslackChannel, MinslackNotification } from './types';
import { User } from '../../types';
import { getAppUsers } from '../../utils/storage';
import { 
  fetchSupabaseMessages, 
  syncMessagesToSupabase, 
  fetchSupabaseTasks, 
  syncTasksToSupabase, 
  fetchSupabaseChannels, 
  syncChannelsToSupabase, 
  fetchSupabaseProjects, 
  syncProjectsToSupabase, 
  subscribeToMinSlackRealtime 
} from '../../utils/minslackStorage';

interface MinSlackProps {
  user: User;
}

export interface ProjectItem {
  id: string;
  name: string;
  owner: string;
  progress: number; // 0 to 100
  startDate: string; // e.g., "2026-07-05"
  endDate: string;   // e.g., "2026-07-20"
  status: 'on_track' | 'at_risk' | 'delayed';
  tags: MinslackTag[];
}

const ALL_TAGS: MinslackTag[] = ['ops', 'hr', 'stock', 'kitchen', 'finance', 'promo', 'pos', 'tech', 'other'];

const DEFAULT_CHANNELS: MinslackChannel[] = [
  { id: 'general', name: 'general', description: 'Company-wide announcements and team coordination' },
];

const DEFAULT_TASKS: MinslackTask[] = [];

const DEFAULT_MESSAGES: ChannelMessage[] = [];

const DEFAULT_PROJECTS: ProjectItem[] = [];

export const MinSlack: React.FC<MinSlackProps> = ({ user }) => {
  // Navigation: 'chat' | 'board' | 'plan' | 'flags' | 'notifications'
  const [activeTab, setActiveTab] = useState<'chat' | 'board' | 'plan' | 'flags' | 'notifications'>('chat');
  const [tasks, setTasks] = useState<MinslackTask[]>([]);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [channels, setChannels] = useState<MinslackChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('general');
  const [projects, setProjects] = useState<ProjectItem[]>([]);

  // Notifications State
  const [readNotifIds, setReadNotifIds] = useState<string[]>([]);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread' | 'tasks' | 'dms' | 'mentions'>('all');

  // Direct Message & Member Selection States
  const [isCreateChannelModalOpen, setIsCreateChannelModalOpen] = useState(false);
  const [isNewDmModalOpen, setIsNewDmModalOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [channelError, setChannelError] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [newChannelMembers, setNewChannelMembers] = useState<string[]>([]);
  const [activeDms, setActiveDms] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [newDmSearch, setNewDmSearch] = useState('');

  // Task / Search Filters
  const [taskSearch, setTaskSearch] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<MinslackTag | 'all'>('all');
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState<PriorityLevel | 'all'>('all');
  const [flagFilter, setFlagFilter] = useState<'all' | 'flagged' | 'normal'>('all');

  // Interactive Modals
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('Unassigned');
  const [newTaskPriority, setNewTaskPriority] = useState<PriorityLevel>('medium');
  const [newTaskTags, setNewTaskTags] = useState<MinslackTag[]>([]);

  // Raise Problem Modal
  const [isRaiseProblemModalOpen, setIsRaiseProblemModalOpen] = useState(false);
  const [problemTitle, setProblemTitle] = useState('');
  const [problemDesc, setProblemDesc] = useState('');
  const [problemTag, setProblemTag] = useState<MinslackTag>('ops');
  const [problemUrgency, setProblemUrgency] = useState<PriorityLevel>('high');
  const [createTaskForProblem, setCreateTaskForProblem] = useState(true);

  // Active Task Detail Modal
  const [viewingTask, setViewingTask] = useState<MinslackTask | null>(null);
  const [newCommentText, setNewCommentText] = useState('');

  // Inline Flagging States (Replaces native prompt() forbidden in iframe)
  const [flaggingTaskId, setFlaggingTaskId] = useState<string | null>(null);
  const [flaggingTaskReason, setFlaggingTaskReason] = useState('');
  const [flaggingMsgId, setFlaggingMsgId] = useState<string | null>(null);
  const [flaggingMsgReason, setFlaggingMsgReason] = useState('');

  // Messenger State
  const [chatInput, setChatInput] = useState('');
  const [chatTags, setChatTags] = useState<MinslackTag[]>([]);
  const [isChatFlagged, setIsChatFlagged] = useState(false);
  const [chatFlagReason, setChatFlagReason] = useState('');
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);

  // Thread sidebar
  const [viewingThreadMsg, setViewingThreadMsg] = useState<ChannelMessage | null>(null);
  const [threadInput, setThreadInput] = useState('');

  // Gantt/Project Plan Modal / Editor
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(null);
  const [projName, setProjName] = useState('');
  const [projOwner, setProjOwner] = useState('');
  const [projProgress, setProjProgress] = useState<number>(50);
  const [projStart, setProjStart] = useState('2026-07-01');
  const [projEnd, setProjEnd] = useState('2026-07-15');
  const [projStatus, setProjStatus] = useState<'on_track' | 'at_risk' | 'delayed'>('on_track');
  const [projTags, setProjTags] = useState<MinslackTag[]>([]);

  // Load and save local & Supabase state
  useEffect(() => {
    const savedTasks = localStorage.getItem('minslack_tasks');
    const savedMessages = localStorage.getItem('minslack_messages');
    const savedProjects = localStorage.getItem('minslack_projects');
    const savedChannels = localStorage.getItem('minslack_channels');
    const savedDms = localStorage.getItem(`minslack_dms_${user.username}`);
    const savedReadNotifs = localStorage.getItem(`minslack_read_notifs_${user.username}`);

    if (savedTasks) {
      const parsed = JSON.parse(savedTasks) as MinslackTask[];
      const filtered = parsed.filter(t => !['task-1', 'task-2', 'task-3'].includes(t.id));
      setTasks(filtered);
    } else {
      setTasks(DEFAULT_TASKS);
    }

    if (savedMessages) {
      const parsed = JSON.parse(savedMessages) as ChannelMessage[];
      const filtered = parsed.filter(m => !['msg-1', 'msg-2', 'msg-3'].includes(m.id));
      setMessages(filtered);
    } else {
      setMessages(DEFAULT_MESSAGES);
    }

    if (savedProjects) {
      const parsed = JSON.parse(savedProjects) as ProjectItem[];
      const filtered = parsed.filter(p => !['p-1', 'p-2', 'p-3', 'p-4'].includes(p.id));
      setProjects(filtered);
    } else {
      setProjects(DEFAULT_PROJECTS);
    }

    if (savedChannels) setChannels(JSON.parse(savedChannels));
    else {
      setChannels(DEFAULT_CHANNELS);
    }

    if (savedDms) setActiveDms(JSON.parse(savedDms));
    else {
      setActiveDms([]);
    }

    if (savedReadNotifs) {
      setReadNotifIds(JSON.parse(savedReadNotifs));
    }

    // Fetch team users
    const loadUsers = async () => {
      try {
        const users = await getAppUsers();
        setAvailableUsers(users || []);
      } catch (e) {
        console.error(e);
        setAvailableUsers([]);
      }
    };
    loadUsers();

    // Async load from Supabase Cloud
    const loadFromCloud = async () => {
      const [remoteMsgs, remoteTasks, remoteChan, remoteProj] = await Promise.all([
        fetchSupabaseMessages(),
        fetchSupabaseTasks(),
        fetchSupabaseChannels(),
        fetchSupabaseProjects()
      ]);

      if (remoteMsgs && remoteMsgs.length > 0) {
        setMessages(remoteMsgs);
        localStorage.setItem('minslack_messages', JSON.stringify(remoteMsgs));
      }
      if (remoteTasks && remoteTasks.length > 0) {
        setTasks(remoteTasks);
        localStorage.setItem('minslack_tasks', JSON.stringify(remoteTasks));
      }
      if (remoteChan && remoteChan.length > 0) {
        setChannels(remoteChan);
        localStorage.setItem('minslack_channels', JSON.stringify(remoteChan));
      }
      if (remoteProj && remoteProj.length > 0) {
        setProjects(remoteProj);
        localStorage.setItem('minslack_projects', JSON.stringify(remoteProj));
      }
    };
    loadFromCloud();

    // Subscribe to Realtime Postgres Changes across PCs
    const unsubscribe = subscribeToMinSlackRealtime({
      onMessagesChange: async () => {
        const updatedMsgs = await fetchSupabaseMessages();
        if (updatedMsgs) {
          setMessages(updatedMsgs);
          localStorage.setItem('minslack_messages', JSON.stringify(updatedMsgs));
        }
      },
      onTasksChange: async () => {
        const updatedTasks = await fetchSupabaseTasks();
        if (updatedTasks) {
          setTasks(updatedTasks);
          localStorage.setItem('minslack_tasks', JSON.stringify(updatedTasks));
        }
      },
      onChannelsChange: async () => {
        const updatedChan = await fetchSupabaseChannels();
        if (updatedChan) {
          setChannels(updatedChan);
          localStorage.setItem('minslack_channels', JSON.stringify(updatedChan));
        }
      },
      onProjectsChange: async () => {
        const updatedProj = await fetchSupabaseProjects();
        if (updatedProj) {
          setProjects(updatedProj);
          localStorage.setItem('minslack_projects', JSON.stringify(updatedProj));
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user.username]);

  const updateTasksState = (nextTasks: MinslackTask[]) => {
    setTasks(nextTasks);
    syncTasksToSupabase(nextTasks);
  };

  const updateMessagesState = (nextMessages: ChannelMessage[]) => {
    setMessages(nextMessages);
    syncMessagesToSupabase(nextMessages);
  };

  const updateProjectsState = (nextProjects: ProjectItem[]) => {
    setProjects(nextProjects);
    syncProjectsToSupabase(nextProjects);
  };

  const updateChannelsState = (nextChannels: MinslackChannel[]) => {
    setChannels(nextChannels);
    syncChannelsToSupabase(nextChannels);
  };

  const updateActiveDms = (nextDms: string[]) => {
    setActiveDms(nextDms);
    localStorage.setItem(`minslack_dms_${user.username}`, JSON.stringify(nextDms));
  };

  const handleCreateChannel = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newChannelName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
    if (!cleanName) {
      setChannelError('Channel name cannot be empty');
      return;
    }

    if (channels.some(c => c.id === cleanName)) {
      setChannelError(`A channel named #${cleanName} already exists`);
      return;
    }

    const newChan: MinslackChannel = {
      id: cleanName,
      name: cleanName,
      description: newChannelDesc.trim() || 'Custom created channel',
      members: [user.username, ...newChannelMembers]
    };

    const nextChans = [...channels, newChan];
    updateChannelsState(nextChans);

    // Switch to new channel
    setActiveChannelId(cleanName);
    setActiveTab('chat');
    setViewingThreadMsg(null);

    // Reset fields
    setNewChannelName('');
    setNewChannelDesc('');
    setNewChannelMembers([]);
    setChannelError('');
    setIsCreateChannelModalOpen(false);
  };

  const handleStartDm = (targetUsername: string) => {
    if (!activeDms.includes(targetUsername)) {
      const nextDms = [...activeDms, targetUsername];
      updateActiveDms(nextDms);
    }
    
    const dmId = `dm-${[user.username, targetUsername].sort().join('-')}`;
    setActiveChannelId(dmId);
    setActiveTab('chat');
    setViewingThreadMsg(null);
    
    setIsNewDmModalOpen(false);
  };

  // Create Task
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const newTask: MinslackTask = {
      id: `task-${Date.now()}`,
      title: newTaskTitle,
      description: newTaskDesc,
      status: 'todo',
      tags: newTaskTags,
      assignee: newTaskAssignee,
      creator: user.username,
      priority: newTaskPriority,
      flagged: false,
      createdAt: new Date().toISOString(),
      comments: []
    };

    const updated = [newTask, ...tasks];
    updateTasksState(updated);

    // Alert general channel
    const systemAlert: ChannelMessage = {
      id: `msg-${Date.now()}`,
      channelId: 'general',
      author: 'System Bot',
      authorRole: 'ADMIN',
      text: `📋 **New Task Created** by **@${user.username}**: "${newTaskTitle}" (Assignee: *${newTaskAssignee}*)`,
      createdAt: new Date().toISOString()
    };
    updateMessagesState([systemAlert, ...messages]);

    // Reset Form
    setNewTaskTitle('');
    setNewTaskDesc('');
    setNewTaskAssignee('Unassigned');
    setNewTaskPriority('medium');
    setNewTaskTags([]);
    setIsNewTaskModalOpen(false);
  };

  // Raise Problem Handler
  const handleRaiseProblem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!problemTitle.trim()) return;

    const cleanDesc = problemDesc || `Reported operational problem regarding ${problemTitle}`;

    // Add immediate system message in general & operations channel
    const alertMessage: ChannelMessage = {
      id: `msg-${Date.now()}`,
      channelId: 'operations',
      author: user.username,
      authorRole: user.role,
      text: `⚠️ **🚨 OPERATIONAL PROBLEM RAISED** ⚠️\n**Issue**: ${problemTitle}\n**Description**: ${cleanDesc}\n**Category**: #${problemTag} • **Priority**: ${problemUrgency.toUpperCase()}`,
      createdAt: new Date().toISOString(),
      tags: [problemTag],
      flagged: true,
      flagReason: `Urgent attention required: ${problemTitle}`
    };

    let nextTasks = [...tasks];
    if (createTaskForProblem) {
      const pTask: MinslackTask = {
        id: `task-${Date.now()}`,
        title: `🚨 FIX: ${problemTitle}`,
        description: cleanDesc,
        status: 'todo',
        tags: [problemTag],
        assignee: 'Unassigned',
        creator: user.username,
        priority: problemUrgency,
        flagged: true,
        flagReason: `Raised via problem reporter: ${cleanDesc}`,
        flaggedBy: user.username,
        createdAt: new Date().toISOString(),
        comments: []
      };
      nextTasks = [pTask, ...nextTasks];
    }

    updateMessagesState([alertMessage, ...messages]);
    updateTasksState(nextTasks);

    // Reset form
    setProblemTitle('');
    setProblemDesc('');
    setProblemTag('ops');
    setProblemUrgency('high');
    setCreateTaskForProblem(true);
    setIsRaiseProblemModalOpen(false);
    
    // Switch to Raised Problems view
    setActiveTab('flags');
  };

  // Update Task Status
  const handleUpdateTaskStatus = (taskId: string, nextStatus: TaskStatus) => {
    const updated = tasks.map(t => t.id === taskId ? { ...t, status: nextStatus } : t);
    updateTasksState(updated);
    if (viewingTask && viewingTask.id === taskId) {
      setViewingTask({ ...viewingTask, status: nextStatus });
    }
  };

  // Update Task Assignee
  const handleUpdateTaskAssignee = (taskId: string, nextAssignee: string) => {
    const updated = tasks.map(t => t.id === taskId ? { ...t, assignee: nextAssignee } : t);
    updateTasksState(updated);
    if (viewingTask && viewingTask.id === taskId) {
      setViewingTask({ ...viewingTask, assignee: nextAssignee });
    }

    // System announcement
    const systemMsg: ChannelMessage = {
      id: `msg-${Date.now()}`,
      channelId: 'general',
      author: 'System Bot',
      authorRole: 'ADMIN',
      text: `📋 **Task Reassigned** by **@${user.username}**: "${tasks.find(t => t.id === taskId)?.title || 'Task'}" is now assigned to **@${nextAssignee}**`,
      createdAt: new Date().toISOString()
    };
    updateMessagesState([systemMsg, ...messages]);
  };

  // Toggle Task Flag
  const handleToggleTaskFlag = (taskId: string, flagged: boolean, reason?: string) => {
    const updated = tasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          flagged,
          flagReason: flagged ? reason : undefined,
          flaggedBy: flagged ? user.username : undefined
        };
      }
      return t;
    });
    updateTasksState(updated);
    if (viewingTask && viewingTask.id === taskId) {
      setViewingTask({
        ...viewingTask,
        flagged,
        flagReason: flagged ? reason : undefined,
        flaggedBy: flagged ? user.username : undefined
      });
    }

    // System announcement
    const systemMsg: ChannelMessage = {
      id: `msg-${Date.now()}`,
      channelId: 'operations',
      author: 'System Bot',
      authorRole: 'ADMIN',
      text: flagged 
        ? `⚠️ **Task Problem Flagged** by **@${user.username}** on "${tasks.find(t => t.id === taskId)?.title}": "${reason}"`
        : `✅ **Task Problem Resolved** by **@${user.username}** for "${tasks.find(t => t.id === taskId)?.title}"`,
      createdAt: new Date().toISOString()
    };
    updateMessagesState([systemMsg, ...messages]);
  };

  // Add Comment
  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingTask || !newCommentText.trim()) return;

    const newComment: TaskComment = {
      id: `comment-${Date.now()}`,
      author: user.username,
      authorRole: user.role,
      text: newCommentText,
      createdAt: new Date().toISOString()
    };

    const updatedTasks = tasks.map(t => {
      if (t.id === viewingTask.id) {
        return { ...t, comments: [...(t.comments || []), newComment] };
      }
      return t;
    });

    updateTasksState(updatedTasks);
    setViewingTask({ ...viewingTask, comments: [...(viewingTask.comments || []), newComment] });
    setNewCommentText('');
  };

  // Send Chat Message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const newMsg: ChannelMessage = {
      id: `msg-${Date.now()}`,
      channelId: activeChannelId,
      author: user.username,
      authorRole: user.role,
      text: chatInput,
      createdAt: new Date().toISOString(),
      tags: chatTags.length > 0 ? chatTags : undefined,
      flagged: isChatFlagged,
      flagReason: isChatFlagged ? chatFlagReason : undefined
    };

    updateMessagesState([newMsg, ...messages]);
    setChatInput('');
    setChatTags([]);
    setIsChatFlagged(false);
    setChatFlagReason('');
    setIsTagDropdownOpen(false);
  };

  // Send Thread Reply
  const handleSendThreadReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingThreadMsg || !threadInput.trim()) return;

    const reply: ChannelMessage = {
      id: `reply-${Date.now()}`,
      channelId: viewingThreadMsg.channelId,
      author: user.username,
      authorRole: user.role,
      text: threadInput,
      createdAt: new Date().toISOString()
    };

    const nextMessages = messages.map(m => {
      if (m.id === viewingThreadMsg.id) {
        return { ...m, replies: [...(m.replies || []), reply] };
      }
      return m;
    });

    updateMessagesState(nextMessages);
    setViewingThreadMsg({
      ...viewingThreadMsg,
      replies: [...(viewingThreadMsg.replies || []), reply]
    });
    setThreadInput('');
  };

  // Resolve Message Flag
  const handleResolveMessageFlag = (msgId: string) => {
    const nextMessages = messages.map(m => {
      if (m.id === msgId) {
        return { ...m, flagged: false, flagReason: undefined };
      }
      return m;
    });
    updateMessagesState(nextMessages);

    const alertMsg: ChannelMessage = {
      id: `msg-${Date.now()}`,
      channelId: 'operations',
      author: 'System Bot',
      authorRole: 'ADMIN',
      text: `✅ **Chat Problem Resolved** by **@${user.username}**`,
      createdAt: new Date().toISOString()
    };
    updateMessagesState([alertMsg, ...nextMessages]);
  };

  // Save/Create Project (Gantt)
  const handleSaveProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName.trim() || !projOwner.trim()) return;

    if (selectedProject) {
      // Editing
      const updated = projects.map(p => p.id === selectedProject.id ? {
        ...p,
        name: projName,
        owner: projOwner,
        progress: Number(projProgress),
        startDate: projStart,
        endDate: projEnd,
        status: projStatus,
        tags: projTags
      } : p);
      updateProjectsState(updated);
    } else {
      // Creating
      const newProj: ProjectItem = {
        id: `p-${Date.now()}`,
        name: projName,
        owner: projOwner,
        progress: Number(projProgress),
        startDate: projStart,
        endDate: projEnd,
        status: projStatus,
        tags: projTags
      };
      updateProjectsState([...projects, newProj]);
    }

    setIsNewProjectModalOpen(false);
    setSelectedProject(null);
    setProjName('');
    setProjOwner('');
    setProjProgress(50);
    setProjStart('2026-07-01');
    setProjEnd('2026-07-15');
    setProjStatus('on_track');
    setProjTags([]);
  };

  const handleOpenEditProject = (p: ProjectItem) => {
    setSelectedProject(p);
    setProjName(p.name);
    setProjOwner(p.owner);
    setProjProgress(p.progress);
    setProjStart(p.startDate);
    setProjEnd(p.endDate);
    setProjStatus(p.status);
    setProjTags(p.tags);
    setIsNewProjectModalOpen(true);
  };

  const handleDeleteProject = (projId: string) => {
    if (confirm('Are you sure you want to delete this project from the timeline?')) {
      updateProjectsState(projects.filter(p => p.id !== projId));
      setIsNewProjectModalOpen(false);
      setSelectedProject(null);
    }
  };

  // Helper selectors
  const activeFlagsCount = useMemo(() => {
    const flaggedTasks = tasks.filter(t => t.flagged).length;
    const flaggedMessages = messages.filter(m => m.flagged).length;
    return flaggedTasks + flaggedMessages;
  }, [tasks, messages]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchSearch = task.title.toLowerCase().includes(taskSearch.toLowerCase()) || 
                          task.description.toLowerCase().includes(taskSearch.toLowerCase());
      const matchTag = selectedTagFilter === 'all' || task.tags.includes(selectedTagFilter);
      const matchPriority = selectedPriorityFilter === 'all' || task.priority === selectedPriorityFilter;
      const matchFlag = flagFilter === 'all' || 
                        (flagFilter === 'flagged' && task.flagged) || 
                        (flagFilter === 'normal' && !task.flagged);

      return matchSearch && matchTag && matchPriority && matchFlag;
    });
  }, [tasks, taskSearch, selectedTagFilter, selectedPriorityFilter, flagFilter]);

  const currentChannelMessages = useMemo(() => {
    return messages
      .filter(m => {
        if (m.channelId !== activeChannelId) return false;
        if (activeChannelId.startsWith('dm-')) {
          const parts = activeChannelId.substring(3).split('-');
          return parts.includes(user.username);
        }
        return true;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messages, activeChannelId, user.username]);

  const visibleChannels = useMemo(() => {
    return channels.filter(ch => {
      if (ch.id === 'general') return true;
      if (!ch.members) return true;
      return ch.members.includes(user.username);
    });
  }, [channels, user.username]);

  const allDms = useMemo(() => {
    const list = [...activeDms];
    messages.forEach(msg => {
      if (msg.channelId.startsWith('dm-')) {
        const parts = msg.channelId.substring(3).split('-');
        // CRITICAL: DMs are strictly visible to participants only
        if (parts.includes(user.username)) {
          const partner = parts.find(p => p !== user.username) || parts[0];
          if (partner && partner !== user.username && !list.includes(partner)) {
            list.push(partner);
          }
        }
      }
    });
    const validUsernames = new Set(availableUsers.map(u => u.username));
    return Array.from(new Set(list)).filter(dmUser => validUsernames.has(dmUser) && dmUser !== user.username);
  }, [activeDms, messages, user.username, availableUsers]);

  // Dynamic Notifications Engine
  const userNotifications = useMemo(() => {
    const list: MinslackNotification[] = [];
    const currUser = user.username;

    // 1. Tasks assigned to current user
    tasks.forEach(t => {
      if (t.assignee === currUser) {
        list.push({
          id: `notif-task-${t.id}`,
          type: 'task_assigned',
          title: `Task Assigned: "${t.title}"`,
          description: `Creator: @${t.creator || 'team'} • Priority: ${t.priority.toUpperCase()} • Status: ${t.status.replace('_', ' ')}${t.description ? ` • ${t.description.slice(0, 80)}` : ''}`,
          author: t.creator || 'System',
          createdAt: t.createdAt,
          targetTab: 'board',
          targetTaskId: t.id,
          targetTask: t
        });
      }
    });

    // 2. Direct Messages & Channel @Mentions
    messages.forEach(msg => {
      if (msg.channelId.startsWith('dm-')) {
        const parts = msg.channelId.substring(3).split('-');
        if (parts.includes(currUser) && msg.author !== currUser) {
          list.push({
            id: `notif-dm-${msg.id}`,
            type: 'dm',
            title: `Direct Message from @${msg.author}`,
            description: msg.text,
            author: msg.author,
            createdAt: msg.createdAt,
            targetTab: 'chat',
            targetChannelId: msg.channelId
          });
        }
      } else {
        // Channel mentions
        const textLower = msg.text.toLowerCase();
        const userMention = `@${currUser.toLowerCase()}`;
        const isMentioned = textLower.includes(userMention) || textLower.includes('@all') || textLower.includes('@channel');
        if (isMentioned && msg.author !== currUser) {
          list.push({
            id: `notif-mention-${msg.id}`,
            type: 'mention',
            title: `@Mention in #${msg.channelId}`,
            description: `@${msg.author}: "${msg.text}"`,
            author: msg.author,
            createdAt: msg.createdAt,
            targetTab: 'chat',
            targetChannelId: msg.channelId
          });
        }

        // Thread replies mentions
        if (msg.replies && msg.replies.length > 0) {
          msg.replies.forEach(reply => {
            const replyTextLower = reply.text.toLowerCase();
            const isReplyMentioned = replyTextLower.includes(userMention) || replyTextLower.includes('@all') || replyTextLower.includes('@channel');
            if (isReplyMentioned && reply.author !== currUser) {
              list.push({
                id: `notif-mention-${reply.id}`,
                type: 'mention',
                title: `@Mention in thread in #${msg.channelId}`,
                description: `@${reply.author}: "${reply.text}"`,
                author: reply.author,
                createdAt: reply.createdAt,
                targetTab: 'chat',
                targetChannelId: msg.channelId
              });
            }
          });
        }
      }
    });

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [tasks, messages, user.username]);

  const unreadNotifCount = useMemo(() => {
    return userNotifications.filter(n => !readNotifIds.includes(n.id)).length;
  }, [userNotifications, readNotifIds]);

  const assignedIncompleteTasksCount = useMemo(() => {
    return tasks.filter(t => t.assignee === user.username && t.status !== 'done').length;
  }, [tasks, user.username]);

  const markNotifAsRead = (notifId: string) => {
    if (!readNotifIds.includes(notifId)) {
      const next = [...readNotifIds, notifId];
      setReadNotifIds(next);
      localStorage.setItem(`minslack_read_notifs_${user.username}`, JSON.stringify(next));
    }
  };

  const markAllNotifsAsRead = () => {
    const allIds = userNotifications.map(n => n.id);
    const combined = Array.from(new Set([...readNotifIds, ...allIds]));
    setReadNotifIds(combined);
    localStorage.setItem(`minslack_read_notifs_${user.username}`, JSON.stringify(combined));
  };

  const handleOpenNotification = (notif: MinslackNotification) => {
    markNotifAsRead(notif.id);
    if (notif.targetTab === 'board') {
      setActiveTab('board');
      if (notif.targetTask) {
        setViewingTask(notif.targetTask);
      }
    } else if (notif.targetTab === 'chat' && notif.targetChannelId) {
      setActiveChannelId(notif.targetChannelId);
      setActiveTab('chat');
      setViewingThreadMsg(null);
    }
  };

  const filteredUserNotifications = useMemo(() => {
    return userNotifications.filter(n => {
      if (notifFilter === 'unread') return !readNotifIds.includes(n.id);
      if (notifFilter === 'tasks') return n.type === 'task_assigned';
      if (notifFilter === 'dms') return n.type === 'dm';
      if (notifFilter === 'mentions') return n.type === 'mention';
      return true;
    });
  }, [userNotifications, notifFilter, readNotifIds]);

  const allFlaggedItems = useMemo(() => {
    const items: Array<{
      id: string;
      type: 'task' | 'message';
      titleOrAuthor: string;
      descriptionOrText: string;
      reason?: string;
      assignee?: string;
      tags?: MinslackTag[];
      createdAt: string;
    }> = [];

    tasks.filter(t => t.flagged).forEach(t => {
      items.push({
        id: t.id,
        type: 'task',
        titleOrAuthor: t.title,
        descriptionOrText: t.description,
        reason: t.flagReason,
        assignee: t.assignee,
        tags: t.tags,
        createdAt: t.createdAt
      });
    });

    messages.filter(m => m.flagged).forEach(m => {
      items.push({
        id: m.id,
        type: 'message',
        titleOrAuthor: `@${m.author}`,
        descriptionOrText: m.text,
        reason: m.flagReason,
        tags: m.tags,
        createdAt: m.createdAt
      });
    });

    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [tasks, messages]);

  const toggleTagInNewTask = (tag: MinslackTag) => {
    if (newTaskTags.includes(tag)) {
      setNewTaskTags(newTaskTags.filter(t => t !== tag));
    } else {
      setNewTaskTags([...newTaskTags, tag]);
    }
  };

  const toggleTagInChat = (tag: MinslackTag) => {
    if (chatTags.includes(tag)) {
      setChatTags(chatTags.filter(t => t !== tag));
    } else {
      setChatTags([...chatTags, tag]);
    }
  };

  const toggleTagInProject = (tag: MinslackTag) => {
    if (projTags.includes(tag)) {
      setProjTags(projTags.filter(t => t !== tag));
    } else {
      setProjTags([...projTags, tag]);
    }
  };

  const getTagColor = (tag: MinslackTag) => {
    switch (tag) {
      case 'ops': return 'bg-slate-100 text-slate-700 border-slate-300';
      case 'hr': return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'stock': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'kitchen': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'finance': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'promo': return 'bg-pink-50 text-pink-700 border-pink-200';
      case 'pos': return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'tech': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const formatDate = (isoStr: string) => {
    try {
      const date = new Date(isoStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoStr;
    }
  };

  // Parse days for Gantt columns (1 to 31)
  const getDayFromDate = (dateStr: string) => {
    try {
      const day = parseInt(dateStr.split('-')[2], 10);
      if (!isNaN(day) && day >= 1 && day <= 31) return day;
    } catch {}
    return 1;
  };

  return (
    <div className="flex h-full bg-slate-50 text-slate-800 overflow-hidden font-sans" id="minslack-root">
      
      {/* 1. AUTHENTIC SLACK-STYLE LEFT SIDEBAR */}
      <div className="w-64 bg-[#3F0E40] text-white flex flex-col shrink-0 h-full select-none" id="slack-sidebar">
        {/* Workspace Name & Status Header */}
        <div className="p-4 border-b border-[#522653] flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold tracking-tight truncate flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-300" />
              MomoMaya Workspace
            </h2>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-[#BCABB6] truncate">
              @{user.username} ({user.role === 'ADMIN' ? 'Admin' : user.role === 'COFOUNDER' ? 'Co-Founder' : user.role === 'STORE_MANAGER' ? 'Manager' : 'Crew'})
            </span>
          </div>
        </div>

        {/* Scrollable menu contents */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4 custom-scrollbar">
          
          {/* Section: Channels */}
          <div className="space-y-1">
            <div className="px-4 py-1 text-[11px] font-black tracking-widest text-[#BCABB6] uppercase flex items-center justify-between group">
              <span>Channels</span>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => setIsCreateChannelModalOpen(true)}
                  className="p-0.5 hover:bg-[#522653] rounded text-[#BCABB6] hover:text-white transition-all cursor-pointer"
                  title="Create Channel"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <span className="text-[9px] font-bold bg-[#522653] px-1.5 py-0.2 rounded text-[#BCABB6]">
                  {visibleChannels.length}
                </span>
              </div>
            </div>
            
            <div className="space-y-0.5 px-2">
              {visibleChannels.map(ch => {
                const isActive = activeTab === 'chat' && activeChannelId === ch.id;
                const unreadMentionsForChannel = userNotifications.filter(n => {
                  return n.type === 'mention' && n.targetChannelId === ch.id && !readNotifIds.includes(n.id);
                }).length;

                return (
                  <button
                    key={ch.id}
                    onClick={() => {
                      setActiveChannelId(ch.id);
                      setActiveTab('chat');
                      setViewingThreadMsg(null);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-md text-xs font-semibold flex items-center justify-between transition-all ${
                      isActive 
                        ? 'bg-[#1164A3] text-white font-bold shadow-sm' 
                        : 'text-[#BCABB6] hover:bg-[#350A36] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Hash className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-[#BCABB6]/60'}`} />
                      <span className="truncate">{ch.name}</span>
                    </div>
                    {unreadMentionsForChannel > 0 && (
                      <span className="bg-amber-400 text-[#3F0E40] text-[9px] font-black h-4 min-w-4 px-1 rounded-full flex items-center justify-center shrink-0">
                        @{unreadMentionsForChannel}
                      </span>
                    )}
                  </button>
                );
              })}
              {visibleChannels.length === 0 && (
                <div className="px-4 py-2 text-[11px] text-[#BCABB6]/50 italic">
                  No channels. Click + to create one.
                </div>
              )}
            </div>
          </div>

          {/* Section: Direct Messages */}
          <div className="space-y-1">
            <div className="px-4 py-1 text-[11px] font-black tracking-widest text-[#BCABB6] uppercase flex items-center justify-between group">
              <span>Direct Messages</span>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => setIsNewDmModalOpen(true)}
                  className="p-0.5 hover:bg-[#522653] rounded text-[#BCABB6] hover:text-white transition-all cursor-pointer"
                  title="New Message"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <span className="text-[9px] font-bold bg-[#522653] px-1.5 py-0.2 rounded text-[#BCABB6]">
                  {allDms.length}
                </span>
              </div>
            </div>

            <div className="space-y-0.5 px-2">
              {allDms.map(dmUser => {
                const dmId = `dm-${[user.username, dmUser].sort().join('-')}`;
                const isActive = activeTab === 'chat' && activeChannelId === dmId;
                
                // Find user info for display
                const userInfo = availableUsers.find(u => u.username === dmUser);
                const isSelf = dmUser === user.username;

                const unreadDmForUser = messages.filter(m => {
                  if (m.channelId !== dmId) return false;
                  if (m.author === user.username) return false;
                  return !readNotifIds.includes(`notif-dm-${m.id}`);
                }).length;
                
                return (
                  <button
                    key={dmUser}
                    onClick={() => {
                      setActiveChannelId(dmId);
                      setActiveTab('chat');
                      setViewingThreadMsg(null);
                      // Mark DM notifications as read
                      messages.filter(m => m.channelId === dmId).forEach(m => markNotifAsRead(`notif-dm-${m.id}`));
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-md text-xs font-semibold flex items-center justify-between transition-all ${
                      isActive 
                        ? 'bg-[#1164A3] text-white font-bold shadow-sm' 
                        : 'text-[#BCABB6] hover:bg-[#350A36] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div className="relative">
                        <div className="w-3.5 h-3.5 rounded bg-amber-200 text-[#3F0E40] text-[9px] font-extrabold flex items-center justify-center uppercase shrink-0">
                          {dmUser.slice(0, 2)}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 border border-[#3F0E40]" />
                      </div>
                      <span className="truncate">@{dmUser} {isSelf && <span className="opacity-60 text-[10px] font-normal">(you)</span>}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {unreadDmForUser > 0 && (
                        <span className="bg-amber-400 text-[#3F0E40] text-[9px] font-black h-4 min-w-4 px-1 rounded-full flex items-center justify-center">
                          {unreadDmForUser}
                        </span>
                      )}
                      {userInfo?.role && (
                        <span className={`text-[8px] px-1 rounded uppercase ${isActive ? 'bg-[#1F74B3] text-white border border-[#1164A3]' : 'bg-[#522653] text-[#BCABB6]'}`}>
                          {userInfo.role === 'ADMIN' ? 'Adm' : userInfo.role === 'COFOUNDER' ? 'Cof' : userInfo.role === 'STORE_MANAGER' ? 'Mgr' : 'Crew'}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
              {allDms.length === 0 && (
                <div className="px-4 py-1.5 text-[11px] text-[#BCABB6]/50 italic">
                  No active chats. Click + to DM anyone.
                </div>
              )}
            </div>
          </div>

          {/* Section: Apps & Coordination */}
          <div className="space-y-1">
            <div className="px-4 py-1 text-[11px] font-black tracking-widest text-[#BCABB6] uppercase">
              <span>Apps & Tools</span>
            </div>

            <div className="space-y-0.5 px-2">
              {/* Notifications Center Tab Button */}
              <button
                onClick={() => {
                  setActiveTab('notifications');
                  setViewingThreadMsg(null);
                }}
                className={`w-full text-left px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-between transition-all ${
                  activeTab === 'notifications'
                    ? 'bg-[#1164A3] text-white font-bold shadow-sm'
                    : 'text-[#BCABB6] hover:bg-[#350A36] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Bell className={`w-3.5 h-3.5 ${unreadNotifCount > 0 ? 'text-amber-300 animate-bounce' : ''}`} />
                  <span>Notifications</span>
                </div>
                {unreadNotifCount > 0 && (
                  <span className="bg-amber-400 text-[#3F0E40] text-[9px] font-black h-4 min-w-4 px-1 rounded-full flex items-center justify-center">
                    {unreadNotifCount}
                  </span>
                )}
              </button>

              {/* Task Board Tab Button */}
              <button
                onClick={() => {
                  setActiveTab('board');
                  setViewingThreadMsg(null);
                }}
                className={`w-full text-left px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-between transition-all ${
                  activeTab === 'board'
                    ? 'bg-[#1164A3] text-white font-bold shadow-sm'
                    : 'text-[#BCABB6] hover:bg-[#350A36] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Layout className="w-3.5 h-3.5" />
                  <span>Tasks Board</span>
                </div>
                {assignedIncompleteTasksCount > 0 && (
                  <span className="bg-sky-500 text-white text-[9px] font-black h-4 min-w-4 px-1 rounded-full flex items-center justify-center">
                    {assignedIncompleteTasksCount}
                  </span>
                )}
              </button>

              {/* Project Plan (Gantt) Tab Button */}
              <button
                onClick={() => {
                  setActiveTab('plan');
                  setViewingThreadMsg(null);
                }}
                className={`w-full text-left px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-between transition-all ${
                  activeTab === 'plan'
                    ? 'bg-[#1164A3] text-white font-bold shadow-sm'
                    : 'text-[#BCABB6] hover:bg-[#350A36] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Project Plan (Gantt)</span>
                </div>
              </button>

              {/* Problems & Flags Tab Button */}
              <button
                onClick={() => {
                  setActiveTab('flags');
                  setViewingThreadMsg(null);
                }}
                className={`w-full text-left px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-between transition-all ${
                  activeTab === 'flags'
                    ? 'bg-[#1164A3] text-white font-bold shadow-sm'
                    : 'text-[#BCABB6] hover:bg-[#350A36] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  <span>Raised Problems</span>
                </div>
                {activeFlagsCount > 0 && (
                  <span className="bg-rose-500 text-white text-[9px] font-black h-4.5 min-w-4.5 px-1 rounded-full flex items-center justify-center animate-pulse">
                    {activeFlagsCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Panel: Raise Problem Action Button */}
        <div className="p-3 border-t border-[#522653] bg-[#350A36] flex flex-col gap-2">
          <button
            onClick={() => setIsRaiseProblemModalOpen(true)}
            className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold tracking-wide uppercase transition-all shadow-md flex items-center justify-center gap-2"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Raise a Problem
          </button>
        </div>
      </div>

      {/* 2. MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-white" id="main-panel">
        
        {/* Dynamic Context Header */}
        <div className="h-14 border-b border-slate-200 px-6 flex items-center justify-between shrink-0 bg-slate-50/50">
          <div>
            {activeTab === 'notifications' && (
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#3F0E40]" />
                <h3 className="text-sm font-extrabold text-slate-900">Notifications Center</h3>
                <span className="text-[11px] text-slate-400 hidden sm:inline ml-2 border-l border-slate-300 pl-2 font-medium">
                  Real-time task assignments, DMs, and @mentions
                </span>
              </div>
            )}
            {activeTab === 'chat' && (() => {
              const isDm = activeChannelId.startsWith('dm-');
              let partnerName = '';
              if (isDm) {
                const parts = activeChannelId.substring(3).split('-');
                if (parts[0] === parts[1]) {
                  partnerName = parts[0];
                } else {
                  partnerName = parts.find(p => p !== user.username) || parts[0];
                }
              }
              const partnerInfo = isDm ? availableUsers.find(u => u.username === partnerName) : null;

              return isDm ? (
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Chat with @{partnerName}
                  </h3>
                  {partnerInfo?.role && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase font-bold tracking-wide">
                      {partnerInfo.role === 'ADMIN' ? 'Admin' : partnerInfo.role === 'COFOUNDER' ? 'Co-Founder' : partnerInfo.role === 'STORE_MANAGER' ? 'Manager' : 'Crew'}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 hidden sm:inline ml-2 border-l border-slate-300 pl-2 font-medium">
                    Private direct messaging
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Hash className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-extrabold text-slate-900">#{activeChannelId}</h3>
                  <span className="text-[11px] text-slate-400 hidden sm:inline ml-2 border-l border-slate-300 pl-2 font-medium">
                    {channels.find(c => c.id === activeChannelId)?.description}
                  </span>
                </div>
              );
            })()}
            {activeTab === 'board' && (
              <div className="flex items-center gap-1.5">
                <Layout className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-extrabold text-slate-900">Tasks Board</h3>
                <span className="text-[11px] text-slate-400 hidden sm:inline ml-2 border-l border-slate-300 pl-2 font-medium">
                  Track ongoing team goals, status, and priorities
                </span>
              </div>
            )}
            {activeTab === 'plan' && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-extrabold text-slate-900">Project Plan (Gantt Chart)</h3>
                <span className="text-[11px] text-slate-400 hidden sm:inline ml-2 border-l border-slate-300 pl-2 font-medium">
                  Visually monitor launch timelines, milestones, and development
                </span>
              </div>
            )}
            {activeTab === 'flags' && (
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                <h3 className="text-sm font-extrabold text-slate-900">Raised Problems & Bottlenecks</h3>
                <span className="text-[11px] text-slate-400 hidden sm:inline ml-2 border-l border-slate-300 pl-2 font-medium">
                  Review active operations blockers requiring immediate resolution
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setActiveTab('notifications');
                setViewingThreadMsg(null);
              }}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'notifications'
                  ? 'bg-[#3F0E40] text-white border-[#3F0E40]'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Bell className={`w-3.5 h-3.5 ${unreadNotifCount > 0 ? 'text-amber-500 animate-bounce' : 'text-slate-500'}`} />
              <span>Notifications</span>
              {unreadNotifCount > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">
                  {unreadNotifCount}
                </span>
              )}
            </button>
            <span className="text-xs font-semibold text-slate-500 bg-slate-200/50 px-2.5 py-1 rounded-md">
              Crew Portal
            </span>
          </div>
        </div>

        {/* Dynamic Render Frame based on activeTab */}
        <div className="flex-1 overflow-hidden relative">
          
          {/* A. VIEW: CHAT ROOM / MESSAGES */}
          {activeTab === 'chat' && (
            <div className="h-full flex overflow-hidden">
              {/* Message scroll & input panel */}
              <div className="flex-1 flex flex-col h-full bg-white relative">
                
                {/* Chat logs */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar bg-slate-50/20">
                  {currentChannelMessages.length === 0 ? (() => {
                    const isDm = activeChannelId.startsWith('dm-');
                    let partnerName = '';
                    if (isDm) {
                      const parts = activeChannelId.substring(3).split('-');
                      if (parts[0] === parts[1]) {
                        partnerName = parts[0];
                      } else {
                        partnerName = parts.find(p => p !== user.username) || parts[0];
                      }
                    }

                    return isDm ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8">
                        <div className="w-16 h-16 rounded-full bg-[#3F0E40] text-amber-200 text-2xl font-extrabold flex items-center justify-center uppercase mb-3 shadow-md border border-[#522653]/20">
                          {partnerName.slice(0, 2)}
                        </div>
                        <h4 className="font-bold text-slate-800 text-sm">This is the start of your direct message history with @{partnerName}</h4>
                        <p className="text-xs text-slate-500 mt-1 max-w-xs">Messages sent here are private and only visible between you and @{partnerName}.</p>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8">
                        <MessageSquare className="w-12 h-12 text-slate-300 mb-2" />
                        <h4 className="font-bold text-slate-700">This is the start of #{activeChannelId}</h4>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm">Discuss topics, post updates, and tag appropriately.</p>
                      </div>
                    );
                  })() : (
                    currentChannelMessages.map(msg => (
                      <div
                        key={msg.id}
                        className={`flex gap-3 text-xs leading-relaxed group items-start p-3 rounded-xl transition-all hover:bg-slate-50 ${
                          msg.flagged ? 'border border-rose-200 bg-rose-50/10' : ''
                        }`}
                      >
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-md bg-[#3F0E40] text-amber-200 font-extrabold flex items-center justify-center uppercase shrink-0 text-xs">
                          {msg.author.slice(0, 2)}
                        </div>

                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-slate-800">@{msg.author}</span>
                            <span className={`text-[8px] font-black uppercase px-1.5 py-0.2 rounded ${
                              msg.authorRole === 'ADMIN' ? 'bg-red-50 text-red-700' :
                              msg.authorRole === 'COFOUNDER' ? 'bg-purple-50 text-purple-700' :
                              msg.authorRole === 'STORE_MANAGER' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {msg.authorRole}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">{formatDate(msg.createdAt)}</span>
                          </div>

                          <div className="text-slate-700 font-medium whitespace-pre-line leading-relaxed">
                            {msg.text}
                          </div>

                          {/* Message tags */}
                          {msg.tags && msg.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {msg.tags.map(t => (
                                <span key={t} className={`px-2 py-0.5 rounded text-[8px] font-bold border ${getTagColor(t)}`}>
                                  #{t}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Problem Block Warning */}
                          {msg.flagged && (
                            <div className="bg-rose-50 border border-rose-100 p-2.5 rounded-lg flex items-start gap-1.5 mt-2 max-w-xl">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                              <div>
                                <p className="text-[9px] font-bold uppercase text-rose-600 tracking-wider">Active Problem Flag</p>
                                <p className="text-xs font-semibold text-slate-700 mt-0.5">{msg.flagReason}</p>
                              </div>
                            </div>
                          )}

                          {/* Replies summary / toggle */}
                          <div className="flex items-center gap-3 mt-2">
                            <button
                              onClick={() => setViewingThreadMsg(msg)}
                              className="text-[10px] font-bold text-slate-500 hover:text-slate-800 uppercase tracking-wider flex items-center gap-1"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                              {msg.replies && msg.replies.length > 0 ? `${msg.replies.length} replies` : 'Reply in Thread'}
                            </button>

                            {!msg.flagged ? (
                              flaggingMsgId === msg.id ? (
                                <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 p-1.5 rounded-lg">
                                  <input
                                    type="text"
                                    value={flaggingMsgReason}
                                    onChange={(e) => setFlaggingMsgReason(e.target.value)}
                                    placeholder="Specify problem/issue..."
                                    className="text-xs bg-white border border-rose-300 px-2 py-1 rounded text-slate-800 w-44 focus:outline-none font-medium"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => {
                                      if (flaggingMsgReason.trim()) {
                                        const next = messages.map(m => m.id === msg.id ? { ...m, flagged: true, flagReason: flaggingMsgReason.trim() } : m);
                                        updateMessagesState(next);
                                        setFlaggingMsgId(null);
                                        setFlaggingMsgReason('');
                                      }
                                    }}
                                    disabled={!flaggingMsgReason.trim()}
                                    className="text-[10px] font-extrabold bg-rose-600 text-white px-2 py-1 rounded hover:bg-rose-700 cursor-pointer"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => {
                                      setFlaggingMsgId(null);
                                      setFlaggingMsgReason('');
                                    }}
                                    className="text-[10px] font-bold bg-white text-slate-600 border border-slate-200 px-2 py-1 rounded hover:bg-slate-100 cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setFlaggingMsgId(msg.id);
                                    setFlaggingMsgReason('');
                                  }}
                                  className="text-[10px] font-bold text-rose-500/60 opacity-0 group-hover:opacity-100 transition-opacity hover:text-rose-600 uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                                >
                                  <Flag className="w-3 h-3" />
                                  Flag as Problem
                                </button>
                              )
                            ) : (
                              <button
                                onClick={() => handleResolveMessageFlag(msg.id)}
                                className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                Resolve Flag
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Chat Send input block */}
                <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 bg-white space-y-2 shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    
                    {/* Actions Panel */}
                    <div className="flex items-center gap-2">
                      {/* Tag Dropdown Trigger */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setIsTagDropdownOpen(!isTagDropdownOpen)}
                          className="px-2.5 py-1 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-md flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                        >
                          <TagIcon className="w-3 h-3 text-slate-400" />
                          Tags ({chatTags.length})
                        </button>

                        {isTagDropdownOpen && (
                          <div className="absolute bottom-10 left-0 bg-white border border-slate-200 rounded-lg shadow-lg p-2 grid grid-cols-2 gap-1 w-52 z-30">
                            {ALL_TAGS.map(t => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => toggleTagInChat(t)}
                                className={`px-2 py-1 rounded text-[9px] font-bold uppercase border text-left flex items-center justify-between ${
                                  chatTags.includes(t) ? 'bg-[#3F0E40] text-white border-[#3F0E40]' : 'bg-transparent text-slate-700 hover:bg-slate-50 border-slate-200'
                                }`}
                              >
                                {t}
                                {chatTags.includes(t) && <Check className="w-3 h-3 text-amber-300" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Flag as problem toggler */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsChatFlagged(!isChatFlagged);
                          if (!isChatFlagged) setChatFlagReason('');
                        }}
                        className={`px-2.5 py-1 border rounded-md flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                          isChatFlagged 
                            ? 'bg-rose-600 text-white border-rose-600' 
                            : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        Flag Problem
                      </button>

                      {/* Tag Chips list */}
                      <div className="flex flex-wrap gap-1">
                        {chatTags.map(t => (
                          <span key={t} className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-slate-100 border border-slate-200 text-slate-700 flex items-center gap-0.5">
                            #{t}
                            <button type="button" onClick={() => toggleTagInChat(t)} className="text-slate-400 hover:text-rose-600 ml-1">×</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Flag reason input */}
                  {isChatFlagged && (
                    <div className="animate-in slide-in-from-bottom-2 duration-150">
                      <input
                        type="text"
                        placeholder="Explain this bottleneck / problem (e.g., Billing POS 2 is frozen)..."
                        value={chatFlagReason}
                        onChange={(e) => setChatFlagReason(e.target.value)}
                        required
                        className="w-full bg-rose-50/50 border border-rose-200 px-3 py-1.5 text-xs rounded-md focus:outline-none text-slate-800 font-medium"
                      />
                    </div>
                  )}

                  {/* Quick @Mention pill bar */}
                  <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 shrink-0">
                      <AtSign className="w-3 h-3 text-slate-400" /> Mention:
                    </span>
                    {availableUsers
                      .filter(u => u.username !== user.username)
                      .map(u => (
                        <button
                          key={u.id || u.username}
                          type="button"
                          onClick={() => {
                            setChatInput(prev => `${prev}${prev.endsWith(' ') || prev === '' ? '' : ' '}@${u.username} `);
                          }}
                          className="px-2 py-0.5 bg-slate-100 hover:bg-amber-100 hover:text-amber-900 border border-slate-200 text-slate-700 rounded text-[10px] font-bold transition-all shrink-0 cursor-pointer"
                        >
                          @{u.username}
                        </button>
                      ))}
                  </div>

                  {/* Input and Send button */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={(() => {
                        const isDm = activeChannelId.startsWith('dm-');
                        if (isDm) {
                          const parts = activeChannelId.substring(3).split('-');
                          const partnerName = parts.find(p => p !== user.username) || parts[0];
                          return `Message @${partnerName}...`;
                        }
                        return `Message #${activeChannelId}...`;
                      })()}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-300 px-4 py-2.5 text-xs rounded-md focus:outline-none focus:border-slate-400 text-slate-800 font-medium"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2.5 bg-[#3F0E40] text-white hover:bg-[#350A36] rounded-md transition-all shrink-0 font-bold text-xs flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5 text-amber-300" />
                      Send
                    </button>
                  </div>
                </form>
              </div>

              {/* Chat Thread Replies panel (collapsible sidebar) */}
              {viewingThreadMsg && (
                <div className="w-80 border-l border-slate-200 bg-white h-full flex flex-col shrink-0 animate-in slide-in-from-right duration-200 z-10">
                  <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                    <div>
                      <span className="text-xs font-extrabold text-slate-800 block">Thread</span>
                      <span className="text-[10px] text-slate-500">by @{viewingThreadMsg.author}</span>
                    </div>
                    <button onClick={() => setViewingThreadMsg(null)} className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-4 border-b border-slate-150 bg-slate-50/20 space-y-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Original Message</span>
                    <p className="text-xs text-slate-700 font-medium leading-relaxed italic">
                      "{viewingThreadMsg.text}"
                    </p>
                  </div>

                  {/* Thread messages list */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-50/10">
                    {!viewingThreadMsg.replies || viewingThreadMsg.replies.length === 0 ? (
                      <div className="text-center py-10 text-xs text-slate-400">
                        No replies yet. Start the thread conversation.
                      </div>
                    ) : (
                      viewingThreadMsg.replies.map(rep => (
                        <div key={rep.id} className="space-y-1 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-xs text-slate-800">@{rep.author}</span>
                            <span className="text-[8px] bg-slate-100 px-1 py-0.2 rounded text-slate-500 font-bold uppercase">{rep.authorRole}</span>
                            <span className="text-[9px] text-slate-400 font-mono ml-auto">{formatDate(rep.createdAt).split(',')[1]}</span>
                          </div>
                          <p className="text-xs font-semibold text-slate-600 leading-relaxed">
                            {rep.text}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Thread reply input */}
                  <form onSubmit={handleSendThreadReply} className="p-3 border-t border-slate-200 bg-white flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Reply in thread..."
                      value={threadInput}
                      onChange={(e) => setThreadInput(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-300 px-3 py-2 text-xs rounded-md focus:outline-none text-slate-800"
                    />
                    <button type="submit" className="px-3 bg-[#3F0E40] text-white hover:bg-[#350A36] rounded-md text-xs font-bold shrink-0">
                      Reply
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* B. VIEW: TASKS BOARD */}
          {activeTab === 'board' && (
            <div className="h-full flex flex-col p-6 overflow-hidden bg-slate-50/50">
              
              {/* Task filters header bar */}
              <div className="bg-white border border-slate-200 p-4 rounded-xl mb-6 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-sm">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  
                  {/* Search box */}
                  <div className="relative max-w-xs w-full">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search tasks..."
                      value={taskSearch}
                      onChange={(e) => setTaskSearch(e.target.value)}
                      className="w-full bg-slate-50 pl-9 pr-3 py-1.5 text-xs rounded-md border border-slate-200 focus:outline-none focus:border-slate-400 text-slate-800"
                    />
                  </div>

                  {/* Tag Filter */}
                  <select
                    value={selectedTagFilter}
                    onChange={(e) => setSelectedTagFilter(e.target.value as any)}
                    className="bg-slate-50 px-3 py-1.5 text-xs font-bold rounded-md border border-slate-200 focus:outline-none text-slate-700"
                  >
                    <option value="all">🏷️ All Tags</option>
                    {ALL_TAGS.map(t => (
                      <option key={t} value={t}>{t.toUpperCase()}</option>
                    ))}
                  </select>

                  {/* Priority Filter */}
                  <select
                    value={selectedPriorityFilter}
                    onChange={(e) => setSelectedPriorityFilter(e.target.value as any)}
                    className="bg-slate-50 px-3 py-1.5 text-xs font-bold rounded-md border border-slate-200 focus:outline-none text-slate-700"
                  >
                    <option value="all">⚡ All Priorities</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>

                  {/* Flag/Problem filter */}
                  <select
                    value={flagFilter}
                    onChange={(e) => setFlagFilter(e.target.value as any)}
                    className="bg-slate-50 px-3 py-1.5 text-xs font-bold rounded-md border border-slate-200 focus:outline-none text-slate-700"
                  >
                    <option value="all">🔍 All Items</option>
                    <option value="flagged">🚨 Blocked / Flagged</option>
                    <option value="normal">✅ Normal Flow</option>
                  </select>
                </div>

                <button
                  onClick={() => setIsNewTaskModalOpen(true)}
                  className="px-4 py-2 bg-[#3F0E40] text-white hover:bg-[#350A36] rounded-md text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  New Task
                </button>
              </div>

              {/* Kanban columns */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 overflow-x-auto pb-4 custom-scrollbar">
                {(['todo', 'in_progress', 'review', 'done'] as TaskStatus[]).map(status => {
                  const statusLabel = 
                    status === 'todo' ? 'To Do' :
                    status === 'in_progress' ? 'In Progress' :
                    status === 'review' ? 'Under Review' : 'Completed';
                  
                  const statusColor = 
                    status === 'todo' ? 'border-t-slate-400 bg-slate-100/40' :
                    status === 'in_progress' ? 'border-t-amber-400 bg-amber-50/20' :
                    status === 'review' ? 'border-t-indigo-400 bg-indigo-50/20' : 'border-t-emerald-400 bg-emerald-50/20';

                  const columnTasks = filteredTasks.filter(t => t.status === status);

                  return (
                    <div key={status} className={`flex flex-col h-full min-w-[250px] border-t-4 rounded-lg p-3 ${statusColor} border border-slate-200/80`}>
                      <div className="flex items-center justify-between mb-3 px-1">
                        <span className="text-xs font-extrabold text-slate-800 tracking-wide uppercase">{statusLabel}</span>
                        <span className="text-[10px] font-bold bg-slate-200 px-2 py-0.5 rounded-full text-slate-600">
                          {columnTasks.length}
                        </span>
                      </div>

                      {/* Column cards container */}
                      <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1 pb-12">
                        {columnTasks.length === 0 ? (
                          <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg bg-white/50">
                            No tasks
                          </div>
                        ) : (
                          columnTasks.map(task => (
                            <div
                              key={task.id}
                              onClick={() => setViewingTask(task)}
                              className={`bg-white border-2 rounded-xl p-3.5 space-y-3 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer relative group ${
                                task.flagged ? 'border-rose-300 hover:border-rose-400 bg-rose-50/10' : 'border-slate-200'
                              }`}
                            >
                              <div className="space-y-1">
                                <div className="flex items-start justify-between gap-1.5">
                                  <h4 className="font-extrabold text-xs text-slate-800 leading-snug line-clamp-2">
                                    {task.title}
                                  </h4>
                                </div>
                                <p className="text-[11px] text-slate-500 line-clamp-2 leading-normal">
                                  {task.description}
                                </p>
                              </div>

                              {/* Comments count / flags indicators */}
                              <div className="flex flex-wrap items-center justify-between pt-1 gap-2 border-t border-slate-100">
                                <div className="flex items-center gap-2">
                                  {task.flagged && (
                                    <span className="text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded flex items-center gap-0.5 animate-pulse">
                                      <AlertTriangle className="w-3 h-3" />
                                      Blocked
                                    </span>
                                  )}
                                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                    task.priority === 'critical' ? 'bg-red-50 text-red-700' :
                                    task.priority === 'high' ? 'bg-orange-50 text-orange-700' :
                                    task.priority === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600'
                                  }`}>
                                    {task.priority}
                                  </span>
                                </div>
                                <span className="text-[10px] font-extrabold bg-sky-50 text-sky-900 border border-sky-200 px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0 shadow-2xs">
                                  👤 @{task.assignee || 'Unassigned'}
                                </span>
                              </div>

                              {/* Tags lists */}
                              {task.tags && task.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {task.tags.map(t => (
                                    <span key={t} className={`px-1.5 py-0.2 rounded text-[7px] font-bold uppercase ${getTagColor(t)}`}>
                                      #{t}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Task Card Controls (quick Status Shifters) */}
                              <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center bg-white shadow-md border border-slate-200 rounded overflow-hidden">
                                {status !== 'todo' && (
                                  <button
                                    title="Move Left"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const nextIdx = (['todo', 'in_progress', 'review', 'done'] as TaskStatus[]).indexOf(status) - 1;
                                      handleUpdateTaskStatus(task.id, (['todo', 'in_progress', 'review', 'done'] as TaskStatus[])[nextIdx]);
                                    }}
                                    className="p-1 hover:bg-slate-50 text-slate-700 font-bold border-r border-slate-200 text-xs"
                                  >
                                    ←
                                  </button>
                                )}
                                {status !== 'done' && (
                                  <button
                                    title="Move Right"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const nextIdx = (['todo', 'in_progress', 'review', 'done'] as TaskStatus[]).indexOf(status) + 1;
                                      handleUpdateTaskStatus(task.id, (['todo', 'in_progress', 'review', 'done'] as TaskStatus[])[nextIdx]);
                                    }}
                                    className="p-1 hover:bg-slate-50 text-slate-700 font-bold text-xs"
                                  >
                                    →
                                  </button>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* C. VIEW: PROJECT PLAN (GANTT TIMELINE) */}
          {activeTab === 'plan' && (
            <div className="h-full flex flex-col p-6 overflow-hidden bg-slate-50/50">
              
              {/* Gantt Plan Controls */}
              <div className="bg-white border border-slate-200 p-4 rounded-xl mb-6 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-sm">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">July 2026 Project Schedule</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Visualize phases, milestone duration, and operational goals</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setSelectedProject(null);
                      setProjName('');
                      setProjOwner('');
                      setProjProgress(50);
                      setProjStart('2026-07-01');
                      setProjEnd('2026-07-15');
                      setProjStatus('on_track');
                      setProjTags([]);
                      setIsNewProjectModalOpen(true);
                    }}
                    className="px-4 py-2 bg-[#3F0E40] text-white hover:bg-[#350A36] rounded-md text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    New Project Bar
                  </button>
                </div>
              </div>

              {/* Gantt Scroll Container */}
              <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                
                {/* Scrollable grid area */}
                <div className="flex-1 overflow-auto custom-scrollbar">
                  
                  {/* Master Gantt Grid table wrapper */}
                  <div className="min-w-[1000px] divide-y divide-slate-100 flex flex-col h-full">
                    
                    {/* Header: Months & Days row */}
                    <div className="flex bg-slate-50/80 sticky top-0 z-20 shrink-0">
                      {/* Left Spacer column (Projects descriptions) */}
                      <div className="w-80 p-3 border-r border-slate-200 font-extrabold text-xs text-slate-500 tracking-wider bg-slate-50 uppercase sticky left-0 z-30">
                        Initiative Details
                      </div>

                      {/* Right timeline grid headers */}
                      <div className="flex-1 grid grid-cols-31 relative">
                        {/* Highlights & day indicators */}
                        {Array.from({ length: 31 }, (_, i) => {
                          const day = i + 1;
                          const isToday = day === 20;
                          return (
                            <div 
                              key={day} 
                              className={`p-2 border-r border-slate-200/60 text-center flex flex-col items-center justify-center min-w-[28px] ${
                                isToday ? 'bg-rose-50 text-rose-600 font-bold' : ''
                              }`}
                            >
                              <span className="text-[9px] text-slate-400 font-bold">Jul</span>
                              <span className="text-[11px] font-extrabold">{day}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Timeline Data rows */}
                    <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
                      {projects.length === 0 ? (
                        <div className="text-center py-20 text-slate-400 text-xs">
                          No projects scheduled. Click "New Project Bar" to build a timeline!
                        </div>
                      ) : (
                        projects.map(proj => {
                          const startDay = getDayFromDate(proj.startDate);
                          const endDay = getDayFromDate(proj.endDate);
                          const duration = Math.max(1, endDay - startDay + 1);

                          const statusColors = 
                            proj.status === 'on_track' ? { bg: 'bg-emerald-500', border: 'border-emerald-600/50', text: 'text-emerald-700', bgLight: 'bg-emerald-50' } :
                            proj.status === 'at_risk' ? { bg: 'bg-amber-400', border: 'border-amber-500/50', text: 'text-amber-700', bgLight: 'bg-amber-50' } :
                            { bg: 'bg-rose-500', border: 'border-rose-600/50', text: 'text-rose-700', bgLight: 'bg-rose-50' };

                          return (
                            <div key={proj.id} className="flex hover:bg-slate-50/50 transition-colors group">
                              
                              {/* Left detail card */}
                              <div className="w-80 p-3.5 border-r border-slate-200 bg-white group-hover:bg-slate-50 sticky left-0 z-10 space-y-1.5 shrink-0 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                                <div className="flex items-start justify-between gap-2">
                                  <span 
                                    onClick={() => handleOpenEditProject(proj)}
                                    className="font-extrabold text-xs text-slate-800 hover:text-[#3F0E40] hover:underline cursor-pointer"
                                  >
                                    {proj.name}
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[10px] text-slate-500 font-semibold">
                                    👤 {proj.owner}
                                  </span>
                                  <span className={`text-[8px] font-black uppercase px-1.5 py-0.2 rounded border ${statusColors.bgLight} ${statusColors.text}`}>
                                    {proj.status.replace('_', ' ')}
                                  </span>
                                </div>

                                {/* Tags list */}
                                {proj.tags && proj.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {proj.tags.map(t => (
                                      <span key={t} className={`px-1.5 py-0.2 rounded text-[7px] font-bold uppercase ${getTagColor(t)}`}>
                                        #{t}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Right Grid visual tracks */}
                              <div className="flex-1 grid grid-cols-31 relative py-4 items-center bg-slate-50/10">
                                
                                {/* Light vertical grid columns lines */}
                                <div className="absolute inset-0 grid grid-cols-31 pointer-events-none">
                                  {Array.from({ length: 31 }, (_, idx) => (
                                    <div key={idx} className={`border-r border-slate-100/70 h-full ${idx + 1 === 20 ? 'bg-rose-500/5' : ''}`} />
                                  ))}
                                </div>

                                {/* Today line */}
                                <div className="absolute top-0 bottom-0 left-[calc((100%/31)*19+1px)] w-0.5 border-l-2 border-dashed border-rose-500 pointer-events-none z-10" />

                                {/* Project Timeline Bar item */}
                                <div
                                  onClick={() => handleOpenEditProject(proj)}
                                  style={{
                                    gridColumnStart: startDay,
                                    gridColumnEnd: `span ${duration}`
                                  }}
                                  className={`h-7 rounded-md border shadow-sm relative overflow-hidden cursor-pointer select-none mx-0.5 hover:scale-[1.01] transition-transform active:scale-95 flex items-center px-2.5 z-10 bg-slate-100 border-slate-300`}
                                >
                                  {/* Progress bar background slider */}
                                  <div 
                                    className={`absolute top-0 bottom-0 left-0 ${statusColors.bg} opacity-30`}
                                    style={{ width: `${proj.progress}%` }}
                                  />

                                  {/* Solid color edge border indicator */}
                                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusColors.bg}`} />

                                  {/* Text inside project bar */}
                                  <div className="w-full flex items-center justify-between text-[10px] font-bold text-slate-700 relative z-10">
                                    <span className="truncate mr-1">{proj.progress}% • {proj.startDate.split('-')[2]} to {proj.endDate.split('-')[2]}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Timeline Legends */}
                <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4 text-xs font-bold text-slate-500">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-emerald-500" /> On Track
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-amber-400" /> At Risk
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-rose-500" /> Delayed
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-600 ml-4">
                      <span className="w-3 border-t-2 border-dashed border-rose-500 inline-block align-middle" /> Today (July 20th)
                    </span>
                  </div>
                  <span>
                    Click any timeline project bar to edit details, adjust progress sliders, or delete.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* D. VIEW: RAISED PROBLEMS / BOTTLENECKS */}
          {activeTab === 'flags' && (
            <div className="h-full overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar bg-slate-50/50">
              
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-950 uppercase tracking-tight flex items-center gap-1.5">
                    <AlertTriangle className="w-5 h-5 text-rose-500" />
                    Raised Operations Problems
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Clear blockers, review system warnings, and maintain store workflow stability
                  </p>
                </div>
              </div>

              {/* Problems Queue lists */}
              <div className="space-y-4">
                {allFlaggedItems.length === 0 ? (
                  <div className="bg-white border border-slate-200 p-12 text-center rounded-xl max-w-2xl mx-auto flex flex-col items-center justify-center shadow-sm">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-3" />
                    <h3 className="text-base font-extrabold text-slate-800">Clear Road ahead!</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">
                      No active bottlenecks flagged. Anyone can flag a chat or task if they encounter inventory shortages, equipment failure, or scheduling overlaps.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {allFlaggedItems.map(item => (
                      <div key={item.id} className="bg-white border-2 border-rose-100 rounded-xl p-5 shadow-sm hover:border-rose-200 transition-all flex flex-col justify-between gap-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-rose-600 text-white flex items-center gap-0.5">
                                <AlertCircle className="w-3 h-3" />
                                {item.type.toUpperCase()} BLOCKED
                              </span>
                              {item.assignee && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-extrabold bg-sky-100 text-sky-900 border border-sky-300">
                                  👤 Assigned: @{item.assignee}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono font-bold">
                              {formatDate(item.createdAt)}
                            </span>
                          </div>

                          <div>
                            <h4 className="font-extrabold text-slate-800 text-sm leading-snug">{item.titleOrAuthor}</h4>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-3 leading-normal">
                              {item.descriptionOrText}
                            </p>
                          </div>

                          {/* Core Problem Box */}
                          <div className="bg-rose-50/50 border border-rose-100 p-3 rounded-lg">
                            <span className="text-[8px] font-bold uppercase text-rose-600 tracking-wider block">Bottleneck Description</span>
                            <p className="text-xs font-semibold text-slate-700 mt-0.5">
                              {item.reason}
                            </p>
                          </div>

                          {/* Associated Tags */}
                          {item.tags && item.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {item.tags.map(t => (
                                <span key={t} className={`px-2 py-0.5 rounded text-[8px] font-bold border ${getTagColor(t)}`}>
                                  #{t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="border-t border-slate-100 pt-3 flex">
                          {item.type === 'task' ? (
                            <button
                              onClick={() => handleToggleTaskFlag(item.id, false)}
                              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase rounded transition-all shadow-sm"
                            >
                              Resolve Problem & Clear Task Flag
                            </button>
                          ) : (
                            <button
                              onClick={() => handleResolveMessageFlag(item.id)}
                              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase rounded transition-all shadow-sm"
                            >
                              Resolve Problem & Clear Chat Flag
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* E. VIEW: NOTIFICATIONS & ACTIVITY CENTER */}
          {activeTab === 'notifications' && (
            <div className="h-full overflow-y-auto p-6 md:p-8 space-y-6 bg-slate-50/50 custom-scrollbar">
              {/* Banner Header */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-[#3F0E40]/10 text-[#3F0E40] rounded-lg">
                      <Bell className="w-5 h-5 text-[#3F0E40]" />
                    </div>
                    <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Notifications Center</h2>
                  </div>
                  <p className="text-xs text-slate-500 max-w-xl">
                    Real-time alerts for tasks assigned to @{user.username}, direct messages, and @mentions across channels.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={markAllNotifsAsRead}
                    disabled={unreadNotifCount === 0}
                    className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                      unreadNotifCount > 0
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <CheckCheck className="w-4 h-4" />
                    Mark All as Read
                  </button>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2 flex items-center gap-1 shrink-0">
                  <Filter className="w-3.5 h-3.5" /> Filter:
                </span>
                {[
                  { id: 'all', label: `All (${userNotifications.length})` },
                  { id: 'unread', label: `Unread (${unreadNotifCount})` },
                  { id: 'tasks', label: `Task Assignments (${userNotifications.filter(n => n.type === 'task_assigned').length})` },
                  { id: 'dms', label: `Direct Messages (${userNotifications.filter(n => n.type === 'dm').length})` },
                  { id: 'mentions', label: `@Mentions (${userNotifications.filter(n => n.type === 'mention').length})` },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setNotifFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      notifFilter === f.id
                        ? 'bg-[#3F0E40] text-white shadow-sm'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Notifications List */}
              <div className="space-y-3">
                {filteredUserNotifications.length === 0 ? (
                  <div className="bg-white border border-slate-200 p-12 text-center rounded-xl max-w-xl mx-auto flex flex-col items-center justify-center shadow-sm">
                    <Bell className="w-12 h-12 text-slate-300 mb-3" />
                    <h3 className="text-base font-extrabold text-slate-800">No Notifications Found</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs">
                      {notifFilter === 'unread' 
                        ? "You've read all your notifications! Great job staying updated."
                        : "When tasks are assigned to you, or colleagues send DMs or @mention you, alerts will appear here."}
                    </p>
                  </div>
                ) : (
                  filteredUserNotifications.map(notif => {
                    const isRead = readNotifIds.includes(notif.id);
                    return (
                      <div
                        key={notif.id}
                        className={`bg-white border rounded-xl p-4 transition-all shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          !isRead ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                            notif.type === 'task_assigned' 
                              ? 'bg-blue-50 text-blue-600 border border-blue-200' 
                              : notif.type === 'dm'
                              ? 'bg-purple-50 text-purple-600 border border-purple-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {notif.type === 'task_assigned' && <Layout className="w-5 h-5" />}
                            {notif.type === 'dm' && <MessageSquare className="w-5 h-5" />}
                            {notif.type === 'mention' && <AtSign className="w-5 h-5" />}
                          </div>

                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {!isRead && (
                                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Unread" />
                              )}
                              <h4 className="font-extrabold text-slate-900 text-sm truncate">{notif.title}</h4>
                              <span className="text-[10px] text-slate-400 font-mono font-medium">
                                {formatDate(notif.createdAt)}
                              </span>
                            </div>

                            <p className="text-xs font-medium text-slate-600 line-clamp-2 leading-relaxed">
                              {notif.description}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                          {!isRead && (
                            <button
                              onClick={() => markNotifAsRead(notif.id)}
                              className="px-2.5 py-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
                            >
                              Mark Read
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenNotification(notif)}
                            className="px-3 py-1.5 bg-[#3F0E40] hover:bg-[#350A36] text-white text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= MODAL DIALOGS ================= */}

      {/* MODAL 1: ADD NEW TASK */}
      {isNewTaskModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-5 shadow-xl relative my-8 animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setIsNewTaskModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Create Board Task</h3>
              <p className="text-xs text-slate-500 mt-0.5">Assign goals or milestones to crew members</p>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block font-bold text-slate-700 uppercase">Task Title</label>
                <input
                  type="text"
                  placeholder="e.g., Clean KDS Screens"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded focus:outline-none focus:border-slate-400 font-medium text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700 uppercase">Description</label>
                <textarea
                  placeholder="Provide brief steps or details..."
                  rows={3}
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded focus:outline-none focus:border-slate-400 font-medium text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700 uppercase">Assignee</label>
                  <select
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded focus:outline-none text-slate-800"
                  >
                    <option value="Unassigned">👤 Unassigned</option>
                    {availableUsers.map(u => (
                      <option key={u.id || u.username} value={u.username}>
                        @{u.username} ({u.role === 'ADMIN' ? 'Admin' : u.role === 'COFOUNDER' ? 'Co-Founder' : u.role === 'STORE_MANAGER' ? 'Manager' : 'Crew'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-slate-700 uppercase">Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded focus:outline-none text-slate-800"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700 uppercase">Associated Tags</label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_TAGS.map(t => {
                    const selected = newTaskTags.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTagInNewTask(t)}
                        className={`px-2.5 py-1 rounded text-[9px] font-bold uppercase border transition-all ${
                          selected 
                            ? 'bg-[#3F0E40] text-white border-[#3F0E40]' 
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewTaskModalOpen(false)}
                  className="flex-1 py-2 border border-slate-300 text-slate-600 font-bold rounded hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#3F0E40] text-white font-bold rounded hover:bg-[#350A36]"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RAISE PROBLEM FLOW */}
      {isRaiseProblemModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-5 shadow-xl relative my-8 animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setIsRaiseProblemModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start gap-2.5">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-lg shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Raise Operations Problem</h3>
                <p className="text-xs text-slate-500 mt-0.5">Report store blockers, broken POS equipment, or urgent issues</p>
              </div>
            </div>

            <form onSubmit={handleRaiseProblem} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block font-bold text-slate-700 uppercase">What is the problem? (Short summary)</label>
                <input
                  type="text"
                  placeholder="e.g., KDS Tablet 3 Screen is unresponsive"
                  value={problemTitle}
                  onChange={(e) => setProblemTitle(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded focus:outline-none focus:border-slate-400 font-medium text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700 uppercase">Brief details / consequences</label>
                <textarea
                  placeholder="Explain exactly why this is a blocker, who needs to look at it, and what is affected..."
                  rows={3}
                  value={problemDesc}
                  onChange={(e) => setProblemDesc(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded focus:outline-none focus:border-slate-400 font-medium text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700 uppercase">Tag category</label>
                  <select
                    value={problemTag}
                    onChange={(e) => setProblemTag(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded focus:outline-none text-slate-800 font-medium"
                  >
                    {ALL_TAGS.map(t => (
                      <option key={t} value={t}>{t.toUpperCase()}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-slate-700 uppercase">Urgency level</label>
                  <select
                    value={problemUrgency}
                    onChange={(e) => setProblemUrgency(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded focus:outline-none text-slate-800 font-medium"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded border border-slate-200">
                <input
                  type="checkbox"
                  id="problem-create-task"
                  checked={createTaskForProblem}
                  onChange={(e) => setCreateTaskForProblem(e.target.checked)}
                  className="w-4 h-4 text-[#3F0E40] border-slate-300 rounded focus:ring-0"
                />
                <label htmlFor="problem-create-task" className="font-bold text-slate-700 select-none cursor-pointer">
                  Auto-create and flag a Task inside the board
                </label>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsRaiseProblemModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-300 text-slate-600 font-bold rounded hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded transition-colors shadow-md"
                >
                  Submit Problem Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: GANTT / PROJECT EDITOR */}
      {isNewProjectModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-5 shadow-xl relative my-8 animate-in zoom-in-95 duration-150">
            <button
              onClick={() => {
                setIsNewProjectModalOpen(false);
                setSelectedProject(null);
              }}
              className="absolute right-4 top-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                {selectedProject ? 'Modify Project Milestone' : 'Add Project to Plan'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Plot start, duration, status, and timeline offsets</p>
            </div>

            <form onSubmit={handleSaveProject} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block font-bold text-slate-700 uppercase">Initiative Name</label>
                <input
                  type="text"
                  placeholder="e.g., Hauz Khas Kitchen Setup"
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded focus:outline-none focus:border-slate-400 font-medium text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700 uppercase">Milestone Owner</label>
                  <select
                    value={projOwner}
                    onChange={(e) => setProjOwner(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded focus:outline-none text-slate-800 font-medium"
                  >
                    <option value="">Select Owner</option>
                    {availableUsers.map(u => (
                      <option key={u.id || u.username} value={u.username}>
                        @{u.username}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-slate-700 uppercase">Status</label>
                  <select
                    value={projStatus}
                    onChange={(e) => setProjStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded focus:outline-none text-slate-800 font-medium"
                  >
                    <option value="on_track">On Track</option>
                    <option value="at_risk">At Risk</option>
                    <option value="delayed">Delayed</option>
                  </select>
                </div>
              </div>

              {/* Progress Slider */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded border border-slate-150">
                <div className="flex items-center justify-between font-bold text-slate-700 uppercase">
                  <span>Progress Ratio</span>
                  <span className="text-slate-900 bg-slate-200 px-1.5 py-0.2 rounded font-mono text-[11px]">{projProgress}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={projProgress}
                  onChange={(e) => setProjProgress(Number(e.target.value))}
                  className="w-full accent-[#3F0E40] cursor-pointer"
                />
              </div>

              {/* July 2026 dates selection */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700 uppercase">Start Day</label>
                  <select
                    value={projStart}
                    onChange={(e) => setProjStart(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded focus:outline-none text-slate-800 font-mono font-bold"
                  >
                    {Array.from({ length: 31 }, (_, i) => {
                      const day = i + 1;
                      const dateStr = `2026-07-${day < 10 ? '0' : ''}${day}`;
                      return (
                        <option key={day} value={dateStr}>July {day}</option>
                      );
                    })}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-slate-700 uppercase">End Day</label>
                  <select
                    value={projEnd}
                    onChange={(e) => setProjEnd(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded focus:outline-none text-slate-800 font-mono font-bold"
                  >
                    {Array.from({ length: 31 }, (_, i) => {
                      const day = i + 1;
                      const dateStr = `2026-07-${day < 10 ? '0' : ''}${day}`;
                      return (
                        <option key={day} value={dateStr}>July {day}</option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Tags Selector */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700 uppercase">Category Tags</label>
                <div className="flex flex-wrap gap-1">
                  {ALL_TAGS.map(t => {
                    const active = projTags.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTagInProject(t)}
                        className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase border transition-all ${
                          active 
                            ? 'bg-[#3F0E40] text-white border-[#3F0E40]' 
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                {selectedProject && (
                  <button
                    type="button"
                    onClick={() => handleDeleteProject(selectedProject.id)}
                    className="py-2.5 px-3 bg-red-100 text-red-600 font-bold rounded hover:bg-red-200 flex items-center gap-1.5 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsNewProjectModalOpen(false);
                    setSelectedProject(null);
                  }}
                  className="flex-1 py-2.5 border border-slate-300 text-slate-600 font-bold rounded hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#3F0E40] text-white font-bold rounded hover:bg-[#350A36]"
                >
                  {selectedProject ? 'Save Changes' : 'Plot Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: TASK DETAILED MODAL */}
      {viewingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl p-6 md:p-8 space-y-5 shadow-2xl relative my-8 animate-in zoom-in-95 duration-150 text-xs">
            
            <button
              onClick={() => setViewingTask(null)}
              className="absolute right-4 top-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Task header info */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black bg-sky-100 text-sky-900 border border-sky-300 px-2.5 py-0.5 rounded flex items-center gap-1 shadow-2xs">
                  👤 Assigned to: @{viewingTask.assignee || 'Unassigned'}
                </span>

                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                  viewingTask.status === 'todo' ? 'bg-slate-50 text-slate-600 border-slate-200' :
                  viewingTask.status === 'in_progress' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  viewingTask.status === 'review' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}>
                  Status: {viewingTask.status.replace('_', ' ')}
                </span>

                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                  viewingTask.priority === 'critical' ? 'bg-red-100 text-red-800' :
                  viewingTask.priority === 'high' ? 'bg-orange-100 text-orange-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  Priority: {viewingTask.priority}
                </span>

                <span className="text-[10px] text-slate-400 font-mono">
                  Created {formatDate(viewingTask.createdAt)}
                </span>
              </div>

              <h3 className="text-base font-extrabold text-slate-900">{viewingTask.title}</h3>
            </div>

            {/* Description */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-150 space-y-1.5">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Task Description</span>
              <p className="text-slate-700 font-semibold leading-relaxed whitespace-pre-line">
                {viewingTask.description}
              </p>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/50 p-3 rounded-lg border border-slate-150">
              <div>
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Assignee</label>
                <select
                  value={viewingTask.assignee || 'Unassigned'}
                  onChange={(e) => handleUpdateTaskAssignee(viewingTask.id, e.target.value)}
                  className="bg-white border border-slate-300 px-2.5 py-1.5 rounded focus:outline-none text-slate-700 font-bold w-full text-xs"
                >
                  <option value="Unassigned">Unassigned</option>
                  {availableUsers.map(u => (
                    <option key={u.id || u.username} value={u.username}>@{u.username}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Move Status</label>
                <select
                  value={viewingTask.status}
                  onChange={(e) => handleUpdateTaskStatus(viewingTask.id, e.target.value as TaskStatus)}
                  className="bg-white border border-slate-300 px-2.5 py-1.5 rounded focus:outline-none text-slate-700 font-bold w-full text-xs"
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Under Review</option>
                  <option value="done">Completed</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Problem flagging</label>
                <div className="flex flex-col gap-1.5">
                  {!viewingTask.flagged ? (
                    flaggingTaskId === viewingTask.id ? (
                      <div className="bg-rose-50 border border-rose-300 p-3 rounded-lg space-y-2 col-span-full shadow-xs">
                        <label className="block text-xs font-bold text-rose-800">
                          Operational Bottleneck / Issue Reason:
                        </label>
                        <input
                          type="text"
                          value={flaggingTaskReason}
                          onChange={(e) => setFlaggingTaskReason(e.target.value)}
                          placeholder="e.g. Out of stock, System down, Awaiting approval..."
                          className="w-full bg-white border border-rose-300 text-xs text-slate-800 px-3 py-1.5 rounded focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                          autoFocus
                        />
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (flaggingTaskReason.trim()) {
                                handleToggleTaskFlag(viewingTask.id, true, flaggingTaskReason.trim());
                                setFlaggingTaskId(null);
                                setFlaggingTaskReason('');
                              }
                            }}
                            disabled={!flaggingTaskReason.trim()}
                            className={`px-3 py-1 rounded text-xs font-bold text-white transition-all cursor-pointer ${
                              flaggingTaskReason.trim() ? 'bg-rose-600 hover:bg-rose-700 shadow-sm' : 'bg-slate-300 cursor-not-allowed'
                            }`}
                          >
                            Confirm Flag Blocked
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFlaggingTaskId(null);
                              setFlaggingTaskReason('');
                            }}
                            className="px-3 py-1 rounded text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setFlaggingTaskId(viewingTask.id);
                          setFlaggingTaskReason('');
                        }}
                        title="Mark task as blocked due to operational issue"
                        className="w-full py-1.5 bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 font-bold rounded transition-all text-xs cursor-pointer flex items-center justify-center gap-1"
                      >
                        ⚠️ Flag Blocked
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleTaskFlag(viewingTask.id, false)}
                      title="Clear bottleneck flag"
                      className="w-full py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 font-bold rounded transition-all text-xs cursor-pointer flex items-center justify-center gap-1"
                    >
                      ✅ Clear Flag
                    </button>
                  )}
                </div>
                <p className="text-[9px] text-slate-400 font-medium mt-1 leading-tight">
                  {viewingTask.flagged
                    ? "Currently flagged as blocked. Click 'Clear Flag' once issue is resolved."
                    : "Use 'Flag Blocked' to report a bottleneck stopping task progress."}
                </p>
              </div>
            </div>

            {/* Flag warning */}
            {viewingTask.flagged && (
              <div className="bg-rose-50 border border-rose-200 p-4 rounded-lg space-y-1">
                <div className="flex items-center gap-1 text-rose-600 font-bold">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="uppercase text-[9px] tracking-wide">Blocked Reason</span>
                </div>
                <p className="text-slate-700 font-semibold leading-relaxed italic">
                  "{viewingTask.flagReason}"
                </p>
                <p className="text-[10px] text-slate-500 font-semibold mt-1">
                  Flagged by @{viewingTask.flaggedBy || 'Staff'}
                </p>
              </div>
            )}

            {/* Comments Stream */}
            <div className="space-y-3 pt-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Comments & Discussion</span>
              
              <div className="max-h-[160px] overflow-y-auto space-y-2 custom-scrollbar pr-1">
                {!viewingTask.comments || viewingTask.comments.length === 0 ? (
                  <p className="text-slate-400 italic text-center py-4">No comments posted yet.</p>
                ) : (
                  viewingTask.comments.map(c => (
                    <div key={c.id} className="bg-slate-50 p-2.5 rounded-lg border border-slate-150 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-slate-800">@{c.author}</span>
                        <span className="text-[8px] bg-slate-100 text-slate-500 px-1 py-0.2 rounded font-bold uppercase">{c.authorRole || 'Crew'}</span>
                        <span className="text-[9px] text-slate-400 font-mono ml-auto">{formatDate(c.createdAt)}</span>
                      </div>
                      <p className="text-slate-600 font-semibold leading-relaxed">
                        {c.text}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Add comment form */}
              <form onSubmit={handleAddComment} className="flex gap-1.5 pt-1">
                <input
                  type="text"
                  placeholder="Ask a question or add status update..."
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  required
                  className="flex-1 bg-slate-50 border border-slate-300 px-3 py-2 rounded focus:outline-none text-slate-800"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#3F0E40] text-white hover:bg-[#350A36] rounded font-bold transition-all shrink-0"
                >
                  Comment
                </button>
              </form>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={() => setViewingTask(null)}
                className="w-full py-2 border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-bold uppercase rounded transition-all"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CREATE CHANNEL */}
      {isCreateChannelModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-5 shadow-xl relative my-8 animate-in zoom-in-95 duration-150">
            <button
              onClick={() => {
                setIsCreateChannelModalOpen(false);
                setChannelError('');
              }}
              className="absolute right-4 top-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start gap-2.5">
              <div className="p-2 bg-[#3F0E40]/10 text-[#3F0E40] rounded-lg shrink-0 mt-0.5">
                <Hash className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Create a channel</h3>
                <p className="text-xs text-slate-500 mt-0.5">Channels are where your team communicates. They are best when organized around a topic.</p>
              </div>
            </div>

            <form onSubmit={handleCreateChannel} className="space-y-4 text-xs">
              {channelError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{channelError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="block font-bold text-slate-700 uppercase">Name</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 font-bold text-sm">#</span>
                  <input
                    type="text"
                    placeholder="e.g. plan-launch"
                    value={newChannelName}
                    onChange={(e) => {
                      setNewChannelName(e.target.value);
                      setChannelError('');
                    }}
                    required
                    className="w-full bg-slate-50 border border-slate-200 pl-7 pr-3 py-2 rounded focus:outline-none focus:border-slate-400 font-medium text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700 uppercase">Description (optional)</label>
                <input
                  type="text"
                  placeholder="What is this channel about?"
                  value={newChannelDesc}
                  onChange={(e) => setNewChannelDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded focus:outline-none focus:border-slate-400 font-medium text-slate-800"
                />
              </div>

              <div className="space-y-2">
                <label className="block font-bold text-slate-700 uppercase">Add Members</label>
                <p className="text-[11px] text-slate-500">Only the selected members will be able to view and message in this channel.</p>
                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded p-2.5 bg-slate-50/50 space-y-1.5 custom-scrollbar">
                  {availableUsers
                    .filter(u => u.username !== user.username)
                    .map(u => {
                      const isChecked = newChannelMembers.includes(u.username);
                      return (
                        <label key={u.id || u.username} className="flex items-center gap-2 cursor-pointer py-1 px-1.5 hover:bg-slate-100 rounded transition-all">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setNewChannelMembers(newChannelMembers.filter(m => m !== u.username));
                              } else {
                                setNewChannelMembers([...newChannelMembers, u.username]);
                              }
                            }}
                            className="rounded border-slate-300 text-[#3F0E40] focus:ring-[#3F0E40] w-3.5 h-3.5 cursor-pointer"
                          />
                          <span className="font-semibold text-slate-800">@{u.username}</span>
                          <span className="text-[9px] bg-slate-200/60 px-1 py-0.2 rounded text-slate-500 uppercase ml-auto font-bold tracking-wide">
                            {u.role === 'ADMIN' ? 'Admin' : u.role === 'COFOUNDER' ? 'Co-Founder' : u.role === 'STORE_MANAGER' ? 'Manager' : 'Crew'}
                          </span>
                        </label>
                      );
                    })}
                  {availableUsers.filter(u => u.username !== user.username).length === 0 && (
                    <p className="text-slate-400 italic text-center py-2">No other users found in workspace.</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateChannelModalOpen(false);
                    setChannelError('');
                  }}
                  className="flex-1 py-2 border border-slate-300 text-slate-600 hover:bg-slate-50 font-bold uppercase rounded transition-all cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#3F0E40] text-white hover:bg-[#350A36] font-bold uppercase rounded transition-all shadow-md cursor-pointer text-center"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: START DIRECT MESSAGE */}
      {isNewDmModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl relative my-8 animate-in zoom-in-95 duration-150">
            <button
              onClick={() => {
                setIsNewDmModalOpen(false);
                setNewDmSearch('');
              }}
              className="absolute right-4 top-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start gap-2.5">
              <div className="p-2 bg-[#3F0E40]/10 text-[#3F0E40] rounded-lg shrink-0 mt-0.5">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Direct Message</h3>
                <p className="text-xs text-slate-500 mt-0.5">Select a colleague to start a personal direct message conversation.</p>
              </div>
            </div>

            <div className="space-y-3">
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={newDmSearch}
                  onChange={(e) => setNewDmSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 pl-9 pr-3 py-2 text-xs rounded focus:outline-none focus:border-slate-400 font-medium text-slate-800"
                />
              </div>

              {/* User list */}
              <div className="max-h-60 overflow-y-auto border border-slate-150 rounded bg-slate-50/20 divide-y divide-slate-100 custom-scrollbar">
                {availableUsers
                  .filter(u => {
                    const matchesSearch = u.username.toLowerCase().includes(newDmSearch.toLowerCase());
                    return matchesSearch && u.username !== user.username;
                  })
                  .map(u => {
                    return (
                      <button
                        key={u.id || u.username}
                        onClick={() => handleStartDm(u.username)}
                        className="w-full text-left p-3 hover:bg-slate-50 transition-all flex items-center justify-between cursor-pointer text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded bg-[#3F0E40] text-amber-200 font-extrabold flex items-center justify-center uppercase shrink-0 text-[11px]">
                            {u.username.slice(0, 2)}
                          </div>
                          <div className="truncate">
                            <span className="font-bold text-slate-800 text-xs block truncate">
                              @{u.username}
                            </span>
                            <span className="text-[10px] text-slate-500 capitalize block truncate">
                              {u.role === 'ADMIN' ? 'Admin' : u.role === 'COFOUNDER' ? 'Co-Founder' : u.role === 'STORE_MANAGER' ? 'Manager' : 'Crew'}
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-[#3F0E40] hover:underline bg-[#3F0E40]/5 px-2.5 py-1 rounded transition-all shrink-0">
                          Message
                        </span>
                      </button>
                    );
                  })}
                {availableUsers.filter(u => u.username.toLowerCase().includes(newDmSearch.toLowerCase()) && u.username !== user.username).length === 0 && (
                  <p className="text-slate-400 italic text-center py-6 text-xs">No users found.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
