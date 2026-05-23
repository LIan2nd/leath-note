import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const MAX_FOLDERS_PER_USER = 50;
const MAX_FOLDER_NAME_LENGTH = 50;

export const foldersRouter = createTRPCRouter({
  /** List all folders for the authenticated user, sorted alphabetically */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.folder.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { notes: true } },
      },
    });
  }),

  /** Create a new folder with default name */
  create: protectedProcedure
    .input(
      z.object({
        name: z
          .string()
          .max(MAX_FOLDER_NAME_LENGTH)
          .optional()
          .default("Untitled Folder"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Enforce max folder limit
      const count = await ctx.db.folder.count({
        where: { userId: ctx.session.user.id },
      });
      if (count >= MAX_FOLDERS_PER_USER) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Maximum folder limit (50) reached",
        });
      }

      return ctx.db.folder.create({
        data: {
          name: input.name,
          userId: ctx.session.user.id,
        },
        include: {
          _count: { select: { notes: true } },
        },
      });
    }),

  /** Rename a folder with ownership check */
  rename: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(MAX_FOLDER_NAME_LENGTH),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const trimmedName = input.name.trim();
      if (trimmedName.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Folder name cannot be empty",
        });
      }

      const folder = await ctx.db.folder.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
      });

      if (!folder) {
        const exists = await ctx.db.folder.findUnique({
          where: { id: input.id },
        });
        if (exists) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Not your folder",
          });
        }
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Folder not found",
        });
      }

      return ctx.db.folder.update({
        where: { id: input.id },
        data: { name: trimmedName },
        include: { _count: { select: { notes: true } } },
      });
    }),

  /** Delete a folder, moving all notes to root level */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const folder = await ctx.db.folder.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
      });

      if (!folder) {
        const exists = await ctx.db.folder.findUnique({
          where: { id: input.id },
        });
        if (exists) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Not your folder",
          });
        }
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Folder not found",
        });
      }

      // Atomic: move notes to root, then delete folder
      await ctx.db.$transaction([
        ctx.db.note.updateMany({
          where: { folderId: input.id },
          data: { folderId: null },
        }),
        ctx.db.folder.delete({ where: { id: input.id } }),
      ]);

      return { success: true };
    }),
});
