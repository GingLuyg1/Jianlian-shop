import { expect, test } from "@playwright/test";

test("home page shows the main shopping entry", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "全球数字商品与通信服务商城" })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /数字账号/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /AI会员充值/ })).toBeVisible();
});

test("digital account category page shows secondary and product lists", async ({
  page,
}) => {
  await page.goto("/products/digital-accounts?category=apple-id");

  await expect(page.getByRole("heading", { name: "Apple ID" })).toBeVisible();
  await expect(page.getByText("尼日利亚Apple id")).toBeVisible();
});
