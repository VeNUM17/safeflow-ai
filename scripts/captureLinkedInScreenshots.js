const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = path.resolve(__dirname, '../SafeFlow_AI_LinkedIn_Screenshots');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runCapture() {
  console.log('--- Starting SafeFlow AI LinkedIn Screenshot Automation ---');
  console.log('Chrome Binary:', CHROME_PATH);
  console.log('Output Directory:', OUTPUT_DIR);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--window-size=1920,1080',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--force-device-scale-factor=2',
      '--hide-scrollbars'
    ],
    defaultViewport: {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2
    }
  });

  const page = await browser.newPage();

  // Set standard clean user agent and avoid alert dialogs hanging the script
  page.on('dialog', async dialog => {
    console.log(`[Browser Dialog] Dismissing dialog: "${dialog.message()}"`);
    await dialog.dismiss();
  });

  console.log('\nNavigating to http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(2500);

  // Helper: Click by text
  async function clickButtonWithText(text, exact = false) {
    const buttons = await page.$$('button, a, select, div[role="button"]');
    for (const b of buttons) {
      const content = await page.evaluate(el => el.innerText || el.textContent, b);
      if (exact ? content.trim() === text : content.includes(text)) {
        await b.click();
        return true;
      }
    }
    return false;
  }

  // Ensure "OSHA PSM Ammonia Refrigeration & Dosing Loop" project is selected
  try {
    const projectSelect = await page.$('select');
    if (projectSelect) {
      await page.evaluate(el => {
        const options = Array.from(el.options);
        const demoOpt = options.find(o => o.value.includes('ammonia') || o.text.includes('Ammonia'));
        if (demoOpt) {
          el.value = demoOpt.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, projectSelect);
      await sleep(1500);
    }
  } catch (e) {
    console.log('Project select note:', e.message);
  }

  // =========================================================================
  // 1. DASHBOARD OVERVIEW (01_Dashboard.png)
  // =========================================================================
  console.log('\n[1/7] Capturing 01_Dashboard.png ...');
  // Switch to workspace tab first
  await clickButtonWithText('PSI Review');
  await sleep(1200);

  // Scroll to reveal the full KPI Dashboard and completeness gauge
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(800);

  await page.screenshot({
    path: path.join(OUTPUT_DIR, '01_Dashboard.png'),
    clip: { x: 0, y: 0, width: 1920, height: 1080 }
  });
  console.log('Saved: 01_Dashboard.png');

  // =========================================================================
  // 2. DOCUMENT UPLOAD MODAL (02_Document_Upload.png)
  // =========================================================================
  console.log('\n[2/7] Capturing 02_Document_Upload.png ...');
  const uploadClicked = await clickButtonWithText('Upload Files');
  if (uploadClicked) {
    await sleep(1200);
    await page.screenshot({
      path: path.join(OUTPUT_DIR, '02_Document_Upload.png'),
      clip: { x: 0, y: 0, width: 1920, height: 1080 }
    });
    console.log('Saved: 02_Document_Upload.png');

    // Close upload modal
    const closeBtn = await page.$('button[title="Close"], button[aria-label="Close"], button:has(svg.lucide-x)');
    if (closeBtn) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await sleep(800);
  } else {
    console.warn('Could not find Upload Files button, trying documents tab...');
    await clickButtonWithText('Docs');
    await sleep(1000);
    await page.screenshot({
      path: path.join(OUTPUT_DIR, '02_Document_Upload.png'),
      clip: { x: 0, y: 0, width: 1920, height: 1080 }
    });
    console.log('Saved: 02_Document_Upload.png (Docs view)');
  }

  // =========================================================================
  // 3. PSI EXTRACTION RESULTS (03_PSI_Extraction.png)
  // =========================================================================
  console.log('\n[3/7] Capturing 03_PSI_Extraction.png ...');
  await clickButtonWithText('PSI Review');
  await sleep(1200);

  // Ensure Anhydrous Ammonia is selected in the chemical sidebar
  const ammoniaItem = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('div, button'));
    const nh3 = items.find(el => el.innerText && el.innerText.includes('Anhydrous Ammonia'));
    if (nh3) {
      nh3.click();
      return true;
    }
    return false;
  });
  await sleep(1000);

  // Scroll slightly down to center all seven OSHA 1910.119(d)(1) parameter cards
  await page.evaluate(() => {
    const mainWorkspace = document.querySelector('main');
    if (mainWorkspace) {
      mainWorkspace.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  });
  await sleep(800);

  await page.screenshot({
    path: path.join(OUTPUT_DIR, '03_PSI_Extraction.png'),
    clip: { x: 0, y: 0, width: 1920, height: 1080 }
  });
  console.log('Saved: 03_PSI_Extraction.png');

  // =========================================================================
  // 4. P&ID ANALYSIS & DIGITAL EDITOR (04_PID_Analysis.png)
  // =========================================================================
  console.log('\n[4/7] Capturing 04_PID_Analysis.png ...');
  await clickButtonWithText('P&ID Map');
  await sleep(1500);

  // Open the Digital P&ID Editor Studio subtab
  const studioOpened = await clickButtonWithText('Digital P&ID Editor Studio') || await clickButtonWithText('Digital P&ID Editor');
  await sleep(2000);

  await page.screenshot({
    path: path.join(OUTPUT_DIR, '04_PID_Analysis.png'),
    clip: { x: 0, y: 0, width: 1920, height: 1080 }
  });
  console.log('Saved: 04_PID_Analysis.png');

  // =========================================================================
  // 5. PHA ENGINE & NODE IDENTIFICATION (05_PHA_Engine.png)
  // =========================================================================
  console.log('\n[5/7] Capturing 05_PHA_Engine.png ...');
  // Exit back to workflow or click PHA subtab
  await clickButtonWithText('Process Graph Editor') || await clickButtonWithText('Topology');
  await sleep(1000);
  await clickButtonWithText('PHA Study Nodes') || await clickButtonWithText('HAZOP Analysis') || await clickButtonWithText('PHA Study Nodes & HAZOP Analysis');
  await sleep(1500);

  // Scroll to show the node details and flow deviations
  await page.evaluate(() => window.scrollTo(0, 180));
  await sleep(800);

  await page.screenshot({
    path: path.join(OUTPUT_DIR, '05_PHA_Engine.png'),
    clip: { x: 0, y: 0, width: 1920, height: 1080 }
  });
  console.log('Saved: 05_PHA_Engine.png');

  // =========================================================================
  // 6. EQUIPMENT INTELLIGENCE & ENGINEERING MATRIX (06_Equipment_Intelligence.png)
  // =========================================================================
  console.log('\n[6/7] Capturing 06_Equipment_Intelligence.png ...');
  await clickButtonWithText('Unified Matrix');
  await sleep(1800);

  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(800);

  await page.screenshot({
    path: path.join(OUTPUT_DIR, '06_Equipment_Intelligence.png'),
    clip: { x: 0, y: 0, width: 1920, height: 1080 }
  });
  console.log('Saved: 06_Equipment_Intelligence.png');

  // =========================================================================
  // 7. MANUAL EDITING & CHEMICAL ENTRY (07_Manual_Editing.png)
  // =========================================================================
  console.log('\n[7/7] Capturing 07_Manual_Editing.png ...');
  await clickButtonWithText('PSI Review');
  await sleep(1000);

  // Click "+ Add Chemical" or "New Chemical" button
  const addChemClicked = await clickButtonWithText('Add Chemical') || await clickButtonWithText('New Chemical') || await clickButtonWithText('Create Chemical');
  if (addChemClicked) {
    await sleep(1200);

    // Populate a sample chemical name to make the modal look actively engaged
    try {
      const chemNameInput = await page.$('input[placeholder*="Ammonia"], input[placeholder*="chemical"], input[name="chemical_name"]');
      if (chemNameInput) {
        await chemNameInput.type('Anhydrous Ammonia (Refrigeration Grade)', { delay: 20 });
      }
    } catch (e) {
      console.log('Input fill note:', e.message);
    }

    await sleep(600);
    await page.screenshot({
      path: path.join(OUTPUT_DIR, '07_Manual_Editing.png'),
      clip: { x: 0, y: 0, width: 1920, height: 1080 }
    });
    console.log('Saved: 07_Manual_Editing.png');

    // Close modal
    await page.keyboard.press('Escape');
    await sleep(800);
  }

  // =========================================================================
  // BONUS: DISCREPANCY MANAGER (08_Discrepancy_Manager.png)
  // =========================================================================
  console.log('\n[Bonus 1] Capturing 08_Discrepancy_Manager.png ...');
  await clickButtonWithText('Discrepancies');
  await sleep(1500);

  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(800);

  await page.screenshot({
    path: path.join(OUTPUT_DIR, '08_Discrepancy_Manager.png'),
    clip: { x: 0, y: 0, width: 1920, height: 1080 }
  });
  console.log('Saved: 08_Discrepancy_Manager.png');

  // =========================================================================
  // BONUS: CHEMICAL INVENTORY & PROCESS MAPPING (09_Chemical_Inventory_Mapping.png)
  // =========================================================================
  console.log('\n[Bonus 2] Capturing 09_Chemical_Inventory_Mapping.png ...');
  await clickButtonWithText('Chemicals & Mapping');
  await sleep(1500);

  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(800);

  await page.screenshot({
    path: path.join(OUTPUT_DIR, '09_Chemical_Inventory_Mapping.png'),
    clip: { x: 0, y: 0, width: 1920, height: 1080 }
  });
  console.log('Saved: 09_Chemical_Inventory_Mapping.png');

  console.log('\n--- All Screenshots Successfully Captured! ---');
  await browser.close();
}

runCapture().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
