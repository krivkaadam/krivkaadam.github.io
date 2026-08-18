import * as cheerio from "npm:cheerio@1.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Offer {
  shop: string;
  price: number;
  amountText: string;
  pricePer100: number | null;
  validity: string;
  isFuture: boolean;
  note?: string;
}

interface ProductGroup {
  name: string;
  offers: Offer[];
}

function parsePrice(raw: string): number | null {
  if (!raw) return null;
  const clean = raw.replace(/\u00a0/g, " ").replace(/\s+/g, "").replace(",", ".");
  const match = clean.match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

function parseGramsOrMl(amountStr: string): number | null {
  if (!amountStr || /ks|kus/i.test(amountStr)) return null;
  const clean = amountStr.replace(",", ".").toLowerCase();

  const kgMatch = clean.match(/([\d.]+)\s*kg/);
  if (kgMatch) return parseFloat(kgMatch[1]) * 1000;

  const lMatch = clean.match(/([\d.]+)\s*l/);
  if (lMatch) return parseFloat(lMatch[1]) * 1000;

  const gMatch = clean.match(/([\d.]+)\s*g/);
  if (gMatch) return parseFloat(gMatch[1]);

  const mlMatch = clean.match(/([\d.]+)\s*ml/);
  if (mlMatch) return parseFloat(mlMatch[1]);

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ found: false, error: "Invalid JSON body" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const product = body?.product?.trim();
    if (!product) {
      return new Response(
        JSON.stringify({ found: false, error: "Missing product" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const searchUrl = `https://www.kupi.cz/hledej?f=${encodeURIComponent(product)}`;
    const res = await fetch(searchUrl, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
      },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ found: false, error: `Kupi response error: ${res.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const productGroups: ProductGroup[] = [];
    const seenDiscountIds = new Set<string>();

    // Parse discount cards grouped by product wrapper
    $(".group_discounts").each((_, groupEl) => {
      const $group = $(groupEl);

      const productName =
        $group.find(".product_name h2 strong, .product_name strong").first().text().trim() ||
        $group.find(".product_image img").attr("alt")?.trim() ||
        product;

      const groupOffers: Offer[] = [];

      $group.find(".discount_row").each((_, row) => {
        const $row = $(row);

        // 1. Prevent duplicate entries from "Doporučené akce" and "Akce dle ceny"
        const discountId = $row.attr("data-discount") || $row.attr("id") || "";
        if (discountId && seenDiscountIds.has(discountId)) return;
        if (discountId) seenDiscountIds.add(discountId);

        // 2. Price extraction (data attribute fallback to rendered text)
        const dataPrice = $row.find("[data-price]").first().attr("data-price");
        const price = dataPrice
          ? parseFloat(dataPrice)
          : parsePrice($row.find(".discount_price_value").first().text());

        if (!price || isNaN(price)) return;

        // 3. Supermarket name extraction
        const shop =
          $row.find(".discounts_markets a").attr("data-shop")?.trim() ||
          $row.find(".discounts_shop_name a").attr("title")?.trim() ||
          $row.find(".discounts_shop_name").first().text().replace(/\s+/g, " ").trim() ||
          "Supermarket";

        // 4. Amount parsing
        const key = $row.attr("data-key") || "";
        const amountText = key
          ? key.replace("-", " ")
          : $group.find(".product_name .nowrap").first().text().trim() || "0.5 l";

        // 5. Flags & validity
        const isFuture = $row.find(".price_future_discount").length > 0;
        const validity = $row.find(".discounts_validity").text().replace(/\s+/g, " ").trim();
        const note = $row.find(".discount_note span").text().replace(/\s+/g, " ").trim();

        const baseAmount = parseGramsOrMl(amountText);
        const pricePer100 = baseAmount
          ? Math.round((price / baseAmount) * 100 * 100) / 100
          : null;

        groupOffers.push({
          shop,
          price,
          amountText,
          pricePer100,
          validity,
          isFuture,
          ...(note ? { note } : {}),
        });
      });

      if (groupOffers.length > 0) {
        groupOffers.sort((a, b) => a.price - b.price);
        productGroups.push({ name: productName, offers: groupOffers });
      }
    });

    // Fallback if no .group_discounts wrappers exist on the page
    if (productGroups.length === 0) {
      const standaloneOffers: Offer[] = [];

      $(".discount_row").each((_, row) => {
        const $row = $(row);
        const discountId = $row.attr("data-discount") || $row.attr("id") || "";
        if (discountId && seenDiscountIds.has(discountId)) return;
        if (discountId) seenDiscountIds.add(discountId);

        const dataPrice = $row.find("[data-price]").first().attr("data-price");
        const price = dataPrice
          ? parseFloat(dataPrice)
          : parsePrice($row.find(".discount_price_value").first().text());

        if (!price || isNaN(price)) return;

        const shop =
          $row.find(".discounts_markets a").attr("data-shop")?.trim() ||
          $row.find(".discounts_shop_name a").attr("title")?.trim() ||
          $row.find(".discounts_shop_name").first().text().replace(/\s+/g, " ").trim() ||
          "Supermarket";

        const key = $row.attr("data-key") || "";
        const amountText = key.replace("-", " ");
        const isFuture = $row.find(".price_future_discount").length > 0;
        const validity = $row.find(".discounts_validity").text().replace(/\s+/g, " ").trim();

        const baseAmount = parseGramsOrMl(amountText);
        const pricePer100 = baseAmount
          ? Math.round((price / baseAmount) * 100 * 100) / 100
          : null;

        standaloneOffers.push({ shop, price, amountText, pricePer100, validity, isFuture });
      });

      if (standaloneOffers.length > 0) {
        standaloneOffers.sort((a, b) => a.price - b.price);
        productGroups.push({ name: product, offers: standaloneOffers });
      }
    }

    if (productGroups.length === 0) {
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    let overallCheapest: (Offer & { productName: string }) | null = null;
    for (const group of productGroups) {
      if (group.offers.length > 0) {
        const topOffer = group.offers[0];
        if (!overallCheapest || topOffer.price < overallCheapest.price) {
          overallCheapest = { ...topOffer, productName: group.name };
        }
      }
    }

    return new Response(
      JSON.stringify({
        found: true,
        overallCheapest,
        products: productGroups,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ found: false, error: errorMsg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});