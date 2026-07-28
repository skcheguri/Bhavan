import { describe, it, expect } from "vitest";
import {
  isValidName,
  isValidEmail,
  isValidIndianPhone,
  isValidRawIndianMobile,
  hasFakeDigitPattern,
  formatIndianPhoneInput,
  isValidAadhaarFormat,
  isValidAadhaarChecksum,
  isValidAadhaar,
  daysInMonth,
  yearOptions,
  parseIsoDate,
  composeIsoDate,
} from "./validation";

describe("isValidName", () => {
  it("accepts letters and spaces", () => {
    expect(isValidName("John Doe")).toBe(true);
  });

  it("rejects digits and special characters", () => {
    expect(isValidName("John@#$ Doe123!")).toBe(false);
  });

  it("rejects empty or whitespace-only input", () => {
    expect(isValidName("")).toBe(false);
    expect(isValidName("   ")).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("accepts a well-formed email", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  it("rejects missing @ or domain", () => {
    expect(isValidEmail("userexample.com")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
  });
});

describe("isValidIndianPhone", () => {
  it("accepts the exact '+91 XXXXX XXXXX' format", () => {
    expect(isValidIndianPhone("+91 98234 51670")).toBe(true);
  });

  it("rejects unformatted or partial numbers", () => {
    expect(isValidIndianPhone("9876543210")).toBe(false);
    expect(isValidIndianPhone("+919876543210")).toBe(false);
  });

  it("rejects a number where every digit is the same", () => {
    expect(isValidIndianPhone("+91 99999 99999")).toBe(false);
  });

  it("rejects an ascending or descending sequence", () => {
    expect(isValidIndianPhone("+91 91234 56789")).toBe(false);
    expect(isValidIndianPhone("+91 98765 43210")).toBe(false);
  });

  it("rejects a number with 5+ repeated digits in a row", () => {
    expect(isValidIndianPhone("+91 98111 11234")).toBe(false);
  });

  it("rejects numbers that don't start with 6-9 (not a real Indian mobile prefix)", () => {
    expect(isValidIndianPhone("+91 12345 67890")).toBe(false);
  });
});

describe("isValidRawIndianMobile", () => {
  it("accepts a genuine 10-digit mobile number", () => {
    expect(isValidRawIndianMobile("9823451670")).toBe(true);
  });

  it("rejects fake patterns and wrong-length input", () => {
    expect(isValidRawIndianMobile("1111111111")).toBe(false);
    expect(isValidRawIndianMobile("1234567890")).toBe(false);
    expect(isValidRawIndianMobile("987654321")).toBe(false); // only 9 digits
    expect(isValidRawIndianMobile("5198234516")).toBe(false); // doesn't start 6-9
  });
});

describe("hasFakeDigitPattern", () => {
  it("flags all-identical digits", () => {
    expect(hasFakeDigitPattern("1111111111")).toBe(true);
  });

  it("flags a full ascending or descending run", () => {
    expect(hasFakeDigitPattern("1234567890")).toBe(true);
    expect(hasFakeDigitPattern("9876543210")).toBe(true);
  });

  it("does not flag a genuinely mixed number", () => {
    expect(hasFakeDigitPattern("9823451670")).toBe(false);
  });
});

describe("formatIndianPhoneInput", () => {
  it("formats raw digits into '+91 XXXXX XXXXX'", () => {
    expect(formatIndianPhoneInput("9876543210")).toBe("+91 98765 43210");
  });

  it("does not corrupt an already-formatted value on repeated keystrokes", () => {
    // Regression case: re-running the formatter on its own previous
    // output used to re-read the displayed "91" prefix as typed digits.
    let value = formatIndianPhoneInput("9");
    value = formatIndianPhoneInput(value + "8");
    value = formatIndianPhoneInput(value + "7");
    expect(value).toBe("+91 987");
  });

  it("strips a leading +91 the user typed manually", () => {
    expect(formatIndianPhoneInput("+919876543210")).toBe("+91 98765 43210");
  });

  it("returns an empty string for empty input", () => {
    expect(formatIndianPhoneInput("")).toBe("");
  });
});

describe("Aadhaar validation", () => {
  // Verhoeff-valid fixture computed with the same D/P tables the source
  // uses, not hand-picked -- see the task's test-setup notes for how.
  const VALID_AADHAAR = "234567890124";

  it("accepts a number with a correct Verhoeff checksum", () => {
    expect(isValidAadhaarFormat(VALID_AADHAAR)).toBe(true);
    expect(isValidAadhaarChecksum(VALID_AADHAAR)).toBe(true);
    expect(isValidAadhaar(VALID_AADHAAR)).toBe(true);
  });

  it("rejects a number with a single flipped digit (bad checksum)", () => {
    const tampered = "234567890123"; // last digit changed from a valid 4
    expect(isValidAadhaarChecksum(tampered)).toBe(false);
    expect(isValidAadhaar(tampered)).toBe(false);
  });

  it("rejects numbers starting with 0 or 1 (UIDAI never issues these)", () => {
    expect(isValidAadhaarFormat("012345678901")).toBe(false);
    expect(isValidAadhaarFormat("112345678901")).toBe(false);
  });

  it("accepts spaced input the same as unspaced", () => {
    expect(isValidAadhaar("2345 6789 0124")).toBe(true);
  });
});

describe("date helpers", () => {
  it("daysInMonth accounts for leap years", () => {
    expect(daysInMonth(2, 2024)).toBe(29); // leap year
    expect(daysInMonth(2, 2025)).toBe(28); // non-leap year
    expect(daysInMonth(4, 2025)).toBe(30);
  });

  it("daysInMonth defaults to 31 when month or year is missing", () => {
    expect(daysInMonth(0, 2025)).toBe(31);
  });

  it("yearOptions produces a descending range including both ends", () => {
    const years = yearOptions(2020);
    const currentYear = new Date().getFullYear();
    expect(years[0]).toBe(currentYear);
    expect(years[years.length - 1]).toBe(2020);
  });

  it("parseIsoDate / composeIsoDate round-trip", () => {
    const parsed = parseIsoDate("1995-07-04");
    expect(parsed).toEqual({ day: "04", month: "07", year: "1995" });
    expect(composeIsoDate(parsed.day, parsed.month, parsed.year)).toBe("1995-07-04");
  });

  it("composeIsoDate returns '' if any part is missing", () => {
    expect(composeIsoDate("", "07", "1995")).toBe("");
  });
});
