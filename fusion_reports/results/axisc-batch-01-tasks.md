# Axis C — 48-task pool, split into 5 batches for distribution

Created: 2026-05-10. **48 unique tasks total** (50 raw URLs deduped — `nu-sinh-lop-8-bi-bat` and `no-tai-benh-vien-tra-vinh` each appeared twice).
Source: `backend/output-fusion/scripts/sample-urls-dataset-50.json`.

## Slate per task (3 candidates each, randomized A/B/C)

1. **Fused** — `mode='fusion'` row from `evaluation_metrics` (P0-6 batch)
2. **gpt-4o-alone** — `mode='sync', model='gpt-4o-2024-08-06'` (P0-8 baseline)
3. **gpt-4o-mini draft** — proposer draft from `moa_draft_results`

## Distribution plan: 5 batches × ~10 tasks → 5 raters

| Batch | Range | Count | Send to |
|-------|-------|-------|---------|
| Bộ 1 | tasks 1–10  | 10 | Rater 1 |
| Bộ 2 | tasks 11–20 | 10 | Rater 2 |
| Bộ 3 | tasks 21–30 | 10 | Rater 3 |
| Bộ 4 | tasks 31–40 | 10 | Rater 4 |
| Bộ 5 | tasks 41–48 | 8  | Rater 5 |

> **Methodological caveat — read before sending:** This 1-rater-per-batch split means **no overlap** between raters, so **Fleiss' κ cannot be computed** (κ requires ≥2 raters per task). You'll get descriptive stats (per-approach win rate, avg rank) but no inter-rater agreement signal.
>
> If you want κ for the thesis: pick a **shared core** (e.g., 5–10 articles) that **every** rater does, then give each rater an additional ~5 unique articles. That trades volume for agreement-stat eligibility. Speak up if you want me to redo this split that way.

---

## Bộ 1 — Rater 1 (tasks 1–10)

| # | Article slug | Task ID |
|---|--------------|---------|
| 1 | chu-nhat-do-2026 | `e3846420-0198-4a24-be2f-bbb404a5c6f2` |
| 2 | ong-tran-sy-thanh-lang-son | `196ae630-7b03-4bb1-a51d-d79675401065` |
| 3 | nu-sinh-lop-8-nghe-an | `3615d799-d82f-484c-8afd-0a98cf262289` |
| 4 | vung-2-hai-quan-bau-cu-som | `ceb98960-259f-4e51-a065-18c8d3c635f7` |
| 5 | la-phieu-them-luc-dia-phia-nam | `b2928c45-2837-4adb-9799-15f9b60e54fe` |
| 6 | dong-bao-dak-lak-niem-tin-la-phieu | `1e14d8b4-cdb1-420c-9dac-cae0e7d6f009` |
| 7 | cuu-chien-binh-sua-nha-chu-nhat-do | `37c29e28-b1f2-4fd6-be9d-b028ed4990cd` |
| 8 | no-benh-vien-tra-vinh | `675737b4-0c30-4acd-9128-f122a50b1153` |
| 9 | giai-the-5-trung-tam-y-te-ca-mau | `fb7ffd17-92ec-413b-8582-0de4a04ed72d` |
| 10 | qua-bom-mong-nha-dan | `79f126d9-4e6f-4d68-afde-716ce82b5622` |

**Copy-paste block for Rater 1:**

```
https://fiber.vercel.app/evaluate?task=e3846420-0198-4a24-be2f-bbb404a5c6f2
https://fiber.vercel.app/evaluate?task=196ae630-7b03-4bb1-a51d-d79675401065
https://fiber.vercel.app/evaluate?task=3615d799-d82f-484c-8afd-0a98cf262289
https://fiber.vercel.app/evaluate?task=ceb98960-259f-4e51-a065-18c8d3c635f7
https://fiber.vercel.app/evaluate?task=b2928c45-2837-4adb-9799-15f9b60e54fe
https://fiber.vercel.app/evaluate?task=1e14d8b4-cdb1-420c-9dac-cae0e7d6f009
https://fiber.vercel.app/evaluate?task=37c29e28-b1f2-4fd6-be9d-b028ed4990cd
https://fiber.vercel.app/evaluate?task=675737b4-0c30-4acd-9128-f122a50b1153
https://fiber.vercel.app/evaluate?task=fb7ffd17-92ec-413b-8582-0de4a04ed72d
https://fiber.vercel.app/evaluate?task=79f126d9-4e6f-4d68-afde-716ce82b5622
```

