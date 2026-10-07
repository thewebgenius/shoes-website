/** Dev helper: screenshots pages at desktop and mobile sizes. Usage: tsx scripts/dev/screens.ts /path [/path...] */
import { chromium } from "@playwright/test";
(async () => {
  const out = process.env.OUT ?? "/tmp/claude-0/shots";
  const base = process.env.BASE ?? "http://localhost:3000";
  const wait = Number(process.env.WAIT ?? 2500);
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const path of process.argv.slice(2)) {
    for (const [label, vp] of [["desk", { width: 1440, height: 900 }], ["mob", { width: 390, height: 844 }]] as const) {
      if (process.env.ONLY && process.env.ONLY !== label) continue;
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: label === "mob", hasTouch: label === "mob" });
      const page = await ctx.newPage();
      page.on("console", (m) => { if (m.type() === "error") console.log(`[${label} ${path}] console:`, m.text().slice(0, 300)); });
      page.on("pageerror", (e) => console.log(`[${label} ${path}] pageerror:`, e.message.slice(0, 300)));
      await page.goto(base + path, { waitUntil: "networkidle" }).catch((e) => console.log("goto", e.message));
      await page.waitForTimeout(wait);
      const name = `${out}/${label}${path.replace(/[/?=&]/g, "_") || "_home"}.png`;
      await page.screenshot({ path: name, fullPage: process.env.FULL === "1" });
      console.log("shot", name);
      await ctx.close();
    }
  }
  await browser.close();
})();
