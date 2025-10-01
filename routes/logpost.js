import { Router } from "express";
import {
  getAnalysis,
  getLogs,
  getLogsTime,
  getUptime,
  postLogs,
} from "../controllers/logControllers.js";
import { jwtMiddleware } from "../middleware/verifyToken.js";

const routes = Router();

routes.post("/",jwtMiddleware , postLogs);

routes.get("/", getLogs);

routes.get("/time", getLogsTime);

routes.get("/analysis", getAnalysis);

routes.get("/chart", getUptime);


export default routes;