---

## Bộ 2 — Rater 2 (tasks 11–20)

| # | Article slug | Task ID |
|---|--------------|---------|
| 11 | khoi-to-bat-coc-ep-chuyen-tien | `5258ac07-b56a-4d2b-a50f-3c66b968deb4` |
| 12 | con-duong-an-tu-trum-ma-tuy | `23bdc5d5-c06c-4cd9-af78-27fe8213805e` |
| 13 | hai-nguoi-thuong-vong-vo-co-tan-cong | `0442a077-c0b1-4ede-8b5e-ce599729f7bf` |
| 14 | dot-nhap-pha-ket-sat-1-ty | `7ce8429b-bbbb-494a-a26f-0ddd25b80ff7` |
| 15 | nu-quai-lua-ban-5-tre-em | `0b1168d9-3d0d-4a9a-8ae7-49a390016d9e` |
| 16 | giam-doc-cong-an-ha-noi-drone | `765a548b-3317-4b47-9de1-04c14949e062` |
| 17 | bv-bach-mai-viet-duc-co-so-2 | `4396db59-2789-4692-9c57-123a72272632` |
| 18 | bat-18-quai-xe-hung-khi | `f045f3b2-589a-43db-a681-5c693b0c3950` |
| 19 | duong-day-mua-ban-gan-than | `f291ac1b-4a81-4dd0-a075-3a325cc29cac` |
| 20 | my-israel-tan-cong-iran-dau-mo | `14818c7d-bbaa-4f23-b788-8bc9bef8aabe` |

**Copy-paste block for Rater 2:**

```
https://fiber.vercel.app/evaluate?task=5258ac07-b56a-4d2b-a50f-3c66b968deb4
https://fiber.vercel.app/evaluate?task=23bdc5d5-c06c-4cd9-af78-27fe8213805e
https://fiber.vercel.app/evaluate?task=0442a077-c0b1-4ede-8b5e-ce599729f7bf
https://fiber.vercel.app/evaluate?task=7ce8429b-bbbb-494a-a26f-0ddd25b80ff7
https://fiber.vercel.app/evaluate?task=0b1168d9-3d0d-4a9a-8ae7-49a390016d9e
https://fiber.vercel.app/evaluate?task=765a548b-3317-4b47-9de1-04c14949e062
https://fiber.vercel.app/evaluate?task=4396db59-2789-4692-9c57-123a72272632
https://fiber.vercel.app/evaluate?task=f045f3b2-589a-43db-a681-5c693b0c3950
https://fiber.vercel.app/evaluate?task=f291ac1b-4a81-4dd0-a075-3a325cc29cac
https://fiber.vercel.app/evaluate?task=14818c7d-bbaa-4f23-b788-8bc9bef8aabe
```

---

## Bộ 3 — Rater 3 (tasks 21–30)

| # | Article slug | Task ID |
|---|--------------|---------|
| 21 | ruoc-bien-quang-tri-boi-thu | `a1122a23-15a3-41b1-a7e8-594b1efe527b` |
| 22 | cao-toc-cao-lanh-an-huu | `c6e1e07f-6a1d-41fa-9edf-1beff67750ce` |
| 23 | hang-hoa-cua-khau-quang-ninh | `61cada22-47f7-4aaa-a0ae-8916686725be` |
| 24 | doanh-nghiep-dua-co-phieu | `03ca3e56-81c8-447b-9b7c-eabb4bd1c9f3` |
| 25 | thu-tuong-san-bay-phu-cat | `787b3482-bd5b-442b-b2ea-3d6f6080e417` |
| 26 | thu-tuong-cao-toc-quang-ngai | `874d79d4-77c1-4f8a-acd9-112d818a8a02` |
| 27 | doanh-nghiep-ung-cu-quoc-hoi | `034f38ca-5237-485b-8b8a-69a88444e72c` |
| 28 | doanh-nghiep-thoai-von-bat-thanh | `3d830337-8c73-487a-9479-978fdc391449` |
| 29 | gia-dau-vang-iran | `04978002-7adf-4ed5-9de4-bb97ecb92e90` |
| 30 | hoc-sinh-da-nang-robotics-drone | `cd7cb661-7ac0-4c0f-a369-b4bd8610f2c2` |

