import { describe, it, expect } from "vitest";
import {
  formatDateStr,
  buildDateHeader,
  parseDateStr,
  parseDateSections,
  sectionsToMarkdown,
  processContentChange,
  initializeContent,
} from "../date-history";

// ─── Helper: fixed dates ────────────────────────────────────────────────────

const june10 = new Date(2026, 5, 10); // 10/06/2026
const june11 = new Date(2026, 5, 11); // 11/06/2026

// ─── formatDateStr ──────────────────────────────────────────────────────────

describe("formatDateStr", () => {
  it("formats a date as DD/MM/YYYY", () => {
    expect(formatDateStr(june10)).toBe("10/06/2026");
    expect(formatDateStr(june11)).toBe("11/06/2026");
  });
});

// ─── buildDateHeader ────────────────────────────────────────────────────────

describe("buildDateHeader", () => {
  it("builds a markdown H2 header with calendar emoji", () => {
    expect(buildDateHeader(june10)).toBe("## 📅 10/06/2026");
  });
});

// ─── parseDateStr ───────────────────────────────────────────────────────────

describe("parseDateStr", () => {
  it("parses a valid DD/MM/YYYY string", () => {
    const d = parseDateStr("10/06/2026");
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(10);
    expect(d!.getMonth()).toBe(5); // June = 5
    expect(d!.getFullYear()).toBe(2026);
  });
});

// ─── parseDateSections ──────────────────────────────────────────────────────

describe("parseDateSections", () => {
  it("parses plain content into a single implicit section", () => {
    const content = "Just some plain text";
    const sections = parseDateSections(content, june10);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.headerLine).toBeNull();
    expect(sections[0]!.dateStr).toBe("10/06/2026");
    expect(sections[0]!.content).toBe("Just some plain text");
  });

  it("parses multiple sections including an implicit first one", () => {
    const content = "First entry\n\n## 📅 11/06/2026\n\nSecond entry";
    const sections = parseDateSections(content, june10);
    expect(sections).toHaveLength(2);
    
    expect(sections[0]!.headerLine).toBeNull();
    expect(sections[0]!.dateStr).toBe("10/06/2026");
    expect(sections[0]!.content).toBe("First entry");
    
    expect(sections[1]!.headerLine).toBe("## 📅 11/06/2026");
    expect(sections[1]!.dateStr).toBe("11/06/2026");
    expect(sections[1]!.content).toBe("Second entry");
  });

  it("handles content that starts immediately with a header", () => {
    const content = "## 📅 11/06/2026\n\nHello";
    const sections = parseDateSections(content, june10);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.content).toBe(""); // empty implicit section
    expect(sections[1]!.headerLine).toBe("## 📅 11/06/2026");
    expect(sections[1]!.content).toBe("Hello");
  });
});

// ─── sectionsToMarkdown ─────────────────────────────────────────────────────

describe("sectionsToMarkdown", () => {
  it("drops empty implicit sections but keeps headers", () => {
    const sections = parseDateSections("## 📅 11/06/2026\n\nHello", june10);
    const md = sectionsToMarkdown(sections);
    expect(md).toBe("## 📅 11/06/2026\n\nHello");
  });

  it("preserves implicit section content", () => {
    const sections = parseDateSections("First\n\n## 📅 11/06/2026\n\nSecond", june10);
    const md = sectionsToMarkdown(sections);
    expect(md).toBe("First\n\n## 📅 11/06/2026\n\nSecond");
  });
});

// ─── initializeContent ──────────────────────────────────────────────────────

describe("initializeContent", () => {
  it("does not add any header to empty content", () => {
    expect(initializeContent("", june10, june11)).toBe("");
  });

  it("does not add header if it's still the creation day", () => {
    expect(initializeContent("First text", june10, june10)).toBe("First text");
  });

  it("appends a header if it's a new day and content exists", () => {
    const result = initializeContent("Old text", june10, june11);
    expect(result).toBe("Old text\n\n## 📅 11/06/2026\n\n");
  });

  it("does not append another header if today's header already exists", () => {
    const content = "Old text\n\n## 📅 11/06/2026\n\nSome edit";
    expect(initializeContent(content, june10, june11)).toBe(content);
  });
});

// ─── processContentChange ───────────────────────────────────────────────────

describe("processContentChange", () => {
  it("does nothing for empty content", () => {
    expect(processContentChange("Hello", "Hello", "", june10, june11)).toBe("");
  });

  it("adds edit tag when editing the implicit first section", () => {
    const old = "Old text\n\n## 📅 11/06/2026\n\nNew";
    const newC = "Old text changed\n\n## 📅 11/06/2026\n\nNew";
    const result = processContentChange(old, old, newC, june10, june11);
    expect(result).toContain("Old text changed\n\n###### ✏️ diedit: 11/06/2026");
    expect(result).toContain("## 📅 11/06/2026\n\nNew");
  });

  it("does not add edit tag when editing today's section", () => {
    const old = "Old text\n\n## 📅 11/06/2026\n\nNew";
    const newC = "Old text\n\n## 📅 11/06/2026\n\nNew edit";
    const result = processContentChange(old, old, newC, june10, june11);
    expect(result).not.toContain("✏️ diedit");
    expect(result).toContain("New edit");
  });
});
