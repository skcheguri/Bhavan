import { describe, it, expect } from "vitest";
import { buildRentReceiptHtml, type RentReceiptData } from "./rentReceiptDocument";

function baseReceipt(overrides: Partial<RentReceiptData> = {}): RentReceiptData {
  return {
    receiptNumber: "RCPT-001",
    landlordName: "Asha Rao",
    landlordPan: "ABCDE1234F",
    landlordAddress: "12 MG Road, Bengaluru",
    tenantName: "Vikram Singh",
    tenantPan: "PQRST5678G",
    propertyAddress: "Flat 4B, Palm Residency",
    periodFrom: "2026-07-01",
    periodTo: "2026-07-31",
    rentAmount: 25000,
    paymentMode: "upi",
    transactionRef: "TXN123",
    paymentDate: "2026-07-05",
    includesMaintenance: false,
    maintenanceAmount: 0,
    notes: "",
    createdAt: "2026-07-05",
    ...overrides,
  };
}

describe("buildRentReceiptHtml -- amount in words (Indian numbering)", () => {
  it("renders zero", () => {
    expect(buildRentReceiptHtml(baseReceipt({ rentAmount: 0 }))).toContain("Zero Rupees Only");
  });

  it("renders a plain hundreds amount", () => {
    expect(buildRentReceiptHtml(baseReceipt({ rentAmount: 500 }))).toContain("Five Hundred Rupees Only");
  });

  it("renders thousands correctly", () => {
    expect(buildRentReceiptHtml(baseReceipt({ rentAmount: 1500 }))).toContain("One Thousand Five Hundred Rupees Only");
  });

  it("renders a round lakh with no trailing zero segments", () => {
    expect(buildRentReceiptHtml(baseReceipt({ rentAmount: 100000 }))).toContain("One Lakh Rupees Only");
  });

  it("renders lakh + thousand combined", () => {
    expect(buildRentReceiptHtml(baseReceipt({ rentAmount: 150000 }))).toContain("One Lakh Fifty Thousand Rupees Only");
  });

  it("renders crore correctly", () => {
    expect(buildRentReceiptHtml(baseReceipt({ rentAmount: 10000000 }))).toContain("One Crore Rupees Only");
  });

  it("handles the 'teens' irregular block (11-19) inside a larger number", () => {
    // 1,15,000 -> One Lakh Fifteen Thousand
    expect(buildRentReceiptHtml(baseReceipt({ rentAmount: 115000 }))).toContain("One Lakh Fifteen Thousand Rupees Only");
  });
});

describe("buildRentReceiptHtml -- amount math", () => {
  it("shows just the rent amount when maintenance is not included", () => {
    const html = buildRentReceiptHtml(baseReceipt({ rentAmount: 20000, includesMaintenance: false, maintenanceAmount: 3000 }));
    expect(html).toContain("₹20,000");
    // the combined amount-box total should equal rentAmount alone, not rent+maintenance
    const amountBoxMatches = html.match(/class="amount">₹[\d,]+/g) ?? [];
    expect(amountBoxMatches[0]).toBe('class="amount">₹20,000');
  });

  it("adds maintenance into the total when included", () => {
    const html = buildRentReceiptHtml(baseReceipt({ rentAmount: 20000, includesMaintenance: true, maintenanceAmount: 3000 }));
    const amountBoxMatches = html.match(/class="amount">₹[\d,]+/g) ?? [];
    expect(amountBoxMatches[0]).toBe('class="amount">₹23,000');
  });
});

describe("buildRentReceiptHtml -- stamp duty note", () => {
  it("shows the revenue stamp note for cash payments over ₹5,000", () => {
    const html = buildRentReceiptHtml(baseReceipt({ paymentMode: "cash", rentAmount: 10000 }));
    expect(html).toContain("Revenue stamp affixed");
  });

  it("omits the note for cash payments at or under ₹5,000", () => {
    const html = buildRentReceiptHtml(baseReceipt({ paymentMode: "cash", rentAmount: 5000 }));
    expect(html).not.toContain("Revenue stamp affixed");
  });

  it("omits the note entirely for non-cash payments regardless of amount", () => {
    const html = buildRentReceiptHtml(baseReceipt({ paymentMode: "upi", rentAmount: 50000 }));
    expect(html).not.toContain("Revenue stamp affixed");
  });
});

describe("buildRentReceiptHtml -- XSS safety", () => {
  it("escapes HTML in every user-supplied text field instead of injecting it raw", () => {
    const html = buildRentReceiptHtml(
      baseReceipt({
        tenantName: '<img src=x onerror=alert(1)>',
        landlordName: '<script>alert("landlord")</script>',
        propertyAddress: '"><svg onload=alert(2)>',
        notes: '<b>bold</b> injected',
      })
    );
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<script>alert(\"landlord\")</script>");
    expect(html).not.toContain("<svg onload=alert(2)>");
    expect(html).not.toContain("<b>bold</b>");
    // and the escaped form should actually be present
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("buildRentReceiptHtml -- optional fields", () => {
  it("falls back to a blank line for a missing payment date", () => {
    expect(buildRentReceiptHtml(baseReceipt({ paymentDate: "" }))).toContain("_______________");
  });

  it("omits the transaction reference row when there is no reference", () => {
    expect(buildRentReceiptHtml(baseReceipt({ transactionRef: "" }))).not.toContain("Transaction Reference");
  });

  it("falls back to the raw value for an unrecognized payment mode", () => {
    expect(buildRentReceiptHtml(baseReceipt({ paymentMode: "crypto" }))).toContain(">crypto<");
  });
});
