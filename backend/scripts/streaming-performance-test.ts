#!/usr/bin/env tsx
/**
 * Streaming Performance Test Script
 * 
 * Tests the performance of the summary-sidebar streaming feature
 * by measuring:
 * - First chunk time (time to receive first chunk)
 * - Total completion time (time to complete entire response)
 * - Wait-time savings (non-streaming total - streaming first chunk)
 */

import * as fs from 'fs'
import * as path from 'path'

// Test configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000/api'
const OUTPUT_DIR = path.join(__dirname, '../test-results')

// 10 VnExpress URLs for testing
// 10 VnExpress URLs for testing (Random selection)
const TEST_URLS = [
    'https://vnexpress.net/bo-truong-tai-chinh-giam-giay-phep-kinh-doanh-toi-thieu-50-nganh-nghe-4986741.html',
    'https://vnexpress.net/thoi-su/ho-con-rua-va-giai-thoai-tran-yem-long-mach-o-sai-gon-3455791.html',
    'https://vnexpress.net/kinh-doanh/cong-ty-cua-dai-gia-duong-ngoc-minh-lo-dam-4004007.html',
    'https://vnexpress.net/giai-tri-voi-trung-phuc-sinh-trong-phan-mem-1531410.html',
    'https://vnexpress.net/suc-khoe-cam-nang-cac-benh-phong-cui-4681769.html',
    'https://vnexpress.net/suc-khoe-cam-nang-5-trieu-chung-gan-ton-thuong-do-benh-tieu-duong-4894622.html',
    'https://vnexpress.net/suc-khoe-sinh-ly-nu-thay-doi-the-nao-theo-tuoi-tac-4996742.html',
    'https://vnexpress.net/suc-khoe-cam-nang-7-dau-hieu-canh-bao-than-keu-cuu-4912705.html',
    'https://vnexpress.net/thoi-su/ly-do-nha-nong-su-dung-phan-trun-que-3986629.html',
    'https://vnexpress.net/thoi-su/tieu-chuan-chung-nhan-huu-co-o-viet-nam-3979983.html',
]

interface TestResult {
    index: number
    url: string
    title: string
    streamingFirstChunk: number
    streamingTotal: number
    nonStreamingTotal: number
    waitTimeSavings: number
    error?: string
}

/**
 * Test streaming performance for a single URL
 */
