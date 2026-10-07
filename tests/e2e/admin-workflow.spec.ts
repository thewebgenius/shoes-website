import { expect, test } from "@playwright/test";
import { FIX, expectNotPublic, expectRendered3D, login } from "./helpers";

/**
 * 88.17 admin workflow, end to end:
 * LOGIN → ADD SHOE → UPLOAD RAW IMAGE → AI IMAGE PROCESSING → VERIFY METADATA →
 * UPLOAD/ASSIGN 3D MODEL → PREVIEW → APPROVAL → PUBLISH → APPEARS IN 3D SHOWROOM
 */
test("shopkeeper adds a shoe and it appears in the showroom only after approval", async ({ page }, info) => {
  const name = `E2E Trail Shoe ${info.project.name} ${Date.now().toString(36)}`;
  await login(page);

  // Add shoe
  await page.goto("/admin/products/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Category (showroom section)").selectOption("men");
  await page.getByRole("button", { name: "Create draft & add photo" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}\?created=1/);
  const productUrl = page.url().split("?")[0];
  const productId = productUrl.split("/").pop()!;

  // Not public while draft
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await expectNotPublic(page, slug, name);

  // Submitting too early is refused with a clear reason
  await page.getByRole("button", { name: "Submit for approval" }).first().click();
  await expect(page.getByText(/Before submitting, add a processed product image, a 3D model, verified metadata/)).toBeVisible();

  // Upload raw image → processing pipeline
  await page.getByTestId("raw-image-input").setInputFiles(FIX("raw-shoe.jpg"));
  await expect(page.getByText(/Photo processed|Processed with warnings/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Background removal:")).toBeVisible();
  await expect(page.getByRole("img", { name: "Processed product" })).toBeVisible();

  // AI metadata suggestions are shown but flagged
  await expect(page.getByText("AI suggestions").first()).toBeVisible();
  await expect(page.getByText("Needs verification").first()).toBeVisible();

  // Verify metadata
  // Next keeps the outgoing page in a display:none holder after the redirect, so
  // match the form the shopkeeper can actually see.
  await page.locator("#shoeType").locator("visible=true").fill("Hiking boot");
  await page.locator("#color").locator("visible=true").fill("Stone / Olive");
  await page.locator("#description").locator("visible=true").fill("A rugged hiker used in automated tests.");
  await page.getByRole("checkbox", { name: /I have checked these details/ }).check();
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Saved. Metadata marked as verified.")).toBeVisible();

  // Upload a GLB model
  await page.getByTestId("model-input").setInputFiles(FIX("model.glb"));
  await expect(page.getByText(/Model uploaded \(/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Store-uploaded 3D model")).toBeVisible();

  // Invalid model rejected
  await page.getByTestId("model-input").setInputFiles(FIX("fake.glb"));
  await expect(page.getByText(/Only glTF 2.0 models|truncated or malformed|could not be parsed|not a binary glTF/)).toBeVisible();

  // Submit → preview
  await page.getByRole("button", { name: "Submit for approval" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/admin/products/${productId}/preview`));
  await expect(page.getByText("Awaiting approval").first()).toBeVisible();
  await expect(page.getByText("Verified by staff")).toBeVisible();
  await expectRendered3D(page);

  // Still not public while awaiting approval
  await expectNotPublic(page, slug, name);

  // Approve & publish
  await page.getByRole("button", { name: "Approve & publish" }).click();
  await expect(page.getByText("Approved and published.")).toBeVisible();

  // Appears publicly and in the 3D showroom
  await page.goto("/showroom/men");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await page.goto(`/products/${slug}`);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expectRendered3D(page);

  // Clean up: unpublish then archive so repeated runs don't fill the showroom
  await page.goto(productUrl);
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByText("Unpublished.").first()).toBeVisible();
  await expectNotPublic(page, slug, name);
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("Archived.").first()).toBeVisible();
});

test("rejecting a submitted shoe keeps it private and records the reason", async ({ page }, info) => {
  const name = `E2E Reject ${info.project.name} ${Date.now().toString(36)}`;
  await login(page);
  await page.goto("/admin/products/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Category (showroom section)").selectOption("kids");
  await page.getByRole("button", { name: "Create draft & add photo" }).click();
  await page.getByTestId("raw-image-input").setInputFiles(FIX("raw-shoe.jpg"));
  await expect(page.getByText(/Photo processed|Processed with warnings/)).toBeVisible({ timeout: 60_000 });
  await page.locator("select#sample").selectOption("kids-high-lime");
  await page.getByRole("button", { name: "Assign" }).click();
  await expect(page.getByText("Sample model assigned.")).toBeVisible();
  await page.getByRole("checkbox", { name: /I have checked these details/ }).check();
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Saved. Metadata marked as verified.")).toBeVisible();
  await page.getByRole("button", { name: "Submit for approval" }).first().click();
  await expect(page).toHaveURL(/preview/);
  await page.getByRole("button", { name: "Reject" }).click();
  await page.getByLabel("Reason for rejecting").fill("Photo angle is wrong");
  await page.getByRole("button", { name: "Confirm reject" }).click();
  await expect(page.getByText("Rejected: Photo angle is wrong. The product stays hidden")).toBeVisible();
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page.getByText("Rejected: Photo angle is wrong")).toBeVisible();
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("Archived.").first()).toBeVisible();
});
