import { createTRPCRouter } from "./init";
import { driveRouter } from "./routers/drive";
import { mediaEditRouter } from "./routers/mediaEdit";
import { shareRouter } from "./routers/share";
import { userRouter } from "./routers/user";

export const trpcRouter = createTRPCRouter({
  drive: driveRouter,
  mediaEdit: mediaEditRouter,
  share: shareRouter,
  user: userRouter,
});
export type TRPCRouter = typeof trpcRouter;
