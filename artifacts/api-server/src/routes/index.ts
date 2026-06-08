import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import vmRouter from "./vm.js";
import snapshotsRouter from "./snapshots.js";
import inputRouter from "./input.js";
import twitchRouter from "./twitch.js";
import downloadRouter from "./download.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(vmRouter);
router.use(snapshotsRouter);
router.use(inputRouter);
router.use(twitchRouter);
router.use(downloadRouter);

export default router;
