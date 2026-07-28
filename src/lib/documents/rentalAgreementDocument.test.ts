import { describe, it, expect } from "vitest";
import { buildRentalAgreementHtml, type RentalAgreementData } from "./rentalAgreementDocument";

function baseAgreement(overrides: Partial<RentalAgreementData> = {}): RentalAgreementData {
  return {
    agreementNumber: "AGR-001",
    tenantName: "Vikram Singh",
    tenantAddress: "44 Lake View, Pune",
    tenantPhone: "+91 98234 51670",
    tenantEmail: "vikram@example.com",
    tenantPan: "PQRST5678G",
    tenantAadhaarMasked: "XXXX-XXXX-1234",
    landlordName: "Asha Rao",
    landlordAddress: "12 MG Road, Bengaluru",
    landlordPhone: "+91 98111 22334",
    landlordEmail: "asha@example.com",
    landlordPan: "ABCDE1234F",
    propertyAddress: "Flat 4B, Palm Residency",
    propertyDescription: "2BHK apartment",
    flatNumber: "4B",
    carpetArea: 950,
    leaseStartDate: "2026-08-01",
    leaseEndDate: "2027-07-31",
    monthlyRent: 25000,
    securityDeposit: 75000,
    rentDueDay: 5,
    paymentMode: "UPI",
    maintenanceAmount: 2000,
    noticePeriodDays: 30,
    lockInMonths: 6,
    renewalClause: "Renewable by mutual consent",
    witness1Name: "Ravi Kumar",
    witness1Address: "Bengaluru",
    witness2Name: "Meena Iyer",
    witness2Address: "Bengaluru",
    clauses: ["Tenant shall not sublet the premises.", "Rent is payable in advance."],
    createdAt: "2026-07-20",
    ...overrides,
  };
}

describe("buildRentalAgreementHtml -- rent due day ordinal suffix", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [31, "31st"],
  ])("renders day %i as %s", (day, expected) => {
    expect(buildRentalAgreementHtml(baseAgreement({ rentDueDay: day }))).toContain(expected);
  });

  it("shows a dash when no due day is set", () => {
    expect(buildRentalAgreementHtml(baseAgreement({ rentDueDay: 0 }))).toContain('class="value">—<');
  });
});

describe("buildRentalAgreementHtml -- clauses", () => {
  it("renders every clause as an escaped list item", () => {
    const html = buildRentalAgreementHtml(
      baseAgreement({ clauses: ["Clause one.", "Clause <b>two</b>."] })
    );
    expect(html).toContain("<li>Clause one.</li>");
    expect(html).toContain("<li>Clause &lt;b&gt;two&lt;/b&gt;.</li>");
  });

  it("omits the Terms & Conditions section entirely when there are no clauses", () => {
    const html = buildRentalAgreementHtml(baseAgreement({ clauses: [] }));
    expect(html).not.toContain("Terms &amp; Conditions");
  });
});

describe("buildRentalAgreementHtml -- optional contact fields", () => {
  it("omits phone/email/PAN segments that are blank", () => {
    const html = buildRentalAgreementHtml(
      baseAgreement({
        landlordPhone: "",
        landlordEmail: "",
        landlordPan: "",
        tenantPhone: "",
        tenantEmail: "",
        tenantPan: "",
        tenantAadhaarMasked: "",
      })
    );
    expect(html).not.toContain("Phone: ");
    expect(html).not.toContain("PAN: ");
  });

  it("includes phone/email/PAN segments when present", () => {
    const html = buildRentalAgreementHtml(baseAgreement());
    expect(html).toContain("Phone: +91 98111 22334");
    expect(html).toContain("PAN: ABCDE1234F");
  });
});

describe("buildRentalAgreementHtml -- XSS safety", () => {
  it("escapes malicious input in names, addresses, and free-text fields", () => {
    const html = buildRentalAgreementHtml(
      baseAgreement({
        tenantName: '<script>alert(1)</script>',
        landlordAddress: '"><img src=x onerror=alert(2)>',
        renewalClause: '<iframe src="evil"></iframe>',
      })
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x onerror=alert(2)>");
    expect(html).not.toContain('<iframe src="evil"></iframe>');
  });
});

describe("buildRentalAgreementHtml -- dates", () => {
  it("falls back to a blank line when a date is missing", () => {
    expect(buildRentalAgreementHtml(baseAgreement({ leaseStartDate: "" }))).toContain("_______________");
  });
});
