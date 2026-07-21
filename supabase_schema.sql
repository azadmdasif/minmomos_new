-- ==========================================
-- SUPABASE POSTGRESQL SCHEMA FOR MINSLACK
-- ==========================================
-- This schema provisions all necessary tables, constraints, indexes,
-- and Row-Level Security (RLS) policies to make the MinSlack workspace fully
-- compatible with Supabase.

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. CHANNELS TABLE
-- Supports dynamic channel creation. If 'members' is NULL or empty, it is public.
-- Otherwise, access is restricted to the usernames present in the array.
CREATE TABLE IF NOT EXISTS minslack_channels (
    id TEXT PRIMARY KEY, -- Slug name e.g., 'general', 'kitchen-ops'
    name TEXT NOT NULL,
    description TEXT,
    members TEXT[] DEFAULT '{}', -- Array of allowed usernames. Empty means public.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by TEXT NOT NULL
);

-- Index for searching channels
CREATE INDEX IF NOT EXISTS idx_minslack_channels_members ON minslack_channels USING gin(members);

-- 2. MESSAGES TABLE
-- Handles channel chats, private direct messages (DMs), tagging, and flagging.
-- 'parent_id' enables Slack-style threaded discussion replies.
CREATE TABLE IF NOT EXISTS minslack_messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL, -- e.g., 'general' or 'dm-alice-bob' (alphabetically sorted usernames)
    author TEXT NOT NULL,
    author_role TEXT NOT NULL,
    text TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}', -- Array of tags, e.g., ARRAY['ops', 'kitchen']
    flagged BOOLEAN DEFAULT FALSE,
    flag_reason TEXT,
    flagged_by TEXT,
    parent_id TEXT REFERENCES minslack_messages(id) ON DELETE CASCADE, -- For nested threading
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_minslack_messages_channel_id ON minslack_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_minslack_messages_parent_id ON minslack_messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_minslack_messages_tags ON minslack_messages USING gin(tags);

-- 3. TASKS TABLE
-- Tracks board-style tasks with assignee, priority, status, tagging, and flagging.
CREATE TABLE IF NOT EXISTS minslack_tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'done')) DEFAULT 'todo',
    tags TEXT[] DEFAULT '{}',
    assignee TEXT,
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
    flagged BOOLEAN DEFAULT FALSE,
    flag_reason TEXT,
    flagged_by TEXT,
    due_date TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for status, priority, and tags
CREATE INDEX IF NOT EXISTS idx_minslack_tasks_status ON minslack_tasks(status);
CREATE INDEX IF NOT EXISTS idx_minslack_tasks_assignee ON minslack_tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_minslack_tasks_tags ON minslack_tasks USING gin(tags);

-- 4. TASK COMMENTS TABLE
-- Comments & activity logs linked to a task.
CREATE TABLE IF NOT EXISTS minslack_task_comments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES minslack_tasks(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    author_role TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_minslack_task_comments_task_id ON minslack_task_comments(task_id);

-- 5. PROJECTS TABLE
-- Stores timeline entries for Gantt project mapping.
CREATE TABLE IF NOT EXISTS minslack_projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    tags TEXT[] DEFAULT '{}',
    status TEXT DEFAULT 'planned',
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    owner TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index on dates and owner
CREATE INDEX IF NOT EXISTS idx_minslack_projects_dates ON minslack_projects(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_minslack_projects_owner ON minslack_projects(owner);


-- ==========================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable Row-Level Security on all tables
ALTER TABLE minslack_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE minslack_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE minslack_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE minslack_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE minslack_projects ENABLE ROW LEVEL SECURITY;

-- 1. CHANNELS POLICIES
-- Allow select if channel is public (members is empty) or user is in members list.
CREATE POLICY select_channels ON minslack_channels 
    FOR SELECT 
    USING (
        cardinality(members) = 0 
        OR members IS NULL 
        OR auth.jwt() ->> 'preferred_username' = ANY(members)
        OR (auth.jwt() -> 'user_metadata' ->> 'username') = ANY(members)
    );

CREATE POLICY insert_channels ON minslack_channels 
    FOR INSERT 
    WITH CHECK (true);

-- 2. MESSAGES POLICIES
-- Messages in public channels or channels where the user is a member, or direct messages they are part of.
CREATE POLICY select_messages ON minslack_messages 
    FOR SELECT 
    USING (
        -- Standard channel select checks
        NOT (channel_id LIKE 'dm-%') 
        AND (
            EXISTS (
                SELECT 1 FROM minslack_channels c 
                WHERE c.id = channel_id 
                AND (cardinality(c.members) = 0 OR c.members IS NULL OR (auth.jwt() -> 'user_metadata' ->> 'username') = ANY(c.members))
            )
            OR NOT EXISTS (SELECT 1 FROM minslack_channels c WHERE c.id = channel_id) -- Fallback for global general channels
        )
        OR 
        -- Private direct message (DM) select checks
        (
            channel_id LIKE 'dm-%' 
            AND (
                -- True if user is either sender or receiver parsed from the 'dm-username1-username2' slug
                position((auth.jwt() -> 'user_metadata' ->> 'username') in channel_id) > 0
                OR position((auth.jwt() ->> 'preferred_username') in channel_id) > 0
            )
        )
    );

CREATE POLICY insert_messages ON minslack_messages 
    FOR INSERT 
    WITH CHECK (true);

-- 3. TASKS, COMMENTS, AND PROJECTS POLICIES
-- In an open workspace, all employees can read, write, and assign tasks or timelines.
CREATE POLICY open_select_tasks ON minslack_tasks FOR SELECT USING (true);
CREATE POLICY open_all_tasks ON minslack_tasks FOR ALL USING (true);

CREATE POLICY open_select_comments ON minslack_task_comments FOR SELECT USING (true);
CREATE POLICY open_all_comments ON minslack_task_comments FOR ALL USING (true);

CREATE POLICY open_select_projects ON minslack_projects FOR SELECT USING (true);
CREATE POLICY open_all_projects ON minslack_projects FOR ALL USING (true);
