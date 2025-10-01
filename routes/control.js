import { Router } from "express";
import {  getControls, putControls } from "../controllers/controlController.js";
import { jwtMiddleware } from "../middleware/verifyToken.js";
const routers = Router();

routers.put("/",jwtMiddleware, putControls);
routers.get("/",getControls)

export default routers;