**Copy-paste block for Rater 3:**

```
https://fiber.vercel.app/evaluate?task=a1122a23-15a3-41b1-a7e8-594b1efe527b
https://fiber.vercel.app/evaluate?task=c6e1e07f-6a1d-41fa-9edf-1beff67750ce
https://fiber.vercel.app/evaluate?task=61cada22-47f7-4aaa-a0ae-8916686725be
https://fiber.vercel.app/evaluate?task=03ca3e56-81c8-447b-9b7c-eabb4bd1c9f3
https://fiber.vercel.app/evaluate?task=787b3482-bd5b-442b-b2ea-3d6f6080e417
https://fiber.vercel.app/evaluate?task=874d79d4-77c1-4f8a-acd9-112d818a8a02
https://fiber.vercel.app/evaluate?task=034f38ca-5237-485b-8b8a-69a88444e72c
https://fiber.vercel.app/evaluate?task=3d830337-8c73-487a-9479-978fdc391449
https://fiber.vercel.app/evaluate?task=04978002-7adf-4ed5-9de4-bb97ecb92e90
https://fiber.vercel.app/evaluate?task=cd7cb661-7ac0-4c0f-a369-b4bd8610f2c2
```

---

## Bộ 4 — Rater 4 (tasks 31–40)

| # | Article slug | Task ID |
|---|--------------|---------|
| 31 | pham-manh-ha-thich-nghi-cuoc-song | `74e215c9-1ad8-4349-85db-5f5b70663c61` |
| 32 | nu-sinh-lop-8-sau-tet | `4a1b68e3-9ff6-4454-bbf4-10bbad76c30c` |
| 33 | ha-noi-thi-tuyen-lop-10 | `ed13e2b1-112e-4642-a2c8-da121d331b9e` |
| 34 | hoang-minh-son-quyen-bo-truong-gd | `8d2aba1e-157f-474c-b287-981226a6b2f1` |
| 35 | hoc-sinh-day-khoi-nghiep-tieu-hoc | `344fccd6-572c-4528-96fd-e0fccf99ed7b` |
| 36 | dao-tao-y-khoa-giang-duong | `c6eb9fc6-a0c5-401d-a7ef-5ace722257f2` |
| 37 | ha-noi-300-ty-1000-tien-si | `8478be5f-1b33-4ebe-9d27-fef13394a585` |
| 38 | giao-vien-bat-35-hoc-sinh-liem-dat | `e36140b4-cd2d-49ed-beae-adbe60ee8a4a` |
| 39 | hoa-hau-vn-chua-2000-nam-bac-ninh | `bb20933b-faa9-4117-824b-a675f9555db0` |
| 40 | song-day-xem-do-vat | `6d5d318a-081f-4639-a932-0bb77ad15206` |

**Copy-paste block for Rater 4:**

```
https://fiber.vercel.app/evaluate?task=74e215c9-1ad8-4349-85db-5f5b70663c61
https://fiber.vercel.app/evaluate?task=4a1b68e3-9ff6-4454-bbf4-10bbad76c30c
https://fiber.vercel.app/evaluate?task=ed13e2b1-112e-4642-a2c8-da121d331b9e
https://fiber.vercel.app/evaluate?task=8d2aba1e-157f-474c-b287-981226a6b2f1
https://fiber.vercel.app/evaluate?task=344fccd6-572c-4528-96fd-e0fccf99ed7b
https://fiber.vercel.app/evaluate?task=c6eb9fc6-a0c5-401d-a7ef-5ace722257f2
https://fiber.vercel.app/evaluate?task=8478be5f-1b33-4ebe-9d27-fef13394a585
https://fiber.vercel.app/evaluate?task=e36140b4-cd2d-49ed-beae-adbe60ee8a4a
https://fiber.vercel.app/evaluate?task=bb20933b-faa9-4117-824b-a675f9555db0
https://fiber.vercel.app/evaluate?task=6d5d318a-081f-4639-a932-0bb77ad15206
```

---

## Bộ 5 — Rater 5 (tasks 41–48, **8 articles**)

