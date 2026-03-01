import urllib.request
import gzip
import xml.etree.ElementTree as ET

def test_rss(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        content = resp.read()
    
    if content.startswith(b'\x1f\x8b'):
        content = gzip.decompress(content)
        
    try:
        root = ET.fromstring(content)
        items = root.findall('.//item')
        print(f"{url}: {len(items)} items")
    except ET.ParseError as e:
        print(f"Parse error for {url}: {e}")

test_rss("https://tienphong.vn/rss/thoi-su-2.rss")
test_rss("https://tienphong.vn/rss/phap-luat-12.rss")
test_rss("https://tienphong.vn/rss/kinh-te-3.rss")
test_rss("https://tienphong.vn/rss/giao-duc-71.rss")
test_rss("https://tienphong.vn/rss/van-hoa-7.rss")
