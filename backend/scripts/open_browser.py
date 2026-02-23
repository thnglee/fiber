import webbrowser
import time

# List of 9 constant, real article links for each supported domain
CONSTANT_ARTICLES = [
    # 1. vnexpress.net
    "https://vnexpress.net/the-gioi-trong-tuan-qua-anh-5012207.html",
    
    # 2. tuoitre.vn
    "https://tuoitre.vn/nam-2026-cac-tinh-thanh-duoc-giao-muc-tieu-tang-truong-grdp-ra-sao-20260130152037667.htm",
    
    # 3. dantri.com.vn
    "https://dantri.com.vn/suc-khoe/tre-em-viet-nam-su-dung-mang-xa-hoi-5-7-gio-moi-ngay-20241004122731784.htm",
    
    # 4. thanhnien.vn
    "https://thanhnien.vn/nhan-sac-nu-bien-tap-vien-dan-ban-tin-thoi-su-vtv-185250903105217657.htm",
    
    # 5. vietnamnet.vn
    "https://vietnamnet.vn/5-diem-moi-thi-tot-nghiep-thpt-nam-2026-2446373.html",
    
    # 6. laodong.vn
    "https://laodong.vn/su-kien-binh-luan/lao-dong-tro-lai-sau-tet-va-su-chu-dong-cua-doanh-nghiep-1659110.ldo",
    
    # 7. tienphong.vn
    "https://tienphong.vn/no-lo-phot-pho-o-lao-cai-mot-nguoi-tu-vong-post1822476.tpo",
    
    # 8. vtv.vn
    "https://vtv.vn/video/thoi-su-23h-vtv1-07-3-2020-426076.htm",
    
    # 9. nld.com.vn
    "https://nld.com.vn/nam-2026-mo-dau-ky-nguyen-phat-trien-moi-196260102190417496.htm"
]

def main():
    print("Opening 9 constant articles in your browser...")
    print("-" * 50)
    
    for url in CONSTANT_ARTICLES:
        print(f"[+] Opening: {url}")
        
        # Opens the URL in a new tab of the default browser
        webbrowser.open_new_tab(url)
        
        # A 1-second delay prevents the browser from freezing 
        # when trying to open many tabs simultaneously.
        time.sleep(1)
        
    print("-" * 50)
    print("All articles have been opened successfully!")

if __name__ == "__main__":
    main()