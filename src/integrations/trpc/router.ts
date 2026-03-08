import { createTRPCRouter } from "./init";
import { driveRouter } from "./routers/drive";
import { mediaEditRouter } from "./routers/mediaEdit";
import { userRouter } from "./routers/user";

export const trpcRouter = createTRPCRouter({
  drive: driveRouter,
  mediaEdit: mediaEditRouter,
  user: userRouter,
});
export type TRPCRouter = typeof trpcRouter;
