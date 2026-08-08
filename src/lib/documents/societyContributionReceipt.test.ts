import { describe, it, expect } from "vitest";
import { buildContributionReceiptHtml, type ContributionReceiptData } from "./societyContributionReceipt";

const base: ContributionReceiptData = {
  receiptNumber: "SC-2026-A1B2C3",
  societyName: "Satyam Towers",
  societyAddress: "Rama Raja Nagar, Hyderabad, Telangana",
  collectionTitle: "Diwali celebration 2026",
  collectionPurpose: "Decorations and snacks",
  payerName: "Ravi Kumar",
  payerUnits: ["A-402"],
  amountRupees: 2000,
  reference: "428391045612",
  paidOn: "2026-08-08",
  confirmedOn: "2026-08-09",
  confirmedByName: "S Kumar",
};

describe("buildContributionReceiptHtml", () => {
  it("states the amount in Indian digit grouping", () => {
    const html = buildContributionReceiptHtml({ ...base, amountRupees: 125000 });
    // 1,25,000 not 125,000 -- the lakh grouping is what an Indian reader
    // checks a figure against.
    expect(html).toContain("₹1,25,000");
  });

  it("carries the payment reference so it can be matched to a statement", () => {
    const html = buildContributionReceiptHtml(base);
    expect(html).toContain("428391045612");
  });

  it("says plainly that Bhavan did not handle the money", () => {
    const html = buildContributionReceiptHtml(base);
    // The whole point of the document. A receipt implying Bhavan held the
    // funds would be relied on in exactly the dispute where it is wrong.
    // Whitespace-tolerant: the sentence wraps across lines in the source,
    // and where the line breaks fall is not what is being asserted.
    expect(html).toMatch(/did not\s+receive,\s+hold or transfer these funds/i);
  });

  it("escapes a society name containing markup", () => {
    const html = buildContributionReceiptHtml({
      ...base,
      societyName: '<script>alert("x")</script>',
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("does not roll the date back a day in a timezone behind UTC", () => {
    // A date-only string parsed as UTC midnight formats as the previous
    // day anywhere west of Greenwich. Same trap as the rent receipt.
    const html = buildContributionReceiptHtml({ ...base, confirmedOn: "2026-08-09" });
    expect(html).toContain("9 August 2026");
  });

  it("renders an em dash rather than an empty cell for a missing reference", () => {
    const html = buildContributionReceiptHtml({ ...base, reference: "" });
    expect(html).toContain("—");
  });

  it("handles an owner of more than one flat", () => {
    const html = buildContributionReceiptHtml({ ...base, payerUnits: ["A-402", "A-403"] });
    expect(html).toContain("A-402, A-403");
  });
});
