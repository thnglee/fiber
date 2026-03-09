import os
import csv
import json
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

# Define paths relative to the script execution Directory (which should be metrics_reports)
DATASET_DIR = "dataset"
RESULTS_DIR = "results"
BACKEND_URL = "http://localhost:3000"

def call_api(endpoint, payload):
    url = f"{BACKEND_URL}{endpoint}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", "Accept": "application/json"})
    try:
        # Long timeout in case the LLM takes a while or queueing happens
        with urllib.request.urlopen(req, timeout=180) as response:
            res_body = response.read().decode("utf-8")
            return json.loads(res_body)
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        print(f"HTTP Error {e.code} for {url}: {error_body}")
        return None
    except Exception as e:
        print(f"Error for {url}: {e}")
        return None

def process_url(url, i, total):
    print(f"[{i}/{total}] Summarizing: {url}")
    start_time = time.time()
    
    # 1. Call Summarize API (non-streaming, require debug info for original content)
    summary_res = call_api("/api/summarize", {"url": url, "debug": True})
    
    latency = time.time() - start_time
    
    if not summary_res:
        print(f"[{i}/{total}] -> Failed to summarize (API Error) {url}")
        return url, None
        
    summary = summary_res.get("summary")
    debug_info = summary_res.get("debug", {})
    extracted_content = debug_info.get("extractedContent", {}).get("fullContent")
    usage = summary_res.get("usage", {})
    total_tokens = usage.get("total_tokens", 0)
    
    if not summary or not extracted_content:
        print(f"[{i}/{total}] -> Missing summary or extracted content {url}")
        return url, None
        
    print(f"[{i}/{total}] -> Summarized in {latency:.2f}s. Evaluating...")
    
    # 2. Call Evaluate API
    eval_res = call_api("/api/evaluate", {"original": extracted_content, "summary": summary})
    
    if not eval_res:
        print(f"[{i}/{total}] -> Failed to evaluate {url}")
        return url, None
        
    return url, {
        "URL": url,
        "ROUGE-1": eval_res.get("rouge1"),
        "ROUGE-2": eval_res.get("rouge2"),
        "ROUGE-L": eval_res.get("rougeL"),
        "BLEU": eval_res.get("bleu"),
        "BERTSCORE": eval_res.get("bert_score"),
        "LATENCY": round(latency, 2),
        "COMPRESSION RATE": eval_res.get("compression_rate"),
        "TOTAL TOKENS": total_tokens
    }

def process_dataset(filename):
    print(f"\n==========================================")
    print(f"Processing dataset: {filename}")
    print(f"==========================================")
    in_path = os.path.join(DATASET_DIR, filename)
    out_path = os.path.join(RESULTS_DIR, filename)
    
    urls = []
    with open(in_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        for row in reader:
            if row and row[0].strip():
                urls.append(row[0].strip())
                
    results_map = {}
    
    # Using 2 concurrent workers to avoid rate limiting and excessive load on BERT microserver
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {executor.submit(process_url, url, i+1, len(urls)): url for i, url in enumerate(urls)}
        
        for future in as_completed(futures):
            url = futures[future]
            try:
                processed_url, res = future.result()
                if res:
                    results_map[processed_url] = res
                else:
                    results_map[processed_url] = {
                        "URL": url,
                        "ROUGE-1": "", "ROUGE-2": "", "ROUGE-L": "", "BLEU": "", "BERTSCORE": "",
                        "LATENCY": "", "COMPRESSION RATE": "", "TOTAL TOKENS": ""
                    }
            except Exception as exc:
                print(f"URL {url} generated an exception: {exc}")
                results_map[url] = {
                    "URL": url,
                    "ROUGE-1": "", "ROUGE-2": "", "ROUGE-L": "", "BLEU": "", "BERTSCORE": "",
                    "LATENCY": "", "COMPRESSION RATE": "", "TOTAL TOKENS": ""
                }
                
    # Restore original order as they appear in the dataset
    results = [results_map[url] for url in urls]
            
    # Write results to CSV
    fields = ["URL", "ROUGE-1", "ROUGE-2", "ROUGE-L", "BLEU", "BERTSCORE", "LATENCY", "COMPRESSION RATE", "TOTAL TOKENS"]
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(results)
        
    print(f">>>> Finished dataset {filename}. Saved to {out_path}\n")

def main():
    # Ensure results directory exists
    if not os.path.exists(RESULTS_DIR):
        os.makedirs(RESULTS_DIR)
        
    # Find all CSV files in the dataset folder
    dataset_files = [f for f in os.listdir(DATASET_DIR) if f.endswith(".csv")]
    dataset_files.sort()
    
    if not dataset_files:
        print("No dataset files found!")
        return
        
    for filename in dataset_files:
        process_dataset(filename)

if __name__ == "__main__":
    main()
