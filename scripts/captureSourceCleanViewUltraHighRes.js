const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\shlok\\.gemini\\antigravity\\brain\\fd0706c6-8455-421a-9f28-8f9eb2858be6';
const DELIVERABLES_DIR = path.resolve(__dirname, '../deliverables');

if (!fs.existsSync(DELIVERABLES_DIR)) {
  fs.mkdirSync(DELIVERABLES_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('--- Launching Chrome for Ultra-High-Res Source Clean View Capture ---');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--window-size=1920,1080',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--hide-scrollbars'
    ],
    defaultViewport: {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2
    }
  });

  const page = await browser.newPage();
  page.on('dialog', async d => await d.dismiss());

  console.log('Navigating to http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(2500);

  // Click 'Source Clean Viewer' tab if available to ensure it's selected
  const cleanViewerBtn = await page.$('button ::-p-text(Source Clean Viewer)');
  if (cleanViewerBtn) {
    console.log('Clicking Source Clean Viewer tab...');
    await cleanViewerBtn.click();
    await sleep(1500);
  }

  // Wait for the SVG canvas to be present
  await page.waitForSelector('svg', { timeout: 10000 });
  await sleep(1000);

  // Extract the SVG XML
  const svgData = await page.evaluate(() => {
    const svgs = Array.from(document.querySelectorAll('svg'));
    const pidSvg = svgs.find(s => s.getAttribute('viewBox') && s.getAttribute('viewBox').includes('6144'));
    if (!pidSvg) {
      const fallback = svgs.find(s => s.querySelector('#canvas-background-rect') || s.getAttribute('width') === '6144');
      if (fallback) {
        const clone = fallback.cloneNode(true);
        clone.removeAttribute('style');
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('width', '6144');
        clone.setAttribute('height', '4096');
        return clone.outerHTML;
      }
      return null;
    }
    const clone = pidSvg.cloneNode(true);
    clone.removeAttribute('style');
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', '6144');
    clone.setAttribute('height', '4096');
    return clone.outerHTML;
  });

  if (!svgData) {
    console.error('Could not find 6144x4096 P&ID SVG on page!');
    await browser.close();
    process.exit(1);
  }

  console.log(`Extracted clean SVG (${(svgData.length / 1024).toFixed(1)} KB)`);

  // Save SVG vector files (infinite zoom resolution)
  const svgDestDeliverables = path.join(DELIVERABLES_DIR, 'Source_Clean_View_PID_GPF_001_02.svg');
  const svgDestArtifact = path.join(ARTIFACT_DIR, 'Source_Clean_View_PID_GPF_001_02.svg');
  fs.writeFileSync(svgDestDeliverables, svgData, 'utf8');
  fs.writeFileSync(svgDestArtifact, svgData, 'utf8');

  // Now render ultra-high-resolution PNG (6144 x 4096 at deviceScaleFactor: 2 = 12288 x 8192 effective pixels)
  console.log('\nRendering 6144x4096 (2x Retina Super-Sampled) Ultra-HD PNG...');
  const renderPage = await browser.newPage();
  await renderPage.setViewport({
    width: 6144,
    height: 4096,
    deviceScaleFactor: 2
  });

  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 6144px;
      height: 4096px;
      overflow: hidden;
      background-color: #ffffff;
      font-family: system-ui, -apple-system, sans-serif;
    }
    svg {
      display: block;
      width: 6144px;
      height: 4096px;
    }
  </style>
</head>
<body>
  ${svgData}
</body>
</html>`;

  await renderPage.setContent(htmlContent, { waitUntil: 'networkidle0' });
  await sleep(1500);

  const pngDestDeliverables = path.join(DELIVERABLES_DIR, 'Source_Clean_View_PID_GPF_001_02_UltraHD.png');
  const pngDestArtifact = path.join(ARTIFACT_DIR, 'Source_Clean_View_PID_GPF_001_02_UltraHD.png');

  await renderPage.screenshot({
    path: pngDestDeliverables,
    type: 'png',
    fullPage: false,
    clip: { x: 0, y: 0, width: 6144, height: 4096 }
  });
  fs.copyFileSync(pngDestDeliverables, pngDestArtifact);

  const stats = fs.statSync(pngDestDeliverables);
  console.log(`Full Ultra-HD PNG: ${(stats.size / 1024).toFixed(1)} KB (12288 x 8192 effective resolution)`);

  // Render Zoom Detail 1: Core Process Unit (PG-1001 Vessel, XV-1001, XV-1002, PCV-1001, CV-1001, LCV-1001, BDV-1001)
  console.log('\nRendering Zoomed Detail 1: Core Process Unit (PG-1001)...');
  const cropVesselPath = path.join(DELIVERABLES_DIR, 'Source_Clean_View_PG1001_Detail_Zoom.png');
  const cropVesselArtifact = path.join(ARTIFACT_DIR, 'Source_Clean_View_PG1001_Detail_Zoom.png');
  await renderPage.screenshot({
    path: cropVesselPath,
    type: 'png',
    clip: { x: 300, y: 1350, width: 5500, height: 1600 }
  });
  fs.copyFileSync(cropVesselPath, cropVesselArtifact);
  console.log('Saved:', cropVesselArtifact);

  // Render Zoom Detail 2: Engineering Tables & Title Block
  console.log('\nRendering Zoomed Detail 2: Engineering Tables & Title Block...');
  const cropTablesPath = path.join(DELIVERABLES_DIR, 'Source_Clean_View_Tables_TitleBlock_Zoom.png');
  const cropTablesArtifact = path.join(ARTIFACT_DIR, 'Source_Clean_View_Tables_TitleBlock_Zoom.png');
  await renderPage.screenshot({
    path: cropTablesPath,
    type: 'png',
    clip: { x: 30, y: 3500, width: 6080, height: 550 }
  });
  fs.copyFileSync(cropTablesPath, cropTablesArtifact);
  console.log('Saved:', cropTablesArtifact);

  // Render Zoom Detail 3: General Engineering Notes 1-7
  console.log('\nRendering Zoomed Detail 3: General Engineering Notes...');
  const cropNotesPath = path.join(DELIVERABLES_DIR, 'Source_Clean_View_Notes_Zoom.png');
  const cropNotesArtifact = path.join(ARTIFACT_DIR, 'Source_Clean_View_Notes_Zoom.png');
  await renderPage.screenshot({
    path: cropNotesPath,
    type: 'png',
    clip: { x: 4900, y: 30, width: 1200, height: 800 }
  });
  fs.copyFileSync(cropNotesPath, cropNotesArtifact);
  console.log('Saved:', cropNotesArtifact);

  await browser.close();
  console.log('\n--- All Ultra-HD Renders & Zoom Details Generated Successfully ---');
}

run().catch(err => {
  console.error('Error rendering ultra high-res image:', err);
  process.exit(1);
});
