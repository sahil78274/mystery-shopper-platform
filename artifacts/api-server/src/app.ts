import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { attachUser } from "./lib/auth";
import { classifyRequestBodyError } from "./lib/http-error";

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
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});
app.use(((error, req, res, _next) => {
  const bodyError = classifyRequestBodyError(error);
  if (bodyError) {
    // Parser errors can carry the raw request body; log only the safe error type.
    req.log.warn({ status: bodyError.status, type: bodyError.type }, "Rejected request body");
    res.status(bodyError.status).json({ error: bodyError.message });
    return;
  }
  req.log.error({ err: error }, "Unhandled API request");
  if (res.headersSent) return;
  res.status(500).json({ error: "An unexpected server error occurred." });
}) satisfies ErrorRequestHandler);

export default app;
