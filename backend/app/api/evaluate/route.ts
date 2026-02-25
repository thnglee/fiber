import { NextRequest, NextResponse } from "next/server";
import { getCorsHeaders } from "@/middleware/cors";
import { calculateLexicalMetrics } from "@/services/evaluation.service";
import { calculateBertScore } from "@/services/bert.service";
import { calculateCompressionRate } from "@/services/compression.service";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { original, summary } = body;

    if (!original || typeof original !== "string" || !summary || typeof summary !== "string") {
      return NextResponse.json(
        { error: "Both 'original' and 'summary' texts are required as strings." },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    // Run lexical metrics + BERTScore in parallel
    const [metrics, bertScore] = await Promise.all([
      Promise.resolve(calculateLexicalMetrics(summary, original)),
      calculateBertScore(original, summary),
    ]);

    // Calculate compression rate (token-based)
    let compressionRate: number | null = null;
    try {
      const crResult = calculateCompressionRate({
        originalText: original,
        summaryText: summary,
      });
      compressionRate = crResult.compressionRate;
    } catch (crErr) {
      console.error("[Evaluate] ⚠️ Compression rate calculation failed:", crErr);
    }

    return NextResponse.json(
      {
        ...metrics,
        bert_score: bertScore,
        compression_rate: compressionRate,
      },
      { headers: getCorsHeaders() }
    );
  } catch (error) {
    console.error("[Evaluate API] Error:", error);
    return NextResponse.json(
      { error: "Failed to evaluate metrics" },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
