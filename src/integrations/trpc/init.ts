import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { auth } from "#/lib/auth";

export type TRPCContext = {
  session: Awaited<ReturnType<typeof auth.api.getSession>> | null;
  request: Request;
};

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});
