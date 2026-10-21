// With the local preview open: playwright-cli run-code --filename tests/bilingual.js
async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const baseURL = new URL("/", page.url()).href;
  const buttons = lang => page.locator('[data-language="' + lang + '"]');
  const ready = () => page.waitForFunction(() => document.querySelectorAll("#if-table-body tr").length === 11);
  await ready();
  const citations = await page.locator(".publications").allTextContents();
  const links = await page.locator("a").evaluateAll(nodes => nodes.map(a => [a.getAttribute("href"), a.target, a.rel]));
  for (const lang of ["en", "zh", "en", "zh"]) {
    await buttons(lang).click();
    check(await page.locator("html").getAttribute("lang") === (lang === "zh" ? "zh-CN" : "en"), "Document language");
    check(await buttons(lang).getAttribute("aria-pressed") === "true", "Selected button state");
    check(await page.locator("#about-heading").textContent() === (lang === "zh" ? "关于我" : "About"), "Translated heading");
    check((await page.locator("#metrics-status").textContent()).includes(lang === "zh" ? "核验日期" : "sources verified"), "Dynamic metrics language");
    check(await page.locator("#snapshot-if").textContent() === "47.0", "Unchanged IF total");
    check(JSON.stringify(await page.locator(".publications").allTextContents()) === JSON.stringify(citations), "Unchanged citations");
    check(JSON.stringify(await page.locator("a").evaluateAll(nodes => nodes.map(a => [a.getAttribute("href"), a.target, a.rel]))) === JSON.stringify(links), "Unchanged links");
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready();
  check(await buttons("zh").getAttribute("aria-pressed") === "true", "Language survives reload");
  await buttons("en").focus();
  await page.keyboard.press("Enter");
  check(await buttons("en").getAttribute("aria-pressed") === "true", "Keyboard switching");
  for (const width of [320, 360, 375, 390, 414, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const lang of ["en", "zh"]) {
      await buttons(lang).click();
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal overflow at " + width + " in " + lang);
      check(await buttons(lang).evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), "Visible language switch at " + width);
    }
  }
  await page.locator(".if-details > summary").click();
  await page.route("**/assets/journal-metrics.json", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.locator("#refresh-metrics").click();
  await page.waitForFunction(() => document.querySelector("#metrics-status").textContent.includes("刷新失败"));
  await buttons("en").click();
  check((await page.locator("#metrics-status").textContent()).includes("could not refresh"), "Failure message switches language");
  await page.unroute("**/assets/journal-metrics.json");
  await page.locator("#refresh-metrics").click();
  await page.waitForFunction(() => document.querySelector("#metrics-status").textContent.includes("sources verified"));
  check(await page.locator("#if-table-body tr").count() === 11, "Metrics refresh recovers");
  const context = await page.context().browser().newContext({ locale: "en-US" });
  try {
    await context.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Blocked", "SecurityError"); } }));
    const isolated = await context.newPage();
    await isolated.goto(baseURL, { waitUntil: "domcontentloaded" });
    check(await isolated.locator("html").getAttribute("lang") === "en", "Browser language fallback");
    await isolated.getByRole("button", { name: "中文", exact: true }).click();
    check(await isolated.locator("html").getAttribute("lang") === "zh-CN", "Switch works when storage is blocked");
    await isolated.route("**/assets/profile.mjs*", route => route.abort());
    await isolated.reload({ waitUntil: "domcontentloaded" });
    check(await isolated.getByRole("button", { name: "中文", exact: true }).isVisible(), "Buttons remain visible when the external module fails");
    await isolated.getByRole("button", { name: "中文", exact: true }).click();
    check(await isolated.locator("#about-heading").textContent() === "关于我", "Switch works when the external module fails");
  } finally { await context.close(); }
  await page.locator(".if-details > summary").click();
  await buttons("zh").click();
  await page.evaluate(() => scrollTo(0, 0));
  return "PASS: bilingual buttons, persistence, keyboard, dynamic metrics, recovery, blocked storage, and responsive layout.";
}
