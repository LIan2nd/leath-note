/**
 * date-history.ts
 *
 * Pure utility functions for automatic date-history logic in note content.
 * Notes are stored as Markdown.
 * - The first implicit section has no date header and belongs to the `createdAt` date.
 * - Subsequent days are split by headers: ## 📅 DD/MM/YYYY
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DateSection {
  /** The date string in DD/MM/YYYY format */
  dateStr: string;
  /** Parsed Date object (start of day, local timezone) */
  date: Date;
  /** The full header line, e.g. "## 📅 10/06/2026", or null for the initial implicit section */
  headerLine: string | null;
  /** Content lines below the header (without the header itself) */
  content: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Regex to match a date header line: ## 📅 DD/MM/YYYY */
const DATE_HEADER_REGEX = /^## 📅 (\d{2}\/\d{2}\/\d{4})$/;

// ─── Formatting ─────────────────────────────────────────────────────────────

/**
 * Format a Date into DD/MM/YYYY string.
 */
export function formatDateStr(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = String(date.getFullYear());
  return `${d}/${m}/${y}`;
}

/**
 * Build the full markdown header line for a given date.
 */
export function buildDateHeader(date: Date): string {
  return `## 📅 ${formatDateStr(date)}`;
}

/**
 * Parse a DD/MM/YYYY string into a Date object (start of day, local tz).
 * Returns null if the string doesn't match the expected format.
 */
export function parseDateStr(str: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
  if (!match) return null;
  const day = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10) - 1;
  const year = parseInt(match[3]!, 10);
  const d = new Date(year, month, day);
  // Validate the date is real (e.g. not 31/02/2026)
  if (d.getDate() !== day || d.getMonth() !== month || d.getFullYear() !== year) {
    return null;
  }
  return d;
}

// ─── Parsing ────────────────────────────────────────────────────────────────

/**
 * Parse markdown content into an array of DateSection objects.
 * The first section implicitly belongs to `createdAt` and has no headerLine.
 */
export function parseDateSections(content: string, createdAt: Date): DateSection[] {
  const lines = content.split("\n");
  const sections: DateSection[] = [];
  
  let currentSection: DateSection = {
    dateStr: formatDateStr(createdAt),
    date: createdAt,
    headerLine: null,
    content: "",
  };
  let contentLines: string[] = [];

  for (const line of lines) {
    const match = DATE_HEADER_REGEX.exec(line.trim());
    if (match) {
      // Flush previous section
      currentSection.content = contentLines.join("\n");
      sections.push(currentSection);

      const dateStr = match[1]!;
      const date = parseDateStr(dateStr) || new Date();
      currentSection = {
        dateStr,
        date,
        headerLine: line.trim(),
        content: "",
      };
      contentLines = [];
    } else {
      contentLines.push(line);
    }
  }

  currentSection.content = contentLines.join("\n");
  sections.push(currentSection);

  // Clean up whitespace
  sections.forEach((s) => (s.content = s.content.trim()));

  return sections;
}

/**
 * Reassemble sections back into markdown content string.
 * Omits empty first sections if they have no header and no content.
 */
export function sectionsToMarkdown(sections: DateSection[]): string {
  return sections
    .filter((s) => s.headerLine !== null || s.content.length > 0)
    .map((s) => {
      const parts = [];
      if (s.headerLine) parts.push(s.headerLine);
      if (s.content) parts.push(s.content);
      return parts.join("\n\n");
    })
    .join("\n\n");
}

// ─── Content Transformation ─────────────────────────────────────────────────

/**
 * Main function: process a content change from the editor.
 *
 * Compares old and new content section-by-section:
 * - If old sections were modified and their date ≠ today, append "(✏️ diedit: DD/MM/YYYY)".
 * - Returns the processed content string.
 *
 * @param oldContent - The previous saved content
 * @param newContent - The new content from the editor
 * @param createdAt  - The note's creation date
 * @param today      - Override for testing; defaults to new Date()
 */
export function processContentChange(
  oldContent: string,
  newContent: string,
  createdAt: Date,
  today?: Date,
): string {
  const now = today ?? new Date();
  const todayStr = formatDateStr(now);

  // If new content is completely empty, just return empty string
  if (!newContent.trim()) return "";

  const oldSections = parseDateSections(oldContent, createdAt);
  const newSections = parseDateSections(newContent, createdAt);

  // Build a map of old sections by date for comparison
  const oldByDate = new Map<string, string>();
  for (const s of oldSections) {
    // If there are duplicate dates, take the combined content
    const existing = oldByDate.get(s.dateStr) || "";
    oldByDate.set(s.dateStr, existing ? `${existing}\n\n${s.content}` : s.content);
  }

  // Check each new section against old content
  const processedSections: DateSection[] = newSections.map((newSec) => {
    const oldSectionContent = oldByDate.get(newSec.dateStr);

    // Section existed before and its date is NOT today
    if (
      oldSectionContent !== undefined &&
      newSec.dateStr !== todayStr &&
      newSec.content.trim() !== oldSectionContent.trim()
    ) {
      // Content was modified in an old section — add edit tag
      const editTag = `(✏️ diedit: ${todayStr})`;
      const trimmedContent = newSec.content.trimEnd();

      // Check if an edit tag for today already exists at the end
      if (trimmedContent.endsWith(editTag)) {
        return newSec; // Already tagged
      }

      // Remove any existing edit tag for today and re-append at the end
      const cleanContent = trimmedContent
        .replace(new RegExp(`\\s*\\(✏️ diedit: ${escapeRegex(todayStr)}\\)`, "g"), "")
        .trimEnd();

      return {
        ...newSec,
        content: `${cleanContent}\n\n${editTag}`,
      };
    }

    return newSec;
  });

  return sectionsToMarkdown(processedSections);
}

/**
 * Initialize content for the editor.
 * If it's a new day (different from createdAt and different from the last date marker),
 * append a new date header to the bottom, so the user has a fresh section for today.
 */
export function initializeContent(content: string, createdAt: Date, today?: Date): string {
  const now = today ?? new Date();
  const todayStr = formatDateStr(now);
  const createdStr = formatDateStr(createdAt);

  if (!content.trim()) {
    return content; // No headers for entirely empty notes
  }

  const sections = parseDateSections(content, createdAt);
  if (sections.length === 0) return content;

  const lastSection = sections[sections.length - 1]!;
  
  // If the last section's date is not today, and today is also not the createdAt day,
  // we append a new header for today.
  if (lastSection.dateStr !== todayStr && createdStr !== todayStr) {
    return `${content.trimEnd()}\n\n${buildDateHeader(now)}\n\n`;
  }

  return content;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
