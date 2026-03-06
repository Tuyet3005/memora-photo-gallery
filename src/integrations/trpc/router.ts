import { createTRPCRouter } from "./init";
import { driveRouter } from "./routers/drive";

export const trpcRouter = createTRPCRouter({
  drive: driveRouter,
});
export type TRPCRouter = typeof trpcRouter;
