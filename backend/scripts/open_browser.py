import urllib.request
import gzip
import re
import random
import webbrowser
import time

def get_tienphong_articles():
    categories = [
        "https://tienphong.vn/rss/home.rss",
        "https://tienphong.vn/rss/xa-hoi-2.rss",
        "https://tienphong.vn/rss/kinh-te-3.rss",
        "https://tienphong.vn/rss/the-gioi-5.rss",
        "https://tienphong.vn/rss/gioi-tre-4.rss",
        "https://tienphong.vn/rss/phap-luat-12.rss",
    ]
    
    unique_links = set()
    for cat in categories:
        try:
            req = urllib.request.Request(
                cat, 
                headers={
                    'User-Agent': 'Mozilla/5.0', 
                    'Accept-Encoding': 'gzip'
                }
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read()
                if resp.info().get('Content-Encoding') == 'gzip':
                    data = gzip.decompress(data)
                content = data.decode('utf-8')
                
            links = re.findall(r'<link>\s*(https://tienphong\.vn/[^<]+?-post\d+\.tpo)\s*</link>', content)
            unique_links.update(links)
        except Exception as e:
            print(f"Error fetching {cat}: {e}")
            
    return list(unique_links)

def main():
    print("Fetching real articles from tienphong.vn RSS feeds...")
    articles = get_tienphong_articles()
    
    if len(articles) < 50:
        print(f"Only found {len(articles)} articles, opening all of them...")
        selected = articles
    else:
        selected = random.sample(articles, 50)
        
    print(f"Opening {len(selected)} random articles from tienphong.vn...")
    print("-" * 50)

    for i, url in enumerate(selected, 1):
        print(f"[{i}/{len(selected)}] {url}")
        # Use autoraise=False to not steal window focus
        webbrowser.open(url, new=2, autoraise=False)
        time.sleep(1)

    print("-" * 50)
    print("Done.")

if __name__ == "__main__":
    main()