import { NextResponse } from 'next/server';
import { getEvaluationMetrics } from '@/services/evaluation.service';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  const result = await getEvaluationMetrics(limit, offset);
  
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    }
  });
}
