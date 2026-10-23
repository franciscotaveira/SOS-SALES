import { describe, it, expect } from "vitest";

interface RecipientRow {
  variant: string;
  sales_count: string;
  sales_cents: string;
}

function calculateSalesMetrics(
  salesRows: RecipientRow[],
  delivered: number,
  isAbTest: boolean,
  variantStats?: {
    delA: number;
    repA: number;
    openA: number;
    delB: number;
    repB: number;
    openB: number;
  }
) {
  let totalSalesCount = 0;
  let totalSalesCents = 0;
  let salesCountA = 0;
  let salesCentsA = 0;
  let salesCountB = 0;
  let salesCentsB = 0;

  for (const row of salesRows) {
    const count = Number(row.sales_count || 0);
    const cents = Number(row.sales_cents || 0);
    totalSalesCount += count;
    totalSalesCents += cents;
    if (row.variant === "A") {
      salesCountA += count;
      salesCentsA += cents;
    } else if (row.variant === "B") {
      salesCountB += count;
      salesCentsB += cents;
    }
  }

  const totalConversionRate = delivered > 0 ? Number(((totalSalesCount / delivered) * 100).toFixed(2)) : 0;
  const averageTicketCents = totalSalesCount > 0 ? Math.round(totalSalesCents / totalSalesCount) : 0;
  const totalFormatted = (totalSalesCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const averageTicketFormatted = (averageTicketCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  let abReport = null;

  if (isAbTest && variantStats) {
    const convRateA = variantStats.delA > 0 ? Number(((salesCountA / variantStats.delA) * 100).toFixed(2)) : 0;
    const salesFormattedA = (salesCentsA / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const convRateB = variantStats.delB > 0 ? Number(((salesCountB / variantStats.delB) * 100).toFixed(2)) : 0;
    const salesFormattedB = (salesCentsB / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const openRateA = variantStats.delA > 0 ? Number(((variantStats.openA / variantStats.delA) * 100).toFixed(1)) : 0;
    const replyRateA = variantStats.delA > 0 ? Number(((variantStats.repA / variantStats.delA) * 100).toFixed(1)) : 0;

    const openRateB = variantStats.delB > 0 ? Number(((variantStats.openB / variantStats.delB) * 100).toFixed(1)) : 0;
    const replyRateB = variantStats.delB > 0 ? Number(((variantStats.repB / variantStats.delB) * 100).toFixed(1)) : 0;

    let winner: "A" | "B" | "TIED" = "TIED";
    if (salesCentsA > salesCentsB) winner = "A";
    else if (salesCentsB > salesCentsA) winner = "B";
    else if (convRateA > convRateB) winner = "A";
    else if (convRateB > convRateA) winner = "B";
    else if (replyRateA > replyRateB) winner = "A";
    else if (replyRateB > replyRateA) winner = "B";
    else if (openRateA > openRateB) winner = "A";
    else if (openRateB > openRateA) winner = "B";

    abReport = {
      winner,
      variantA: {
        salesCount: salesCountA,
        salesCents: salesCentsA,
        salesFormatted: salesFormattedA,
        conversionRate: convRateA,
      },
      variantB: {
        salesCount: salesCountB,
        salesCents: salesCentsB,
        salesFormatted: salesFormattedB,
        conversionRate: convRateB,
      },
    };
  }

  return {
    salesCount: totalSalesCount,
    salesCents: totalSalesCents,
    totalFormatted,
    conversionRate: totalConversionRate,
    averageTicketCents,
    averageTicketFormatted,
    abReport,
  };
}

describe("Broadcast Pix Sales Attribution & Metrics (Truth in Data)", () => {
  it("calculates accurate revenue and conversion for single-variant broadcast", () => {
    const rows: RecipientRow[] = [
      { variant: "A", sales_count: "8", sales_cents: "392000" }, // R$ 3.920,00
    ];
    const delivered = 250;

    const result = calculateSalesMetrics(rows, delivered, false);

    expect(result.salesCount).toBe(8);
    expect(result.salesCents).toBe(392000);
    expect(result.conversionRate).toBe(3.2); // (8 / 250) * 100 = 3.2%
    expect(result.averageTicketCents).toBe(49000); // 392000 / 8 = 49000 (R$ 490,00)
    expect(result.totalFormatted).toContain("3.920,00");
    expect(result.averageTicketFormatted).toContain("490,00");
    expect(result.abReport).toBeNull();
  });

  it("identifies commercial revenue winner in A/B split test even if other metrics differ", () => {
    // Variant A has higher reply rate, but Variant B generated significantly more Pix revenue
    const rows: RecipientRow[] = [
      { variant: "A", sales_count: "3", sales_cents: "150000" }, // R$ 1.500,00
      { variant: "B", sales_count: "10", sales_cents: "790000" }, // R$ 7.900,00
    ];
    const delivered = 1000;
    const variantStats = {
      delA: 500,
      openA: 400,
      repA: 150, // 30% reply
      delB: 500,
      openB: 350,
      repB: 100, // 20% reply
    };

    const result = calculateSalesMetrics(rows, delivered, true, variantStats);

    expect(result.salesCount).toBe(13);
    expect(result.salesCents).toBe(940000); // R$ 9.400,00
    expect(result.conversionRate).toBe(1.3);
    expect(result.abReport?.winner).toBe("B"); // B generated 790000 vs 150000
    expect(result.abReport?.variantA.salesCount).toBe(3);
    expect(result.abReport?.variantB.salesCount).toBe(10);
    expect(result.abReport?.variantB.conversionRate).toBe(2.0); // 10 / 500 = 2%
  });

  it("handles zero sales gracefully without division by zero or NaN", () => {
    const rows: RecipientRow[] = [];
    const delivered = 100;

    const result = calculateSalesMetrics(rows, delivered, false);

    expect(result.salesCount).toBe(0);
    expect(result.salesCents).toBe(0);
    expect(result.conversionRate).toBe(0);
    expect(result.averageTicketCents).toBe(0);
    expect(result.totalFormatted).toContain("0,00");
    expect(result.averageTicketFormatted).toContain("0,00");
  });
});
