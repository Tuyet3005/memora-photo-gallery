import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { uploadDelegation, user } from "#/db/schema";
import { createTRPCRouter, protectedProcedure } from "../init";

export const userRouter = createTRPCRouter({
  /** Returns the current user's stored preferences: home folder ID and the
   * active upload delegation ID (null means upload as themselves). */
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const prefs = await db
      .select({
        homeFolderId: user.homeFolderId,
        uploadDelegationId: user.uploadDelegationId,
      })
      .from(user)
      .where(eq(user.id, ctx.session.user.id))
      .limit(1)
      .get();
    return {
      homeFolderId: prefs?.homeFolderId ?? null,
      uploadDelegationId: prefs?.uploadDelegationId ?? null,
    };
  }),

  /** Persists the user's preferred home folder (null = Memora root). */
  setHomeFolderPreference: protectedProcedure
    .input(z.object({ folderId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(user)
        .set({ homeFolderId: input.folderId })
        .where(eq(user.id, ctx.session.user.id));
      return { success: true };
    }),

  /** Looks up a registered user by email address. Used when setting up
   * upload delegations to resolve an email to an account ID. */
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

  /** Grants another user (grantee) permission to upload to the current user's
   * (grantor's) Drive folders. Idempotent — throws CONFLICT if already granted. */
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

  /** Returns all users who have granted upload delegation to the current user,
   * along with the currently active delegation selection. */
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

  /** Saves which upload delegation is currently active for the user.
   * Pass null to reset to uploading as themselves. Validates the delegation
   * belongs to the current user before saving. */
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

  /** Removes an upload delegation record. Either the grantor or the grantee
   * may revoke. Automatically clears the active preference if it pointed to
   * the revoked delegation. */
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
