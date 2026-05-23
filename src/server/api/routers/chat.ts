import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const chatRouter = createTRPCRouter({
  // Get all chat messages for a note
  getByNoteId: publicProcedure
    .input(z.object({ noteId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.chatMessage.findMany({
        where: { noteId: input.noteId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
        },
      });
    }),

  // Add a message (user or assistant)
  addMessage: publicProcedure
    .input(
      z.object({
        noteId: z.string(),
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.chatMessage.create({
        data: {
          noteId: input.noteId,
          role: input.role,
          content: input.content,
        },
      });
    }),

  // Clear all messages for a note
  clearByNoteId: publicProcedure
    .input(z.object({ noteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.chatMessage.deleteMany({
        where: { noteId: input.noteId },
      });
    }),
});
