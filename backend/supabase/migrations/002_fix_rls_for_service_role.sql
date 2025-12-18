-- Fix RLS policies to allow service role access
-- The service role should bypass RLS automatically, but we're adding explicit policies as a safeguard

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Service role can read all actions" ON public.user_actions;

-- Create policy to allow service role to read all actions
-- Note: This uses a workaround since we can't directly check for service role
-- Instead, we allow reads when there's no authenticated user (which happens with service role)
-- OR when the user is an admin
CREATE POLICY "Service role and admins can read all actions"
    ON public.user_actions
    FOR SELECT
    USING (
        -- Allow if user is an admin
        EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE admin_users.id = auth.uid()
        )
        -- OR allow if there's no authenticated user (service role context)
        OR auth.uid() IS NULL
    );

-- Update the existing admin policy to be more permissive
DROP POLICY IF EXISTS "Admin users can read all actions" ON public.user_actions;
