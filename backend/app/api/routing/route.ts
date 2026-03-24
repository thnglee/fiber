import { NextRequest, NextResponse } from "next/server"
import { getCorsHeaders } from "@/middleware/cors"
import { getSupabaseAdmin } from "@/lib/supabase"

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(),
  })
}

/**
 * GET /api/routing/stats
 *
 * Returns routing analytics:
 * - Distribution of models selected (last 7/30 days)
 * - Average BERTScore per model
 * - Fallback rate per model
 * - Complexity breakdown (short/medium/long %)
 *
 * Query params:
 *   ?days=7  (default 7, also supports 30)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '7', 10)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // Fetch routing decisions within the time window (paginate to avoid 1000-row cap)
    const PAGE_SIZE = 1000
    let rows: Array<{ id: string; selected_model: string; fallback_used: boolean; complexity: string; created_at: string; [key: string]: unknown }> = []
    let from = 0
    let hasMore = true

    while (hasMore) {
      const { data: page, error: pageError } = await supabase
        .from('routing_decisions')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)

      if (pageError) {
        return NextResponse.json(
          { error: `Failed to fetch routing decisions: ${pageError.message}` },
          { status: 500, headers: getCorsHeaders() }
        )
      }

      if (page && page.length > 0) {
        rows = rows.concat(page)
        from += PAGE_SIZE
        hasMore = page.length === PAGE_SIZE
      } else {
        hasMore = false
      }
    }
    const total = rows.length

    // Model distribution
    const modelCounts: Record<string, number> = {}
    const complexityCounts: Record<string, number> = { short: 0, medium: 0, long: 0 }
    const fallbackCounts: Record<string, { total: number; fallbacks: number }> = {}

    for (const row of rows) {
      // Model distribution
      modelCounts[row.selected_model] = (modelCounts[row.selected_model] || 0) + 1

      // Complexity breakdown
      if (row.complexity in complexityCounts) {
        complexityCounts[row.complexity]++
      }

      // Fallback rate per model
      if (!fallbackCounts[row.selected_model]) {
        fallbackCounts[row.selected_model] = { total: 0, fallbacks: 0 }
      }
      fallbackCounts[row.selected_model].total++
      if (row.fallback_used) {
        fallbackCounts[row.selected_model].fallbacks++
      }
    }

    // Model distribution as percentages
    const modelDistribution = Object.entries(modelCounts).map(([model, count]) => ({
      model,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100 * 10) / 10 : 0,
    }))

    // Complexity breakdown as percentages
    const complexityBreakdown = Object.entries(complexityCounts).map(([complexity, count]) => ({
      complexity,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100 * 10) / 10 : 0,
    }))

    // Fallback rate per model
    const fallbackRates = Object.entries(fallbackCounts).map(([model, { total: t, fallbacks }]) => ({
      model,
      total: t,
      fallbacks,
      rate: t > 0 ? Math.round((fallbacks / t) * 100 * 10) / 10 : 0,
    }))

    // Average BERTScore per model from model_comparison_results
    const routingIds = rows.map(r => r.id)
    let avgBertScores: Array<{ model: string; avg_bert_score: number; count: number }> = []

    if (routingIds.length > 0) {
      // Paginate to avoid 1000-row cap
      let comparisons: Array<{ model_name: string; bert_score: number }> = []
      let compFrom = 0
      let compHasMore = true

      while (compHasMore) {
        const { data: compPage } = await supabase
          .from('model_comparison_results')
          .select('model_name, bert_score')
          .in('routing_id', routingIds)
          .not('bert_score', 'is', null)
          .range(compFrom, compFrom + PAGE_SIZE - 1)

        if (compPage && compPage.length > 0) {
          comparisons = comparisons.concat(compPage)
          compFrom += PAGE_SIZE
          compHasMore = compPage.length === PAGE_SIZE
        } else {
          compHasMore = false
        }
      }

      if (comparisons.length > 0) {
        const bertByModel: Record<string, { sum: number; count: number }> = {}
        for (const c of comparisons) {
          if (!bertByModel[c.model_name]) {
            bertByModel[c.model_name] = { sum: 0, count: 0 }
          }
          bertByModel[c.model_name].sum += Number(c.bert_score)
          bertByModel[c.model_name].count++
        }

        avgBertScores = Object.entries(bertByModel).map(([model, { sum, count }]) => ({
          model,
          avg_bert_score: Math.round((sum / count) * 10000) / 10000,
          count,
        }))
      }
    }

    return NextResponse.json({
      days,
      total_decisions: total,
      model_distribution: modelDistribution,
      complexity_breakdown: complexityBreakdown,
      fallback_rates: fallbackRates,
      avg_bert_scores: avgBertScores,
    }, { headers: getCorsHeaders() })

  } catch (error) {
    console.error('[Routing Stats] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch routing stats' },
      { status: 500, headers: getCorsHeaders() }
    )
  }
}
