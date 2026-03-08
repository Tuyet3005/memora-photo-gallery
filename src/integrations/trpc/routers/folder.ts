import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { folderNote } from "#/db/schema";
import { NOTE_EDITOR_EMAILS } from "#/lib/constants";
import { createTRPCRouter, protectedProcedure } from "../init";

export { NOTE_EDITOR_EMAILS };

export const folderRouter = createTRPCRouter({
  getNote: protectedProcedure
    .input(z.object({ folderId: z.string() }))
    .query(async ({ input }) => {
      const row = await db
        .select()
        .from(folderNote)
        .where(eq(folderNote.folderId, input.folderId))
        .limit(1)
        .get();
      return { note: row?.note ?? "" };
    }),

  updateNote: protectedProcedure
    .input(z.object({ folderId: z.string(), note: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const email = ctx.session.user.email;
      if (
        !NOTE_EDITOR_EMAILS.includes(
          email as (typeof NOTE_EDITOR_EMAILS)[number],
        )
      ) {
        throw new Error("Not authorized to edit notes");
      }
      const now = new Date();
      await db
        .insert(folderNote)
        .values({
          folderId: input.folderId,
          note: input.note,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: folderNote.folderId,
          set: {
            note: input.note,
            updatedAt: now,
          },
        });
    }),
});
