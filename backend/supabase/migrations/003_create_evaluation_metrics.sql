-- Create evaluation_metrics table
create table if not exists public.evaluation_metrics (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  summary_text text not null,
  original_text_length integer,
  url text,
  rouge_1 float,
  rouge_2 float,
  rouge_l float,
  bleu float,
  metadata jsonb default '{}'::jsonb
);

-- Internal users (authenticated) can insert
create policy "Enable insert for authenticated users only"
on public.evaluation_metrics
for insert
to authenticated
with check (true);

-- Internal users (authenticated) can view
create policy "Enable read for authenticated users only"
on public.evaluation_metrics
for select
to authenticated
using (true);

-- Enable RLS
alter table public.evaluation_metrics enable row level security;
