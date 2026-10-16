import { Router, type IRouter } from "express";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import healthRouter from "./health";
import organizationRouter from "./organization";
import preferencesRouter from "./preferences";
import questionnairesRouter from "./questionnaires";
import regionalRouter from "./regional";
import reviewsRouter from "./reviews";
import settingsRouter from "./settings";
import shopperRouter from "./shopper";
import shoppersRouter from "./shoppers";
import storesRouter from "./stores";
import submissionsRouter from "./submissions";
import tasksRouter from "./tasks";
import usersRouter from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(storesRouter);
router.use(shoppersRouter);
router.use(settingsRouter);
router.use(preferencesRouter);
router.use(organizationRouter);
router.use(tasksRouter);
router.use(questionnairesRouter);
router.use(submissionsRouter);
router.use(shopperRouter);
router.use(reviewsRouter);
router.use(regionalRouter);

export default router;
