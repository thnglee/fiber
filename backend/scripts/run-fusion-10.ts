import fs from "fs"
import path from "path"

const API_BASE_URL = process.env.API_URL || "http://localhost:3000"
const SAMPLE_URLS_PATH = path.join(process.cwd(), "output-fusion/scripts/sample-urls-tienphong-50.json")

async function main() {
  console.log("Loading URLs from", SAMPLE_URLS_PATH)
  const data = JSON.parse(fs.readFileSync(SAMPLE_URLS_PATH, "utf8"))
  const urls = data.urls.slice(0, 10)

  console.log(`Loaded ${urls.length} URLs. Starting FUSION requests...`)

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    console.log(`[${i + 1}/${urls.length}] Processing: ${url}`)
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/summarize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url,
          routing_mode: "fusion",
          website: "tienphong.vn"
        })
      })

      if (!response.ok) {
        const errBody = await response.text()
        console.error(`Error: HTTP ${response.status} - ${errBody}`)
      } else {
        const json = await response.json()
        console.log(`Success! Model used: ${json.model}, Category: ${json.category}`)
      }
    } catch (err) {
      console.error("Fetch error:", err)
    }
  }

  console.log("Finished making 10 FUSION requests.")
}

main().catch(console.error)
