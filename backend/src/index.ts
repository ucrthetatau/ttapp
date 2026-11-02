import cookieParser from "cookie-parser";
import express from "express";
import { healthRouter } from "./common/health.ts";
import { assertVotePrivacy } from "./common/permissions.ts";
import { authRouter } from "./features/auth/routes.ts";
import { driveLinksRouter } from "./features/drive-links/routes.ts";
import { jobsRouter } from "./features/jobs/routes.ts";
import { membersRouter } from "./features/members/routes.ts";
import { postsRouter } from "./features/posts/routes.ts";

assertVotePrivacy();

const app = express();
app.use(express.json());
app.use(cookieParser());

// Each feature folder in src/features/ exports a router that gets mounted here.
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/drive-links", driveLinksRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/members", membersRouter);
app.use("/api/posts", postsRouter);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
