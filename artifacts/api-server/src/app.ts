import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { attachUser } from "./lib/auth";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Resolves the bearer token (when one is present) onto `req.authUser`.
app.use(async (req, _res, next) => {
  try {
    await attachUser(req);
  } catch (error) {
    logger.warn({ err: error }, "Failed to resolve session");
  }
  next();
});

app.use("/api", router);
app.use(((error, req, res, _next) => {
  req.log.error({ err: error }, "Unhandled API request");
  if (res.headersSent) return;
  res.status(500).json({ error: "An unexpected server error occurred." });
}) satisfies ErrorRequestHandler);

export default app;
