import { z } from "zod";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";

export const notesRouter = createTRPCRouter({
  // Get all notes owned by the authenticated user (sorted by most recently updated)
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.note.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        folderId: true,
      },
    });
  }),

  // Create a new note owned by the authenticated user
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().optional().default("Untitled"),
        content: z.string().optional().default(""),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.note.create({
        data: {
          title: input.title,
          content: input.content,
          userId: ctx.session.user.id,
        },
      });
    }),

  // Update an existing note with ownership check
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        content: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      // Check if the note belongs to the authenticated user
      const note = await ctx.db.note.findFirst({
        where: { id, userId: ctx.session.user.id },
      });

      if (!note) {
        // Check if the note exists at all (belongs to another user)
        const existingNote = await ctx.db.note.findUnique({
          where: { id },
        });

        if (existingNote) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have permission to update this note",
          });
        }

        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Note not found",
        });
      }

      return ctx.db.note.update({
        where: { id },
        data,
      });
    }),

  // Delete a note with ownership check
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check if the note belongs to the authenticated user
      const note = await ctx.db.note.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
      });

      if (!note) {
        // Check if the note exists at all (belongs to another user)
        const existingNote = await ctx.db.note.findUnique({
          where: { id: input.id },
        });

        if (existingNote) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have permission to delete this note",
          });
        }

        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Note not found",
        });
      }

      return ctx.db.note.delete({
        where: { id: input.id },
      });
    }),

  // Move a note to a folder (or to root if folderId is null)
  moveToFolder: protectedProcedure
    .input(
      z.object({
        noteId: z.string(),
        folderId: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify note ownership
      const note = await ctx.db.note.findFirst({
        where: { id: input.noteId, userId: ctx.session.user.id },
      });
      if (!note) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }

      // If moving to a folder, verify folder ownership
      if (input.folderId) {
        const folder = await ctx.db.folder.findFirst({
          where: { id: input.folderId, userId: ctx.session.user.id },
        });
        if (!folder) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot move note to a folder you don't own",
          });
        }
      }

      // No-op if already in the target folder
      if (note.folderId === input.folderId) {
        return note;
      }

      return ctx.db.note.update({
        where: { id: input.noteId },
        data: { folderId: input.folderId },
      });
    }),
});
