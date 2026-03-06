import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { uploadDelegation, user } from "#/db/schema";
import { createTRPCRouter, protectedProcedure } from "../init";

export const userRouter = createTRPCRouter({
  findByEmail: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const found = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        })
        .from(user)
        .where(eq(user.email, input.email))
        .limit(1)
        .get();
      return found ?? null;
    }),

  grantDelegation: protectedProcedure
    .input(z.object({ granteeEmail: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const grantee = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, input.granteeEmail))
        .limit(1)
        .get();

      if (!grantee) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (grantee.id === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delegate to yourself",
        });
      }

      const existing = await db
        .select({ id: uploadDelegation.id })
        .from(uploadDelegation)
        .where(
          and(
            eq(uploadDelegation.grantorId, ctx.session.user.id),
            eq(uploadDelegation.granteeId, grantee.id),
          ),
        )
        .limit(1)
        .get();

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Already delegated to this user",
        });
      }

      const id = crypto.randomUUID();
      const now = new Date();
      await db.insert(uploadDelegation).values({
        id,
        grantorId: ctx.session.user.id,
        granteeId: grantee.id,
        createdAt: now,
      });

      return {
        id,
        grantorId: ctx.session.user.id,
        granteeId: grantee.id,
        createdAt: now,
      };
    }),

  listMyGrantors: protectedProcedure.query(async ({ ctx }) => {
    const currentUser = await db
      .select({ uploadDelegationId: user.uploadDelegationId })
      .from(user)
      .where(eq(user.id, ctx.session.user.id))
      .limit(1)
      .get();

    const grantor = db.select().from(user).as("grantor");

    const delegations = await db
      .select({
        delegationId: uploadDelegation.id,
        grantorId: uploadDelegation.grantorId,
        grantorName: grantor.name,
        grantorEmail: grantor.email,
        grantorImage: grantor.image,
      })
      .from(uploadDelegation)
      .innerJoin(grantor, eq(uploadDelegation.grantorId, grantor.id))
      .where(eq(uploadDelegation.granteeId, ctx.session.user.id));

    return {
      selectedDelegationId: currentUser?.uploadDelegationId ?? null,
      grantors: delegations,
    };
  }),

  setUploadDelegationPreference: protectedProcedure
    .input(z.object({ delegationId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      if (input.delegationId !== null) {
        const delegation = await db
          .select({ id: uploadDelegation.id })
          .from(uploadDelegation)
          .where(
            and(
              eq(uploadDelegation.id, input.delegationId),
              eq(uploadDelegation.granteeId, ctx.session.user.id),
            ),
          )
          .limit(1)
          .get();

        if (!delegation) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      await db
        .update(user)
        .set({ uploadDelegationId: input.delegationId })
        .where(eq(user.id, ctx.session.user.id));

      return { success: true };
    }),

  revokeDelegation: protectedProcedure
    .input(z.object({ delegationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await db
        .select()
        .from(uploadDelegation)
        .where(eq(uploadDelegation.id, input.delegationId))
        .limit(1)
        .get();

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (
        row.grantorId !== ctx.session.user.id &&
        row.granteeId !== ctx.session.user.id
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await db
        .delete(uploadDelegation)
        .where(eq(uploadDelegation.id, input.delegationId));

      // Clear the preference if it pointed to this delegation
      await db
        .update(user)
        .set({ uploadDelegationId: null })
        .where(
          and(
            eq(user.id, ctx.session.user.id),
            eq(user.uploadDelegationId, input.delegationId),
          ),
        );

      return { success: true };
    }),
});
