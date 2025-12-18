-- Create user_actions table to track all user interactions
CREATE TABLE IF NOT EXISTS public.user_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action_type TEXT NOT NULL CHECK (action_type IN ('summarize', 'fact-check')),
    input_type TEXT NOT NULL CHECK (input_type IN ('text', 'url')),
    input_content TEXT NOT NULL,
    output_content JSONB NOT NULL,
    category TEXT,
    token_usage JSONB NOT NULL,
    user_ip TEXT NOT NULL,
    user_location JSONB,
    website TEXT NOT NULL,
    user_agent TEXT NOT NULL,
    processing_time_ms INTEGER NOT NULL
);

-- Create admin_users table to track admin accounts
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_actions_created_at ON public.user_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_actions_action_type ON public.user_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_user_actions_website ON public.user_actions(website);

-- Enable Row Level Security
ALTER TABLE public.user_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only authenticated admin users can read user_actions
CREATE POLICY "Admin users can read all actions"
    ON public.user_actions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE admin_users.id = auth.uid()
        )
    );

-- RLS Policy: Only authenticated admin users can read admin_users
CREATE POLICY "Admin users can read admin list"
    ON public.admin_users
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE admin_users.id = auth.uid()
        )
    );

-- RLS Policy: Service role can insert into user_actions (for backend tracking)
CREATE POLICY "Service role can insert actions"
    ON public.user_actions
    FOR INSERT
    WITH CHECK (true);

-- RLS Policy: Admin users can update their own last_login
CREATE POLICY "Admin users can update their own record"
    ON public.admin_users
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Enable Realtime for user_actions table
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_actions;

-- Create a function to update last_login timestamp
CREATE OR REPLACE FUNCTION public.update_admin_last_login()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.admin_users
    SET last_login = NOW()
    WHERE id = auth.uid();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: To create your first admin user, run this SQL in Supabase SQL Editor:
-- INSERT INTO public.admin_users (id, email)
-- VALUES (
--     (SELECT id FROM auth.users WHERE email = 'your-email@example.com'),
--     'your-email@example.com'
-- );
