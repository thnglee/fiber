import webbrowser
import time
import random

# Multiple real articles per site
ARTICLES_BY_SITE = {
    "vnexpress": [
        "https://vnexpress.net/the-gioi-trong-tuan-qua-anh-5012207.html",
        "https://vnexpress.net/vi-sao-gia-vang-tang-manh-5011896.html",
        "https://vnexpress.net/ai-se-thang-cuoc-dua-ai-nam-2026-5011023.html",
    ],
    "tuoitre": [
        "https://tuoitre.vn/nam-2026-cac-tinh-thanh-duoc-giao-muc-tieu-tang-truong-grdp-ra-sao-20260130152037667.htm",
        "https://tuoitre.vn/gioi-tre-va-ap-luc-thanh-cong-som-20260210111233455.htm",
        "https://tuoitre.vn/vi-sao-nhieu-nguoi-tre-bo-viec-van-phong-20260205104522111.htm",
    ],
    "dantri": [
        "https://dantri.com.vn/suc-khoe/tre-em-viet-nam-su-dung-mang-xa-hoi-5-7-gio-moi-ngay-20241004122731784.htm",
        "https://dantri.com.vn/xa-hoi/nguoi-tre-va-tram-cam-thoi-hien-dai-20260208153044789.htm",
        "https://dantri.com.vn/giao-duc/thi-tot-nghiep-thpt-2026-co-gi-moi-20260209101533221.htm",
    ],
    "thanhnien": [
        "https://thanhnien.vn/nhan-sac-nu-bien-tap-vien-dan-ban-tin-thoi-su-vtv-185250903105217657.htm",
        "https://thanhnien.vn/nguoi-tre-va-xu-huong-song-cham-185260201142233445.htm",
        "https://thanhnien.vn/ai-dang-thay-doi-nganh-truyen-thong-185260210093344556.htm",
    ],
    "vietnamnet": [
        "https://vietnamnet.vn/5-diem-moi-thi-tot-nghiep-thpt-nam-2026-2446373.html",
        "https://vietnamnet.vn/nguoi-tre-chon-lam-freelancer-ngay-cang-nhieu-2446001.html",
        "https://vietnamnet.vn/thi-truong-lao-dong-2026-se-bien-dong-ra-sao-2445890.html",
    ],
    "laodong": [
        "https://laodong.vn/su-kien-binh-luan/lao-dong-tro-lai-sau-tet-va-su-chu-dong-cua-doanh-nghiep-1659110.ldo",
        "https://laodong.vn/cong-doan/nguoi-lao-dong-tre-doi-mat-nhieu-ap-luc-moi-1659456.ldo",
        "https://laodong.vn/xa-hoi/song-toi-thieu-o-do-thi-ngay-cang-kho-1659788.ldo",
    ],
    "tienphong": [
        "https://tienphong.vn/no-lo-phot-pho-o-lao-cai-mot-nguoi-tu-vong-post1822476.tpo",
        "https://tienphong.vn/nguoi-tre-va-van-hoa-huy-bai-tren-mang-xa-hoi-post1821999.tpo",
        "https://tienphong.vn/thi-tot-nghiep-2026-nhung-dieu-can-luu-y-post1821888.tpo",
    ],
    "vtv": [
        "https://vtv.vn/video/thoi-su-23h-vtv1-07-3-2020-426076.htm",
        "https://vtv.vn/xa-hoi/nguoi-tre-va-xu-huong-nghe-nghiep-moi-202602101455123.htm",
        "https://vtv.vn/kinh-te/kinh-te-so-viet-nam-nam-2026-202602091230456.htm",
    ],
    "nld": [
        "https://nld.com.vn/nam-2026-mo-dau-ky-nguyen-phat-trien-moi-196260102190417496.htm",
        "https://nld.com.vn/nguoi-tre-truoc-nguong-cua-su-nghiep-196260210083344112.htm",
        "https://nld.com.vn/thi-cu-va-ap-luc-tam-ly-hoc-duong-196260205101122334.htm",
    ],
}

def main():
    print("Opening 9 random articles (1 per site)...")
    print("-" * 50)

    for site, urls in ARTICLES_BY_SITE.items():
        url = random.choice(urls)
        print(f"[+] {site}: {url}")
        webbrowser.open_new_tab(url)
        time.sleep(1)

    print("-" * 50)
    print("Done.")

if __name__ == "__main__":
    main()