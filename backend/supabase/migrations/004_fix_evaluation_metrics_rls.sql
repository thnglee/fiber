-- Fix RLS policies for evaluation_metrics to allow service role access
-- The service role should bypass RLS, but we're adding explicit policies as a safeguard

-- Drop existing policies
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.evaluation_metrics;
DROP POLICY IF EXISTS "Enable read for authenticated users only" ON public.evaluation_metrics;

-- Create policy to allow service role to insert
-- Service role context has auth.uid() IS NULL
CREATE POLICY "Service role and authenticated users can insert"
    ON public.evaluation_metrics
    FOR INSERT
    WITH CHECK (
        -- Allow if there's no authenticated user (service role context)
        auth.uid() IS NULL
        -- OR allow if user is authenticated
        OR auth.role() = 'authenticated'
    );

-- Create policy to allow service role to read
CREATE POLICY "Service role and authenticated users can read"
    ON public.evaluation_metrics
    FOR SELECT
    USING (
        -- Allow if there's no authenticated user (service role context)
        auth.uid() IS NULL
        -- OR allow if user is authenticated
        OR auth.role() = 'authenticated'
    );

-- Ensure RLS is enabled
ALTER TABLE public.evaluation_metrics ENABLE ROW LEVEL SECURITY;
