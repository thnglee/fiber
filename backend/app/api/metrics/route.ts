import { NextResponse } from 'next/server';
import { getEvaluationMetrics, MetricFilters } from '@/services/evaluation.service';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');
  
  const filters: MetricFilters = {
    mode: searchParams.get('mode') || undefined,
    url: searchParams.get('url') || undefined,
    startDate: searchParams.get('start_date') || undefined,
    endDate: searchParams.get('end_date') || undefined,
  };

  const result = await getEvaluationMetrics(limit, offset, filters);
  
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    }
  });
}
