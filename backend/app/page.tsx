"use client"

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="text-center space-y-4">
            <h1 className="text-3xl font-bold text-gray-900">Fiber API</h1>
            <p className="text-gray-600">
              Backend API for the Fiber browser extension
            </p>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Endpoints</h2>
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-start justify-between">
                  <div>
                    <code className="text-sm font-mono text-gray-900">POST /api/summarize</code>
                    <p className="text-sm text-gray-600 mt-1">Summarize article content</p>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-start justify-between">
                  <div>
                    <code className="text-sm font-mono text-gray-900">POST /api/fact-check</code>
                    <p className="text-sm text-gray-600 mt-1">Fact-check selected text</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
