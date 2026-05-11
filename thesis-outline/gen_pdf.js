const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Define full path to the local HTML file
  const htmlPath = 'file://' + path.resolve(__dirname, 'outline-updated.html');

  // Navigate to the file and wait until network is idle
  await page.goto(htmlPath, { waitUntil: 'networkidle0' });

  // Add some extra CSS to handle page numbering correctly in print media
  await page.addStyleTag({
    content: `
      @page {
        margin: 2.5cm 2.5cm 2.5cm 3cm;
      }
    `
  });

  // Generate PDF
  const pdfPath = path.resolve(__dirname, 'outline-updated.pdf');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `
      <div style="width: 100%; text-align: center; font-size: 11pt; font-family: 'Times New Roman', Times, serif;">
        <span class="pageNumber"></span>
      </div>
    `,
    margin: {
      top: '2.5cm',
      right: '2.5cm',
      bottom: '2.5cm',
      left: '3cm'
    }
  });

  await browser.close();
  console.log(`PDF successfully generated at: ${pdfPath}`);
})();
