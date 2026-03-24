import { NextResponse } from 'next/server';
import { getEvaluationMetrics, MetricFilters } from '@/services/evaluation.service';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view');

  // ── Routing view ──────────────────────────────────────────────────
  if (view === 'routing') {
    try {
      const supabase = getSupabaseAdmin();
      const limit = parseInt(searchParams.get('limit') || '50');
      const offset = parseInt(searchParams.get('offset') || '0');
      const routingMode = searchParams.get('routing_mode') || undefined;

      // Build query for paginated routing decisions
      let query = supabase
        .from('routing_decisions')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (routingMode) {
        query = query.eq('routing_mode', routingMode);
      }

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        return NextResponse.json(
          { error: `Failed to fetch routing decisions: ${error.message}` },
          { status: 500 }
        );
      }

      const rows = data || [];

      // Fetch model_comparison_results for the returned routing IDs
      let comparisons: unknown[] = [];
      const routingIds = rows.map((d: { id: string }) => d.id);

      if (routingIds.length > 0) {
        const { data: compData } = await supabase
          .from('model_comparison_results')
          .select('*')
          .in('routing_id', routingIds)
          .order('created_at', { ascending: false });

        comparisons = compData || [];
      }

      // Fetch ALL routing decisions for summary stats (paginate to avoid 1000-row cap)
      const PAGE_SIZE = 1000;
      let allRows: Array<{ selected_model: string; fallback_used: boolean; routing_mode: string }> = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: page } = await supabase
          .from('routing_decisions')
          .select('selected_model, fallback_used, routing_mode')
          .range(from, from + PAGE_SIZE - 1);

        if (page && page.length > 0) {
          allRows = allRows.concat(page);
          from += PAGE_SIZE;
          hasMore = page.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      const totalDecisions = allRows.length;

      // Calculate fallback rate
      const fallbackCount = allRows.filter(
        (r: { fallback_used: boolean }) => r.fallback_used
      ).length;
      const fallbackRate =
        totalDecisions > 0
          ? Math.round((fallbackCount / totalDecisions) * 100 * 10) / 10
          : 0;

      // Calculate model distribution
      const modelCounts: Record<string, number> = {};
      for (const row of allRows) {
        const model = (row as { selected_model: string }).selected_model;
        modelCounts[model] = (modelCounts[model] || 0) + 1;
      }

      const modelDistribution = Object.entries(modelCounts)
        .map(([model, cnt]) => ({
          model,
          count: cnt,
          percentage:
            totalDecisions > 0
              ? Math.round((cnt / totalDecisions) * 100 * 10) / 10
              : 0,
        }))
        .sort((a, b) => b.count - a.count);

      // Most used model
      const mostUsedModel =
        modelDistribution.length > 0 ? modelDistribution[0] : null;

      // Avg BERTScore per model (from model_comparison_results)
      let avgBertScores: Array<{
        model: string;
        avg_bert_score: number;
        count: number;
      }> = [];

      // Paginate to avoid 1000-row cap
      let allComparisons: Array<{ model_name: string; bert_score: number }> = [];
      let compFrom = 0;
      let compHasMore = true;

      while (compHasMore) {
        const { data: compPage } = await supabase
          .from('model_comparison_results')
          .select('model_name, bert_score')
          .not('bert_score', 'is', null)
          .range(compFrom, compFrom + PAGE_SIZE - 1);

        if (compPage && compPage.length > 0) {
          allComparisons = allComparisons.concat(compPage);
          compFrom += PAGE_SIZE;
          compHasMore = compPage.length === PAGE_SIZE;
        } else {
          compHasMore = false;
        }
      }

      if (allComparisons.length > 0) {
        const bertByModel: Record<string, { sum: number; count: number }> = {};
        for (const c of allComparisons) {
          if (!bertByModel[c.model_name]) {
            bertByModel[c.model_name] = { sum: 0, count: 0 };
          }
          bertByModel[c.model_name].sum += Number(c.bert_score);
          bertByModel[c.model_name].count++;
        }

        avgBertScores = Object.entries(bertByModel)
          .map(([model, { sum, count: cnt }]) => ({
            model,
            avg_bert_score: Math.round((sum / cnt) * 10000) / 10000,
            count: cnt,
          }))
          .sort((a, b) => b.avg_bert_score - a.avg_bert_score);
      }

      return NextResponse.json(
        {
          data: rows,
          comparisons,
          count: count || 0,
          stats: {
            total_decisions: totalDecisions,
            fallback_rate: fallbackRate,
            model_distribution: modelDistribution,
            most_used_model: mostUsedModel,
            avg_bert_scores: avgBertScores,
          },
        },
        {
          headers: {
            'Cache-Control':
              'public, s-maxage=30, stale-while-revalidate=60',
          },
        }
      );
    } catch (error) {
      console.error('[Metrics Routing] Error:', error);
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Failed to fetch routing metrics',
        },
        { status: 500 }
      );
    }
  }

  // ── Default evaluation metrics view ───────────────────────────────
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  const filters: MetricFilters = {
    mode: searchParams.get('mode') || undefined,
    model: searchParams.get('model') || undefined,
    url: searchParams.get('url') || undefined,
    startDate: searchParams.get('start_date') || undefined,
    endDate: searchParams.get('end_date') || undefined,
  };

  const result = await getEvaluationMetrics(limit, offset, filters);

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  });
}