| # | Article slug | Task ID |
|---|--------------|---------|
| 41 | cau-cung-quanh-nam-ram-thang-gieng | `6d52f008-bc94-4da6-8afe-76db8acc315c` |
| 42 | ha-truc-linh-bac-ninh-di-san | `21d1437d-b75c-4164-98fc-82f94aac419d` |
| 43 | nhac-trinh-song-huong | `d3d356e2-5aa7-4243-b975-0871be04aedf` |
| 44 | nsnd-trinh-thuy-mui-quoc-hoi | `077b4fab-e4a3-462a-aef9-02ddd3a46d38` |
| 45 | quan-ho-don-tim-hoi-lim | `c1cd2d19-80f3-4cc3-9495-08e12c4ef2fd` |
| 46 | bao-han-kinh-ngac-viet-nam | `9b9510b4-3e34-488f-953f-f85afe935152` |
| 47 | dinh-van-ruoc-lua-thieng-nua-dem | `55975bd0-6059-4b59-8aaa-37171b70ac18` |
| 48 | le-ruoc-co-ba-cho-trong-dem | `1d720ab7-151e-4cd3-aa05-d4206b5e32dd` |

**Copy-paste block for Rater 5:**

```
https://fiber.vercel.app/evaluate?task=6d52f008-bc94-4da6-8afe-76db8acc315c
https://fiber.vercel.app/evaluate?task=21d1437d-b75c-4164-98fc-82f94aac419d
https://fiber.vercel.app/evaluate?task=d3d356e2-5aa7-4243-b975-0871be04aedf
https://fiber.vercel.app/evaluate?task=077b4fab-e4a3-462a-aef9-02ddd3a46d38
https://fiber.vercel.app/evaluate?task=c1cd2d19-80f3-4cc3-9495-08e12c4ef2fd
https://fiber.vercel.app/evaluate?task=9b9510b4-3e34-488f-953f-f85afe935152
https://fiber.vercel.app/evaluate?task=55975bd0-6059-4b59-8aaa-37171b70ac18
https://fiber.vercel.app/evaluate?task=1d720ab7-151e-4cd3-aa05-d4206b5e32dd
```

---

## Vietnamese message template (paste-ready for raters)

> Chào bạn,
>
> Mình đang làm khoá luận về tóm tắt báo tiếng Việt và cần bạn giúp đánh giá ~10 bài (mỗi bài ~3–5 phút). Mỗi link dưới đây dẫn đến 1 bài báo + 3 bản tóm tắt (Bản A, Bản B, Bản C — không tiết lộ mô hình nào). Bạn chỉ cần kéo-thả để xếp hạng từ tốt nhất đến tệ nhất, kèm 1 câu lý do cho mỗi bản.
>
> Khi mở link đầu tiên, hãy nhập tên (hoặc bí danh) của bạn vào ô **Mã người đánh giá** ở đầu trang — dùng cùng một mã cho cả 10 link để hệ thống biết là cùng một người.
>
> Cảm ơn bạn rất nhiều! 🙏
>
> [paste copy-paste block here]

---

## Share URL pattern (for re-running the script later)

`https://fiber.vercel.app/evaluate?task=<task_id>`

For future runs of `setup-axisc-batch.ts`, export `NEXT_PUBLIC_SITE_URL=https://fiber.vercel.app` so the script prints production URLs directly. The default fallback is `http://localhost:3000`.

## Admin review

`https://fiber.vercel.app/evaluate/admin` → Review tab. Per-approach avg-rank + win-rate render automatically once responses come in. Fleiss κ requires ≥2 raters per task — won't compute under the current 1-rater-per-batch split.

> **Deployment note (2026-05-10):** Confirmed end-to-end on prod. Task READ + response WRITE both work against the live Supabase project (`gmjvksmandreuefogivk`). One fix landed: `lib/supabase.ts` now passes `cache: 'no-store'` on every Supabase fetch — without it, Next.js's data cache served stale `/report` responses (the smoke insert lingered in the cached payload after deletion). **Redeploy the backend after this commit lands so the admin Review tab + `/api/human-eval/report` show fresh aggregates as raters submit.**

## Acceptance bar (descriptive-only, no κ)

- 5 raters × ~10 tasks each = ≥48 rows in `human_eval_responses` (1 per task)
- Per-approach win rate + avg rank computable across the pool
- **Fleiss κ NOT computable** with this split (no overlap between raters)
- If thesis defense expects κ, redesign: 5–10 shared "core" tasks every rater does + ~5 unique each
