import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const noteInput = z.object({ noteId: z.string().min(1).max(191) });
const messageContent = z.string().trim().min(1).max(100_000);

export const chatRouter = createTRPCRouter({
  // Get all chat messages for a note
  getByNoteId: protectedProcedure
    .input(noteInput)
    .query(async ({ ctx, input }) => {
      return ctx.db.chatMessage.findMany({
        where: {
          noteId: input.noteId,
          note: { userId: ctx.session.user.id },
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
        },
      });
    }),

  // Add a message (user or assistant)
  addMessage: protectedProcedure
    .input(
      z.object({
        noteId: z.string().min(1).max(191),
        role: z.enum(["user", "assistant"]),
        content: messageContent,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ownedNote = await ctx.db.note.findFirst({
        where: { id: input.noteId, userId: ctx.session.user.id },
        select: { id: true },
      });

      if (!ownedNote) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }

      return ctx.db.chatMessage.create({
        data: {
          noteId: input.noteId,
          role: input.role,
          content: input.content,
        },
      });
    }),

  // Clear all messages for a note
  clearByNoteId: protectedProcedure
    .input(noteInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.chatMessage.deleteMany({
        where: {
          noteId: input.noteId,
          note: { userId: ctx.session.user.id },
        },
      });
    }),
});
