// Native fetch is available in Node 18+. TSX handles it.

const API_BASE_URL = 'http://localhost:3000/api';

const TEST_URLS = [
    'https://vnexpress.net/bo-truong-tai-chinh-giam-giay-phep-kinh-doanh-toi-thieu-50-nganh-nghe-4986741.html',
    'https://vnexpress.net/thoi-su/ho-con-rua-va-giai-thoai-tran-yem-long-mach-o-sai-gon-3455791.html',
    'https://vnexpress.net/kinh-doanh/cong-ty-cua-dai-gia-duong-ngoc-minh-lo-dam-4004007.html',
    'https://vnexpress.net/giai-tri-voi-trung-phuc-sinh-trong-phan-mem-1531410.html',
    'https://vnexpress.net/suc-khoe-cam-nang-cac-benh-phong-cui-4681769.html',
    'https://vnexpress.net/suc-khoe-cam-nang-5-trieu-chung-gan-ton-thuong-do-benh-tieu-duong-4894622.html',
    'https://vnexpress.net/suc-khoe-sinh-ly-nu-thay-doi-the-nao-theo-tuoi-tac-4996742.html',
    'https://vnexpress.net/suc-khoe-cam-nang-7-dau-hieu-canh-bao-than-keu-cuu-4912705.html',
    'https://vnexpress.net/thoi-su/ly-do-nha-nong-su-dung-phan-trun-que-3986629.html',
    'https://vnexpress.net/thoi-su/tieu-chuan-chung-nhan-huu-co-o-viet-nam-3979983.html',
];

async function generateData() {
    console.log('Starting data generation...');
    
    // Shuffle URLs to be random
    const shuffled = TEST_URLS.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 10); // Take 10

    for (let i = 0; i < selected.length; i++) {
        const url = selected[i];
        const isStreaming = Math.random() > 0.5;
        const endpoint = `${API_BASE_URL}/summarize${isStreaming ? '?stream=true' : ''}`;
        
        console.log(`[${i + 1}/10] Processing: ${url} (Stream: ${isStreaming})`);

        try {
            const startTime = Date.now();
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (isStreaming) {
                // Consume the stream
                const reader = response.body?.getReader();
                if (reader) {
                    while (true) {
                        const { done } = await reader.read();
                        if (done) break;
                    }
                }
            } else {
                await response.json();
            }
            
            const duration = Date.now() - startTime;
            console.log(`  ✓ Completed in ${duration}ms`);

        } catch (error) {
            console.error(`  ✗ Failed: ${error}`);
        }

        // Wait a bit to avoid rate limits
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('Data generation complete!');
}

generateData().catch(console.error);
