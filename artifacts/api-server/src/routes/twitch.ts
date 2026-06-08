import { Router, type IRouter } from "express";
import * as twitchBot from "../lib/twitch-bot.js";

const router: IRouter = Router();

router.get("/twitch/config", (_req, res): void => {
  res.json(twitchBot.getConfig());
});

router.put("/twitch/config", (req, res): void => {
  const updated = twitchBot.setConfig(req.body);
  res.json(updated);
});

router.get("/twitch/command-log", (_req, res): void => {
  res.json(twitchBot.getCommandLog());
});

export default router;