async function testStreamingPerformance(url: string): Promise<{
    firstChunkTime: number
    totalTime: number
    title: string
}> {
    const startTime = Date.now()
    let firstChunkTime = 0
    let title = url

    try {
        const response = await fetch(`${API_BASE_URL}/summarize?stream=true`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
            throw new Error('Response body is not readable')
        }

        const decoder = new TextDecoder()
        let buffer = ''
        let receivedFirstChunk = false

        try {
            while (true) {
                const { done, value } = await reader.read()

                if (done) break

                // Record first chunk time
                if (!receivedFirstChunk) {
                    firstChunkTime = Date.now() - startTime
                    receivedFirstChunk = true
                }

                buffer += decoder.decode(value, { stream: true })

                // Process SSE messages
                const messages = buffer.split('\n\n')
                buffer = messages.pop() || ''

                for (const message of messages) {
                    if (!message.trim()) continue

                    const dataMatch = message.match(/^data: (.+)$/m)
                    if (dataMatch) {
                        try {
                            const chunk = JSON.parse(dataMatch[1])

                            // Try to extract title from metadata
                            if (chunk.type === 'metadata' && chunk.category) {
                                title = chunk.category
                            }

                            if (chunk.type === 'done' || chunk.type === 'error') {
                                break
                            }
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock()
        }

        const totalTime = Date.now() - startTime

        return {
            firstChunkTime,
            totalTime,
            title,
        }
    } catch (error) {
        throw new Error(`Streaming test failed: ${error instanceof Error ? error.message : String(error)}`)
    }
}

/**
 * Test non-streaming performance for a single URL
 */
async function testNonStreamingPerformance(url: string): Promise<{
    totalTime: number
}> {
    const startTime = Date.now()

    try {
        const response = await fetch(`${API_BASE_URL}/summarize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        await response.json()
        const totalTime = Date.now() - startTime

        return { totalTime }
    } catch (error) {
        throw new Error(`Non-streaming test failed: ${error instanceof Error ? error.message : String(error)}`)
    }
}

/**
 * Run performance test for a single URL
 */
async function runTest(url: string, index: number): Promise<TestResult> {
    console.log(`\n[${index + 1}/10] Testing: ${url}`)

    try {
        // Test streaming
        console.log('  → Testing streaming mode...')
        const streamingResult = await testStreamingPerformance(url)

        // Wait a bit before next test
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Test non-streaming
        console.log('  → Testing non-streaming mode...')
        const nonStreamingResult = await testNonStreamingPerformance(url)

        // Wait-time savings = time user can read first chunk while waiting for rest
        // = (streaming total time) - (first chunk time)
        const waitTimeSavings = streamingResult.totalTime - streamingResult.firstChunkTime

        console.log(`  ✓ First chunk: ${streamingResult.firstChunkTime}ms`)
        console.log(`  ✓ Streaming total: ${streamingResult.totalTime}ms`)
        console.log(`  ✓ Non-streaming total: ${nonStreamingResult.totalTime}ms`)
        console.log(`  ✓ Wait-time savings: ${waitTimeSavings}ms`)

        return {
            index: index + 1,
            url,
            title: streamingResult.title,
            streamingFirstChunk: streamingResult.firstChunkTime,
            streamingTotal: streamingResult.totalTime,
            nonStreamingTotal: nonStreamingResult.totalTime,
            waitTimeSavings,
        }
    } catch (error) {
        console.error(`  ✗ Error: ${error instanceof Error ? error.message : String(error)}`)

        return {
            index: index + 1,
            url,
            title: 'Error',
            streamingFirstChunk: 0,
            streamingTotal: 0,
            nonStreamingTotal: 0,
            waitTimeSavings: 0,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}

/**
 * Generate markdown table from results
 */
function generateMarkdownTable(results: TestResult[]): string {
    const header = '| STT | Trang | Tốc độ First Chunk (ms) | Tốc độ Toàn bộ (ms) | Wait-time Tiết kiệm (ms) |'
    const separator = '|-----|-------|-------------------------|----------------------|--------------------------|'

    const rows = results.map(r => {
        if (r.error) {
            return `| ${r.index} | ${r.title} | ERROR | ERROR | ERROR |`
        }
        return `| ${r.index} | ${r.title} | ${r.streamingFirstChunk} | ${r.streamingTotal} | ${r.waitTimeSavings} |`
    })

    return [header, separator, ...rows].join('\n')
}

/**
 * Calculate statistics
 */
function calculateStats(results: TestResult[]) {
    const validResults = results.filter(r => !r.error)

    if (validResults.length === 0) {
        return {
            avgFirstChunk: 0,
            avgStreamingTotal: 0,
            avgNonStreamingTotal: 0,
            avgWaitTimeSavings: 0,
            successRate: 0,
        }
    }

    const sum = validResults.reduce((acc, r) => ({
        firstChunk: acc.firstChunk + r.streamingFirstChunk,
        streamingTotal: acc.streamingTotal + r.streamingTotal,
        nonStreamingTotal: acc.nonStreamingTotal + r.nonStreamingTotal,
        waitTimeSavings: acc.waitTimeSavings + r.waitTimeSavings,
    }), { firstChunk: 0, streamingTotal: 0, nonStreamingTotal: 0, waitTimeSavings: 0 })

    return {
        avgFirstChunk: Math.round(sum.firstChunk / validResults.length),
        avgStreamingTotal: Math.round(sum.streamingTotal / validResults.length),
        avgNonStreamingTotal: Math.round(sum.nonStreamingTotal / validResults.length),
        avgWaitTimeSavings: Math.round(sum.waitTimeSavings / validResults.length),
        successRate: (validResults.length / results.length) * 100,
    }
}

/**
 * Main test runner
 */
async function main() {
    console.log('='.repeat(80))
    console.log('STREAMING PERFORMANCE TEST')
    console.log('='.repeat(80))
    console.log(`API URL: ${API_BASE_URL}`)
    console.log(`Testing ${TEST_URLS.length} URLs...`)
    console.log('='.repeat(80))

    const results: TestResult[] = []

    // Run tests sequentially
    for (let i = 0; i < TEST_URLS.length; i++) {
        const result = await runTest(TEST_URLS[i], i)
        results.push(result)

        // Wait between tests to avoid rate limiting
        if (i < TEST_URLS.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000))
        }
    }

    // Generate report
    console.log('\n' + '='.repeat(80))
    console.log('TEST RESULTS')
    console.log('='.repeat(80))
    console.log()

    const table = generateMarkdownTable(results)
    console.log(table)

    const stats = calculateStats(results)
    console.log()
    console.log('='.repeat(80))
    console.log('STATISTICS')
    console.log('='.repeat(80))
    console.log(`Success Rate: ${stats.successRate.toFixed(1)}%`)
    console.log(`Average First Chunk Time: ${stats.avgFirstChunk}ms`)
    console.log(`Average Streaming Total Time: ${stats.avgStreamingTotal}ms`)
    console.log(`Average Non-Streaming Total Time: ${stats.avgNonStreamingTotal}ms`)
    console.log(`Average Wait-time Savings: ${stats.avgWaitTimeSavings}ms`)
    console.log('='.repeat(80))

    // Save results to files
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true })
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

    // Save JSON
    const jsonPath = path.join(OUTPUT_DIR, `streaming-test-${timestamp}.json`)
    fs.writeFileSync(jsonPath, JSON.stringify({ results, stats }, null, 2))
    console.log(`\n✓ Results saved to: ${jsonPath}`)

    // Save Markdown
    const mdPath = path.join(OUTPUT_DIR, `streaming-test-${timestamp}.md`)
    const mdContent = `# Streaming Performance Test Results

**Date:** ${new Date().toLocaleString('vi-VN')}
**API URL:** ${API_BASE_URL}

## Results Table

${table}

## Statistics

- **Success Rate:** ${stats.successRate.toFixed(1)}%
- **Average First Chunk Time:** ${stats.avgFirstChunk}ms
- **Average Streaming Total Time:** ${stats.avgStreamingTotal}ms
- **Average Non-Streaming Total Time:** ${stats.avgNonStreamingTotal}ms
- **Average Wait-time Savings:** ${stats.avgWaitTimeSavings}ms

## Interpretation

Wait-time savings represents the time users save by seeing the first chunk of content in streaming mode compared to waiting for the entire non-streaming response. A positive value indicates that streaming provides a better user experience by reducing perceived latency.
`

    fs.writeFileSync(mdPath, mdContent)
    console.log(`✓ Markdown report saved to: ${mdPath}`)

    console.log('\n✅ Test completed successfully!')
}

// Run the test
main().catch(error => {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
})
