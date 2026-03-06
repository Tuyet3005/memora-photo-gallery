import { createTRPCRouter } from "./init";
import { driveRouter } from "./routers/drive";
import { userRouter } from "./routers/user";

export const trpcRouter = createTRPCRouter({
  drive: driveRouter,
  user: userRouter,
});
export type TRPCRouter = typeof trpcRouter;
