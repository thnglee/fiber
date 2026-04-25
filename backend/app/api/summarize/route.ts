import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { getCorsHeaders } from "@/middleware/cors"
import { buildErrorResponse } from "@/utils/apiError"
import { performSummarize } from "@/services/summarize.service"
import { SummarizeRequestSchema, SummarizeResponseSchema } from "@/domain/schemas"
import { zodErrorResponse } from "@/utils/zod-helpers"
import { getEnvVar } from "@/config/env"
import { waitUntil } from "@vercel/functions"
// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(),
  })
}

/**
 * POST /api/summarize
 * Summarize endpoint handler
 *
 * Supports three routing modes:
 * - forced (default/existing): use active model or explicit override
 * - auto: complexity-based model selection with fallback chain
 * - evaluation: run all 3 models in parallel, pick best via BERTScore
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Check API key first before processing request
    try {
      getEnvVar("OPENAI_API_KEY")
    } catch {
      console.error("OPENAI_API_KEY is not set in environment variables")
      return NextResponse.json(
        {
          error: "OpenAI API key not configured",
          hint: "Please set OPENAI_API_KEY in your .env file"
        },
        { status: 500, headers: getCorsHeaders() }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const parseResult = SummarizeRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return zodErrorResponse(parseResult.error, 400)
    }

    const {
      content,
      url,
      debug,
      website,
      model: modelOverride,
      routing_mode: requestRoutingMode,
      fusion_config: fusionConfigOverride,
      judge_config: judgeConfigOverride,
    } = parseResult.data

    // Resolve routing mode
    const { resolveRoutingMode } = await import('@/services/routing.service')
    const routingMode = resolveRoutingMode({ routing_mode: requestRoutingMode, model: modelOverride })

    // Check if streaming is requested
    const { searchParams } = new URL(request.url)
    const isStreaming = searchParams.get('stream') === 'true'

    // ============================================================================
    // FUSION MODE — MoA pipeline (N proposers → aggregator)
    // ============================================================================
    if (routingMode === 'fusion') {
      if (isStreaming) {
        return NextResponse.json(
          { error: 'Streaming is not supported in fusion mode' },
          { status: 400, headers: getCorsHeaders() }
        )
      }

      // Resolve article text (reuse client-provided content when possible)
      let articleText = content || ''
      if (url && !content) {
        const { extractContentFromUrl } = await import('@/services/content-extraction.service')
        const extracted = await extractContentFromUrl(url)
        articleText = extracted.content
      }

      if (!articleText) {
        return NextResponse.json(
          { error: "Either 'content' or 'url' is required for fusion mode" },
          { status: 400, headers: getCorsHeaders() }
        )
      }

      const { buildMoAConfig } = await import('@/output-fusion/moa.config')
      const { runMoAFusion } = await import('@/output-fusion/moa.service')
      const { MoAInsufficientDraftsError } = await import('@/output-fusion/moa.types')
      const { saveMoAFusionResult, saveLLMJudgePairwise } = await import('@/output-fusion/moa.persistence')

      let moaConfig
      try {
        moaConfig = await buildMoAConfig(fusionConfigOverride)
        moaConfig.judgeOverride = judgeConfigOverride
      } catch (configErr) {
        return NextResponse.json(
          {
            error: configErr instanceof Error
              ? configErr.message
              : 'Failed to build MoA configuration',
          },
          { status: 400, headers: getCorsHeaders() }
        )
      }

      try {
        const fusionResult = await runMoAFusion(articleText, website, moaConfig)

        // Save routing decision + persist fusion detail + evaluation row (fire-and-forget)
        const { saveRoutingDecision, estimateTokenCount, classifyComplexity } = await import('@/services/routing.service')
        const complexity = classifyComplexity(articleText)

        waitUntil(
          (async () => {
            const routingId = await saveRoutingDecision({
              article_length: articleText.length,
              article_tokens: estimateTokenCount(articleText),
              category: fusionResult.fused.category,
              complexity,
              routing_mode: 'fusion',
              selected_model: `moa:${fusionResult.aggregator.model_name}`,
              fallback_used: fusionResult.pipeline.failed_proposers.length > 0,
              fallback_reason: fusionResult.pipeline.failed_proposers.length > 0
                ? `Proposers failed: ${fusionResult.pipeline.failed_proposers.join(', ')}`
                : undefined,
            })

            const fusionId = await saveMoAFusionResult({
              result: fusionResult,
              articleUrl: url,
              routingId,
            })
            if (fusionId) fusionResult.routing_id = routingId ?? undefined

            // Persist the pairwise verdict (fused vs best-draft) if the judge ran.
            if (fusionResult.judge_pairwise) {
              await saveLLMJudgePairwise({
                verdict: fusionResult.judge_pairwise,
                routingId,
                fusionId,
              }).catch(err =>
                console.error('[Summarize Fusion] Failed to save pairwise verdict:', err)
              )
            }

            const { saveEvaluationMetrics } = await import('@/services/evaluation.service')
            const { runJudgeForSummary } = await import('@/services/llm-judge.runner')
            const judgeFields = await runJudgeForSummary(
              fusionResult.fused.summary,
              articleText,
              judgeConfigOverride,
            )
            await saveEvaluationMetrics({
              summary: fusionResult.fused.summary,
              original: articleText,
              url,
              metrics: {
                rouge1: fusionResult.fused.scores.rouge1 ?? 0,
                rouge2: fusionResult.fused.scores.rouge2 ?? 0,
                rougeL: fusionResult.fused.scores.rougeL ?? 0,
                bleu: fusionResult.fused.scores.bleu ?? 0,
                bert_score: fusionResult.fused.scores.bert_score,
                compression_rate: fusionResult.fused.scores.compression_rate,
                total_tokens: fusionResult.pipeline.total_tokens,
              },
              latency: fusionResult.pipeline.total_latency_ms,
              mode: 'fusion',
              model: `moa:${fusionResult.aggregator.model_name}`,
              promptTokens: fusionResult.aggregator.prompt_tokens ?? undefined,
              completionTokens: fusionResult.aggregator.completion_tokens ?? undefined,
              estimatedCostUsd: fusionResult.pipeline.total_cost_usd ?? undefined,
              judge: judgeFields,
            }).catch(err =>
              console.error('[Summarize Fusion] Failed to save evaluation metrics:', err)
            )
          })().catch(err =>
            console.error('[Summarize Fusion] Persistence task failed:', err)
          )
        )

        // Track user action (fire-and-forget)
        const processingTime = Date.now() - startTime
        const { trackAction, getClientIP, extractTokenUsage } = await import('@/services/action-tracking.service')
        const tokenUsage = extractTokenUsage({
          usage: {
            prompt_tokens: fusionResult.aggregator.prompt_tokens ?? undefined,
            completion_tokens: fusionResult.aggregator.completion_tokens ?? undefined,
            total_tokens: fusionResult.pipeline.total_tokens ?? undefined,
          },
        })

        waitUntil(
          trackAction({
            actionType: 'summarize',
            inputType: url ? 'url' : 'text',
            inputContent: url || content || '',
            outputContent: {
              summary: fusionResult.fused.summary,
              category: fusionResult.fused.category,
              readingTime: fusionResult.fused.readingTime,
            },
            category: fusionResult.fused.category,
            tokenUsage,
            model: `moa:${fusionResult.aggregator.model_name}`,
            userIp: getClientIP(request.headers),
            website: website || 'unknown',
            userAgent: request.headers.get('user-agent') || 'unknown',
            processingTimeMs: processingTime,
          }).catch(err => console.error('[Summarize Fusion] Failed to track action:', err))
        )

        const response = {
          summary: fusionResult.fused.summary,
          category: fusionResult.fused.category,
          readingTime: fusionResult.fused.readingTime,
          model: `moa:${fusionResult.aggregator.model_name}`,
          usage: {
            prompt_tokens: fusionResult.aggregator.prompt_tokens ?? undefined,
            completion_tokens: fusionResult.aggregator.completion_tokens ?? undefined,
            total_tokens: fusionResult.pipeline.total_tokens ?? undefined,
          },
          routing: {
            selected_model: fusionResult.aggregator.model_name,
            complexity,
            fallback_used: fusionResult.pipeline.failed_proposers.length > 0,
          },
          fusion: fusionResult,
        }

        return NextResponse.json(response, { headers: getCorsHeaders() })
      } catch (err) {
        if (err instanceof MoAInsufficientDraftsError) {
          // Fall back to a regular forced summarize with the active model below.
          console.warn('[Summarize Fusion] Insufficient drafts, falling back to forced mode:', err.message)
        } else {
          throw err
        }
      }
    }

    // ============================================================================
    // EVALUATION MODE — run all models in parallel, pick best
    // ============================================================================
    if (routingMode === 'evaluation') {
      if (isStreaming) {
        return NextResponse.json(
          { error: 'Streaming is not supported in evaluation mode' },
          { status: 400, headers: getCorsHeaders() }
        )
      }

      // Get the article text (extract from URL if needed)
      let articleText = content || ''
      if (url && !content) {
        const { extractContentFromUrl } = await import('@/services/content-extraction.service')
        const extracted = await extractContentFromUrl(url)
        articleText = extracted.content
      }

      const { runFusedSummarization } = await import('@/services/fusion.service')
      const { getRoutingCandidateConfigs, classifyComplexity } = await import('@/services/routing.service')
      const candidateConfigs = await getRoutingCandidateConfigs()

      if (candidateConfigs.length === 0) {
        return NextResponse.json(
          { error: 'No routing candidate models configured' },
          { status: 500, headers: getCorsHeaders() }
        )
      }

      const fusionResult = await runFusedSummarization(articleText, website, candidateConfigs)
      const complexity = classifyComplexity(articleText)

      // Find the winner's full response to get category/readingTime
      const winnerCandidate = fusionResult.candidates.find(c => c.selected)

      const response = {
        summary: fusionResult.winner.summary,
        category: fusionResult.winner.category,
        readingTime: fusionResult.winner.readingTime,
        model: fusionResult.winner.model,
        routing: {
          selected_model: fusionResult.winner.model,
          complexity,
          fallback_used: false,
          candidates: fusionResult.candidates,
        },
      }

      // Track action
      const processingTime = Date.now() - startTime
      const { trackAction, getClientIP, extractTokenUsage } = await import('@/services/action-tracking.service')
      const tokenUsage = extractTokenUsage({ usage: winnerCandidate ? {
        prompt_tokens: winnerCandidate.prompt_tokens ?? undefined,
        completion_tokens: winnerCandidate.completion_tokens ?? undefined,
      } : undefined })

      waitUntil(
        trackAction({
          actionType: 'summarize',
          inputType: url ? 'url' : 'text',
          inputContent: url || content || '',
          outputContent: { summary: response.summary, category: response.category, readingTime: response.readingTime },
          category: response.category,
          tokenUsage,
          model: fusionResult.winner.model,
          userIp: getClientIP(request.headers),
          website: website || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          processingTimeMs: processingTime
        }).catch(err => console.error('[Summarize Evaluation] Failed to track action:', err))
      )

      return NextResponse.json(response, { headers: getCorsHeaders() })
    }

    // ============================================================================
    // MODEL RESOLUTION — auto selects by complexity, forced uses active/override
    // ============================================================================
    const { getActiveModelConfig, getAllModelConfigs } = await import('@/services/model-config.service')
    let modelConfig = await getActiveModelConfig()

    if (routingMode === 'auto') {
      // Get the article text for complexity classification
      let articleText = content || ''
      if (url && !content) {
        const { extractContentFromUrl } = await import('@/services/content-extraction.service')
        const extracted = await extractContentFromUrl(url)
        articleText = extracted.content
      }

      const { selectModel, getModelConfigByName, getFallbackModel, saveRoutingDecision, estimateTokenCount, classifyComplexity } = await import('@/services/routing.service')
      const selection = selectModel(articleText)
      const autoModelConfig = await getModelConfigByName(selection.model)

      if (autoModelConfig) {
        modelConfig = autoModelConfig
      }
      // else: keep the active model as fallback

      if (isStreaming && modelConfig.supports_streaming) {
        // Auto mode resolved the model — fall through to the shared streaming block below
        console.log(`[Summarize Auto] Streaming with auto-selected model: ${modelConfig.model_name}`)
      } else {
        // If streaming requested but selected model doesn't support it, silently use sync mode
        if (isStreaming && !modelConfig.supports_streaming) {
          console.log(`[Summarize Auto] Streaming requested but ${modelConfig.model_name} doesn't support it — using sync mode`)
        }

        // Try the selected model (sync)
        let response
        let fallbackUsed = selection.fallbackUsed
        let fallbackReason = selection.fallbackReason
        let usedModel = modelConfig

        try {
          response = await performSummarize({ content, url, debug, judge_config: judgeConfigOverride }, modelConfig)
        } catch (err) {
          // Primary model failed — walk the full fallback chain
          console.error(`[Summarize Auto] ${modelConfig.model_name} failed:`, err)
          let currentModelName: string | null = modelConfig.model_name
          while (!response && currentModelName) {
            const nextModelName = getFallbackModel(currentModelName)
            if (!nextModelName) break
            const nextConfig = await getModelConfigByName(nextModelName)
            if (nextConfig) {
              try {
                console.log(`[Summarize Auto] Falling back to ${nextModelName}`)
                response = await performSummarize({ content, url, debug, judge_config: judgeConfigOverride }, nextConfig)
                usedModel = nextConfig
                fallbackUsed = true
                fallbackReason = `${modelConfig.model_name} failed, fell back to ${nextModelName}`
              } catch (fallbackErr) {
                console.error(`[Summarize Auto] ${nextModelName} also failed:`, fallbackErr)
              }
            }
            currentModelName = nextModelName
          }
          if (!response) throw err // Re-throw if no fallback succeeded
        }

        // Save routing decision to DB (fire-and-forget)
        const complexity = classifyComplexity(articleText)
        waitUntil(
          saveRoutingDecision({
            article_length: articleText.length,
            article_tokens: estimateTokenCount(articleText),
            category: response.category,
            complexity,
            routing_mode: 'auto',
            selected_model: usedModel.model_name,
            fallback_used: fallbackUsed,
            fallback_reason: fallbackReason,
          }).catch(err => console.error('[Summarize Auto] Failed to save routing decision:', err))
        )

        // Attach routing info to response
        const enrichedResponse = {
          ...response,
          routing: {
            selected_model: usedModel.model_name,
            complexity,
            fallback_used: fallbackUsed,
          },
        }

        // Validate response
        const responseParseResult = SummarizeResponseSchema.safeParse(enrichedResponse)
        if (!responseParseResult.success) {
          return zodErrorResponse(responseParseResult.error, 500)
        }

        // Track action (fire-and-forget)
        const processingTime = Date.now() - startTime
        const { trackAction, getClientIP, extractTokenUsage } = await import('@/services/action-tracking.service')
        const tokenUsage = response.usage
          ? extractTokenUsage({ usage: response.usage })
          : extractTokenUsage(response.debug?.openaiResponse)

        waitUntil(
          trackAction({
            actionType: 'summarize',
            inputType: url ? 'url' : 'text',
            inputContent: url || content || '',
            outputContent: responseParseResult.data,
            category: responseParseResult.data.category,
            tokenUsage,
            model: usedModel.model_name,
            userIp: getClientIP(request.headers),
            website: website || 'unknown',
            userAgent: request.headers.get('user-agent') || 'unknown',
            processingTimeMs: processingTime
          }).catch(err => console.error('[Summarize Auto] Failed to track action:', err))
        )

        return NextResponse.json(responseParseResult.data, { headers: getCorsHeaders() })
      }
    } else if (routingMode === 'forced') {
      // If request specifies a model override, find that model's config
      if (modelOverride) {
        const allConfigs = await getAllModelConfigs()
        const overrideConfig = allConfigs.find(c => c.model_name === modelOverride)
        if (overrideConfig) modelConfig = overrideConfig
      }
    }

    // ============================================================================
    // STREAMING / SYNC — shared by both auto (streaming) and forced modes
    // ============================================================================

    if (isStreaming) {
      // ============================================================================
      // STREAMING MODE - Server-Sent Events
      // ============================================================================
      const { performSummarizeStream } = await import('@/services/summarize.service')

      // Track accumulated data for action logging
      let accumulatedSummary = ''
      let firstChunkTime: number | null = null
      let finalSummaryText = ''  // Set from the structured metadata chunk (authoritative)
      let finalCategory = ''
      let finalReadingTime = 0
      let finalUsage: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined = undefined

      // Create a readable stream for SSE
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Stream summary chunks
            for await (const chunk of performSummarizeStream({ content, url, debug }, modelConfig)) {
              // Accumulate data for tracking
              if (chunk.type === 'summary-delta' && chunk.delta) {
                if (!firstChunkTime) firstChunkTime = Date.now()
                accumulatedSummary += chunk.delta
              } else if (chunk.type === 'metadata') {
                // Capture the fully-parsed summary from the service (most reliable source)
                if (chunk.summary) finalSummaryText = chunk.summary
                finalCategory = chunk.category || ''
                finalReadingTime = chunk.readingTime || 0
                finalUsage = chunk.usage
              }

              // Send SSE formatted data
              const data = `data: ${JSON.stringify(chunk)}\n\n`
              controller.enqueue(encoder.encode(data))

              if (request.signal.aborted) {
                console.log('[Summarize Stream] Client disconnected, aborting stream iteration')
                break
              }
            }
          } catch (error) {
            console.error('[Summarize Stream] Stream generation error:', error)
            // Send error event
            try {
              const errorData = `data: ${JSON.stringify({
                type: 'error',
                error: error instanceof Error ? error.message : 'Streaming failed'
              })}\n\n`
              controller.enqueue(encoder.encode(errorData))
            } catch {
              console.log('[Summarize Stream] Could not send error to client (likely disconnected)')
            }
          } finally {
            // ✅ CRITICAL FIX: Track action BEFORE closing stream, always executed even on abort
            // This ensures database insert completes before request handler terminates
            console.log('[Summarize Stream] Streaming ended (complete or aborted), tracking action...')
            const processingTime = Date.now() - startTime
            const { trackAction, getClientIP, extractTokenUsage } = await import('@/services/action-tracking.service')

            // Prefer the fully-parsed summary captured from the metadata chunk.
            // Fall back to parsing the accumulated raw JSON deltas only if metadata
            // was never received (e.g. stream was aborted very early).
            let summaryText = finalSummaryText
            if (!summaryText && accumulatedSummary) {
              console.log('[Summarize Stream] No metadata summary captured, falling back to delta parsing...')
              try {
                const parsed = JSON.parse(accumulatedSummary)
                summaryText = parsed.summary || ''
              } catch {
                // If full-JSON parse fails, try regex extraction
                const summaryMatch = accumulatedSummary.match(/"summary"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/)
                if (summaryMatch) {
                  summaryText = summaryMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
                }
                if (!summaryText) {
                  // Last-resort coarse extraction for mid-stream aborts
                  const startIndex = accumulatedSummary.indexOf('"summary"')
                  if (startIndex !== -1) {
                    const afterSummary = accumulatedSummary.substring(startIndex + 9)
                    const colonIndex = afterSummary.indexOf(':')
                    if (colonIndex !== -1) {
                      const quoteIndex = afterSummary.indexOf('"', colonIndex)
                      if (quoteIndex !== -1) {
                        summaryText = afterSummary.substring(quoteIndex + 1).replace(/"}$/, '').replace(/\\n/g, '\n').replace(/\\"/g, '"')
                      }
                    }
                  }
                }
              }
            }
            console.log('[Summarize Stream] summaryText source:', finalSummaryText ? 'metadata-chunk' : 'delta-fallback', 'length:', summaryText.length)

            console.log('[Summarize Stream] finalUsage before extraction:', finalUsage)
            // ✅ Always extract token usage - returns default {0,0,0} if undefined
            // This prevents NOT NULL constraint violations in the database
            const tokenUsage = extractTokenUsage({ usage: finalUsage })

            console.log('[Summarize Stream] Tracking action with data:', {
              summaryLength: summaryText.length,
              category: finalCategory,
              readingTime: finalReadingTime,
              hasTokenUsage: !!tokenUsage,
              inputType: url ? 'url' : 'text'
            })

            let userActionId: string | undefined
            try {
              userActionId = await trackAction({
                actionType: 'summarize',
                inputType: url ? 'url' : 'text',
                inputContent: url || content || '',
                outputContent: {
                  summary: summaryText,
                  category: finalCategory,
                  readingTime: finalReadingTime
                },
                category: finalCategory,
                tokenUsage,
                model: modelConfig.model_name,
                userIp: getClientIP(request.headers),
                website: website || 'unknown',
                userAgent: request.headers.get('user-agent') || 'unknown',
                processingTimeMs: processingTime
              })
              console.log('[Summarize Stream] ✅ Action tracked successfully! user_action_id:', userActionId)
            } catch (err) {
              console.error('[Summarize Stream] ❌ Error setting up action tracking:', err)
            }

            // ✅ CRITICAL FIX: Save evaluation metrics BEFORE closing stream
            // This ensures the database insert completes before the request terminates
            console.log('[Summarize Stream] Saving evaluation metrics...')
            try {
              const { calculateLexicalMetrics, saveEvaluationMetrics } = await import('@/services/evaluation.service')
              const { calculateBertScore } = await import('@/services/bert.service')
              
              // We need the original content to calculate metrics
              // For streaming, we'll need to extract it from the request
              if (content || url) {
                let originalContent = content || ''
                
                // If URL was provided, we need to extract the content
                if (url && !content) {
                  const { extractContentFromUrl } = await import('@/services/content-extraction.service')
                  const extracted = await extractContentFromUrl(url)
                  originalContent = extracted.content
                }

                if (originalContent && summaryText) {
                  waitUntil(
                    (async () => {
                      const { runJudgeForSummary } = await import('@/services/llm-judge.runner')
                      // Run lexical metrics + BERTScore + judge in parallel
                      const [metrics, bertScore, judgeFields] = await Promise.all([
                        Promise.resolve(calculateLexicalMetrics(summaryText, originalContent)),
                        calculateBertScore(originalContent, summaryText),
                        runJudgeForSummary(summaryText, originalContent, judgeConfigOverride),
                      ])

                      // Calculate compression rate (token-based)
                      const { calculateCompressionRate } = await import('@/services/compression.service')
                      let compressionRate: number | null = null;
                      try {
                        const crResult = calculateCompressionRate({
                          originalText: originalContent,
                          summaryText: summaryText,
                        });
                        compressionRate = crResult.compressionRate;
                      } catch (crErr) {
                        console.error('[Summarize Stream] ⚠️ Compression rate calculation failed:', crErr)
                      }

                      const latency = firstChunkTime ? firstChunkTime - startTime : Date.now() - startTime
                      await saveEvaluationMetrics({
                        summary: summaryText,
                        original: originalContent,
                        url: url,
                        metrics: { ...metrics, bert_score: bertScore, compression_rate: compressionRate, total_tokens: finalUsage?.total_tokens ?? null },
                        latency,
                        mode: 'stream',
                        user_action_id: userActionId ?? null,
                        model: modelConfig.model_name,
                        promptTokens: finalUsage?.prompt_tokens,
                        completionTokens: finalUsage?.completion_tokens,
                        estimatedCostUsd: modelConfig
                          ? ((finalUsage?.prompt_tokens ?? 0) / 1_000_000 * (modelConfig.input_cost_per_1m ?? 0))
                            + ((finalUsage?.completion_tokens ?? 0) / 1_000_000 * (modelConfig.output_cost_per_1m ?? 0))
                          : undefined,
                        judge: judgeFields,
                      })
                      console.log('[Summarize Stream] ✅ Evaluation metrics saved successfully!')
                    })().catch((err) => {
                      console.error('[Summarize Stream] ❌ Failed to save evaluation metrics:', err)
                    })
                  );
                } else {
                  console.log('[Summarize Stream] ⚠️ Skipping metrics - missing content or summary (likely due to early abort without data)')
                }
              }
            } catch (err) {
              console.error('[Summarize Stream] ❌ Error setting up evaluation metrics:', err)
            }

            // ✅ Close stream AFTER tracking completes
            try {
              controller.close()
            } catch {
              console.log('[Summarize Stream] Notice: controller already closed or errored')
            }
          }
        }
      })

      // Return SSE response
      return new NextResponse(stream, {
        headers: {
          ...getCorsHeaders(),
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      })
    } else {
      // ============================================================================
      // NON-STREAMING MODE - Regular JSON response (backward compatible)
      // ============================================================================

      // Delegate to service layer
      // Service will handle validation and extraction
      const response = await performSummarize({ content, url, debug, judge_config: judgeConfigOverride }, modelConfig)

      // Validate response before sending
      const responseParseResult = SummarizeResponseSchema.safeParse(response)
      if (!responseParseResult.success) {
        return zodErrorResponse(responseParseResult.error, 500)
      }

      // Track action asynchronously (fire-and-forget)
      const processingTime = Date.now() - startTime
      const { trackAction, getClientIP, extractTokenUsage } = await import('@/services/action-tracking.service')

      // Extract token usage - try direct access first, then fall back to debug structure
      const tokenUsage = response.usage
        ? extractTokenUsage({ usage: response.usage })
        : extractTokenUsage(response.debug?.openaiResponse)

      waitUntil(
        (async () => {
          try {
            const userActionId = await trackAction({
              actionType: 'summarize',
              inputType: url ? 'url' : 'text',
              inputContent: url || content || '',
              outputContent: responseParseResult.data,
              category: responseParseResult.data.category,
              tokenUsage,
              model: modelConfig.model_name,
              userIp: getClientIP(request.headers),
              website: website || 'unknown',
              userAgent: request.headers.get('user-agent') || 'unknown',
              processingTimeMs: processingTime
            })
            console.log('[Summarize] ✅ Action tracked, user_action_id:', userActionId)
          } catch (err) {
            console.error('[Summarize] Failed to track action:', err)
          }
        })()
      )

      return NextResponse.json(responseParseResult.data, { headers: getCorsHeaders() })
    }
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      return zodErrorResponse(error, 500)
    }

    // Handle specific validation errors from service
    if (error instanceof Error && error.message.includes("required")) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: getCorsHeaders() }
      )
    }

    if (error instanceof Error && error.message.includes("empty")) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: getCorsHeaders() }
      )
    }

    // Handle URL extraction errors
    if (error instanceof Error && (error.message.includes("fetch") || error.message.includes("extract"))) {
      return NextResponse.json(
        {
          error: error.message,
          details: process.env.NODE_ENV === "development" ? error.stack : undefined
        },
        { status: 400, headers: getCorsHeaders() }
      )
    }

    return buildErrorResponse(error, {
      context: "summarize",
      defaultMessage: "Failed to summarize",
    })
  }
}

