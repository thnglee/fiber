import os
import csv
import urllib.request
import gzip
import xml.etree.ElementTree as ET

topics = {
    "1_thoi_su": "https://tienphong.vn/rss/thoi-su-2.rss",
    "2_phap_luat": "https://tienphong.vn/rss/phap-luat-12.rss",
    "3_kinh_te": "https://tienphong.vn/rss/kinh-te-3.rss",
    "4_giao_duc": "https://tienphong.vn/rss/giao-duc-71.rss",
    "5_van_hoa": "https://tienphong.vn/rss/van-hoa-7.rss"
}

output_dir = "/Users/thanglee/something beautiful/UniThesis/metrics_reports/dataset"
os.makedirs(output_dir, exist_ok=True)

for name, url in topics.items():
    print(f"Fetching {name}...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        content = resp.read()
    
    if content.startswith(b'\x1f\x8b'):
        content = gzip.decompress(content)
        
    try:
        root = ET.fromstring(content)
        items = root.findall('.//item')
        
        csv_path = os.path.join(output_dir, f"{name}.csv")
        with open(csv_path, mode='w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(["URL"])
            
            count = 0
            for item in items:
                if count >= 50:
                    break
                link = item.find('link')
                if link is not None and link.text:
                    writer.writerow([link.text.strip()])
                    count += 1
                    
        print(f"Saved {count} items to {csv_path}")
    except ET.ParseError as e:
        print(f"Parse error for {url}: {e}")
