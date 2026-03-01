import urllib.request
import urllib.error
import gzip
import re
import json
import time
import argparse

SITES = {
    "vnexpress": "https://vnexpress.net/rss/tin-moi-nhat.rss",
    "tuoitre": "https://tuoitre.vn/rss/tin-moi-nhat.rss",
    "dantri": "https://dantri.com.vn/rss/home.rss",
    "thanhnien": "https://thanhnien.vn/rss/home.rss",
    "tienphong": "https://tienphong.vn/rss/home.rss",
}

API_URL = "http://localhost:3000/api/summarize"

def get_links_from_rss(feed_url, max_links):
    try:
        req = urllib.request.Request(
            feed_url, 
            headers={'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'gzip'}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
            if resp.info().get('Content-Encoding') == 'gzip':
                data = gzip.decompress(data)
            content = data.decode('utf-8')
            
        links = re.findall(r'<link>\s*(?:<!\[CDATA\[)?(https?://[^\s<\]]+)(?:\]\]>)?\s*</link>', content)
        
        # Filter out the rss feed link itself or non-article links if needed
        # Commonly RSS contains the homepage link as the first <link>
        article_links = [l for l in links if l != feed_url and not l.endswith('.rss') and l.strip('/') != feed_url.split('/rss')[0]]
        
        # Remove duplicates while preserving order
        unique_links = []
        for l in article_links:
            if l not in unique_links:
                unique_links.append(l)
                
        return unique_links[:max_links]
    except Exception as e:
        print(f"Error fetching RSS {feed_url}: {e}")
        return []

def test_article(url):
    payload = json.dumps({"url": url, "stream": False}).encode('utf-8')
    req = urllib.request.Request(
        API_URL, 
        data=payload,
        headers={'Content-Type': 'application/json'}
    )
    
    start_time = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as resp: # 60s timeout for LLM
            resp.read()
            latency = time.time() - start_time
            return {"status": "success", "latency": latency}
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode('utf-8') if e.fp else str(e)
        return {"status": "error", "error": f"HTTP {e.code}: {error_msg}"}
    except Exception as e:
        return {"status": "error", "error": str(e)}

def main():
    parser = argparse.ArgumentParser(description="Test news sites stability")
    parser.add_argument("--num", type=int, default=5, help="Number of articles to test per site")
    args = parser.parse_args()

    results = {}

    print(f"Testing {args.num} articles from each site...")
    print("-" * 50)

    for site_name, feed_url in SITES.items():
        print(f"\n=> Site: {site_name.upper()}")
        results[site_name] = {"total": 0, "success": 0, "failed": 0, "latencies": []}
        
        links = get_links_from_rss(feed_url, args.num)
        if not links:
            print(f"No links found or failed to fetch feed for {site_name}")
            continue
            
        for i, url in enumerate(links, 1):
            print(f"  [{i}/{len(links)}] Testing {url}")
            res = test_article(url)
            
            results[site_name]["total"] += 1
            if res["status"] == "success":
                results[site_name]["success"] += 1
                results[site_name]["latencies"].append(res["latency"])
                print(f"      SUCCESS - {res['latency']:.2f}s")
            else:
                results[site_name]["failed"] += 1
                print(f"      FAILED - {res['error'][:100]}...")

    print("\n" + "=" * 50)
    print("TEST RESULTS SITES STABILITY")
    print("=" * 50)
    print(f"{'SITE':<15} | {'SUCCESS / TOTAL':<15} | {'RATE':<10} | {'AVG LATENCY'}")
    print("-" * 65)
    
    for site, stats in results.items():
        total = stats["total"]
        if total == 0:
            print(f"{site:<15} | {'N/A':<15} | {'N/A':<10} | N/A")
            continue
            
        success = stats["success"]
        rate = (success / total) * 100
        avg_lat = sum(stats["latencies"]) / success if success > 0 else 0
        
        print(f"{site:<15} | {success:>3} / {total:<9} | {rate:>7.1f}% | {avg_lat:.2f}s")

if __name__ == "__main__":
    main()
