import { createTRPCRouter } from "./init";
import { driveRouter } from "./routers/drive";
import { folderRouter } from "./routers/folder";
import { mediaEditRouter } from "./routers/mediaEdit";
import { shareRouter } from "./routers/share";
import { userRouter } from "./routers/user";

export const trpcRouter = createTRPCRouter({
  drive: driveRouter,
  folder: folderRouter,
  mediaEdit: mediaEditRouter,
  share: shareRouter,
  user: userRouter,
});
export type TRPCRouter = typeof trpcRouter;
