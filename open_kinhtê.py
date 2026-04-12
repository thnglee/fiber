import webbrowser

articles = [
    # VnExpress
    "https://vnexpress.net/kinh-doanh",
    # Tuổi Trẻ
    "https://tuoitre.vn/kinh-doanh.htm",
    # Dân Trí
    "https://dantri.com.vn/kinh-doanh.htm",
    # Thanh Niên
    "https://thanhnien.vn/kinh-te.htm",
    # VietnamNet
    "https://vietnamnet.vn/kinh-doanh",
    # Lao Động
    "https://laodong.vn/kinh-doanh",
    # Tiền Phong
    "https://tienphong.vn/kinh-te/",
    # NLD
    "https://nld.com.vn/kinh-te.htm",
]

for url in articles:
    webbrowser.open(url)
