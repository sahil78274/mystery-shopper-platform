import { Router, type IRouter } from "express";
import dashboardRouter from "./dashboard";
import healthRouter from "./health";
import questionnairesRouter from "./questionnaires";
import shoppersRouter from "./shoppers";
import storesRouter from "./stores";
import tasksRouter from "./tasks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(storesRouter);
router.use(shoppersRouter);
router.use(tasksRouter);
router.use(questionnairesRouter);

export default router;
