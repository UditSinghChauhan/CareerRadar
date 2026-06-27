import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profileRouter from "./profile";
import settingsRouter from "./settings";
import dashboardRouter from "./dashboard";
import companiesRouter from "./companies";
import jobsRouter from "./jobs";
import applicationsRouter from "./applications";
import bookmarksRouter from "./bookmarks";
import savedSearchesRouter from "./savedSearches";
import providersRouter from "./providers";
import syncRouter from "./sync";
import catalogRouter from "./catalog";
import sourcesRouter from "./sources";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(settingsRouter);
router.use(dashboardRouter);
router.use(companiesRouter);
router.use(jobsRouter);
router.use(applicationsRouter);
router.use(bookmarksRouter);
router.use(savedSearchesRouter);
router.use(providersRouter);
router.use(syncRouter);
router.use(catalogRouter);
router.use(sourcesRouter);

export default router;
