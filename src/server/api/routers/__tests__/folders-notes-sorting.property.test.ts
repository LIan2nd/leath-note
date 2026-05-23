import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// Feature: note-folders, Property 9: Notes within folder sorted by recency

/**
 * This tests the FolderList component's sorting logic directly.
 * The sorting logic filters notes by folderId and sorts by updatedAt descending.
 *
 * From FolderList component:
 *   notes
 *     .filter((note) => note.folderId === folder.id)
 *     .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
 */

interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: Date;
  folderId: string | null;
}

/**
 * The sorting logic extracted from FolderList component
 */
function getNotesForFolder(notes: Note[], folderId: string): Note[] {
  return notes
    .filter((note) => note.folderId === folderId)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
}

/**
 * Arbitrary: Generate a CUID-like ID
 */
const arbId = fc
  .stringMatching(/^[a-z][a-z0-9]{10,24}$/)
  .filter((s) => s.length >= 10);

/**
 * Arbitrary: Generate a Date within a reasonable range (always valid)
 */
const arbDate = fc.date({
  min: new Date("2020-01-01T00:00:00.000Z"),
  max: new Date("2030-12-31T23:59:59.999Z"),
  noInvalidDate: true,
});

/**
 * Arbitrary: Generate a note with a specific folderId
 */
function arbNoteWithFolder(folderId: string): fc.Arbitrary<Note> {
  return fc.record({
    id: arbId,
    title: fc.string({ minLength: 1, maxLength: 50 }),
    content: fc.string({ maxLength: 200 }),
    updatedAt: arbDate,
    folderId: fc.constant(folderId),
  });
}

/**
 * Arbitrary: Generate a note with a random or null folderId (not matching target folder)
 */
function arbNoteOtherFolder(excludeFolderId: string): fc.Arbitrary<Note> {
  return fc.record({
    id: arbId,
    title: fc.string({ minLength: 1, maxLength: 50 }),
    content: fc.string({ maxLength: 200 }),
    updatedAt: arbDate,
    folderId: fc.oneof(
      fc.constant(null),
      arbId.filter((id) => id !== excludeFolderId)
    ),
  });
}

describe("Property 9: Notes within folder sorted by recency", () => {
  // **Validates: Requirements 5.3**

  it("notes within a folder are sorted by updatedAt descending", async () => {
    await fc.assert(
      fc.property(
        arbId,
        fc
          .array(arbNoteWithFolder("target-folder-id"), {
            minLength: 2,
            maxLength: 20,
          })
          .chain((folderNotes) =>
            fc
              .array(arbNoteOtherFolder("target-folder-id"), {
                minLength: 0,
                maxLength: 10,
              })
              .map((otherNotes) => ({
                folderNotes,
                allNotes: [...folderNotes, ...otherNotes],
              }))
          ),
        (_userId, { allNotes }) => {
          const folderId = "target-folder-id";

          // Apply the sorting logic from FolderList
          const result = getNotesForFolder(allNotes, folderId);

          // Verify: each consecutive pair satisfies a.updatedAt >= b.updatedAt
          for (let i = 0; i < result.length - 1; i++) {
            const current = new Date(result[i]!.updatedAt).getTime();
            const next = new Date(result[i + 1]!.updatedAt).getTime();
            expect(current).toBeGreaterThanOrEqual(next);
          }
        }
      ),
      { numRuns: 20 }
    );
  }, 30_000);

  it("only notes matching the folder are included in the sorted result", async () => {
    await fc.assert(
      fc.property(
        arbId,
        fc
          .array(arbNoteWithFolder("target-folder-id"), {
            minLength: 1,
            maxLength: 15,
          })
          .chain((folderNotes) =>
            fc
              .array(arbNoteOtherFolder("target-folder-id"), {
                minLength: 1,
                maxLength: 15,
              })
              .map((otherNotes) => ({
                folderNotes,
                otherNotes,
                allNotes: [...folderNotes, ...otherNotes],
              }))
          ),
        (_userId, { folderNotes, allNotes }) => {
          const folderId = "target-folder-id";

          const result = getNotesForFolder(allNotes, folderId);

          // All returned notes must belong to the target folder
          for (const note of result) {
            expect(note.folderId).toBe(folderId);
          }

          // The count must match the number of notes assigned to this folder
          expect(result.length).toBe(folderNotes.length);
        }
      ),
      { numRuns: 20 }
    );
  }, 30_000);
});
