import express from "express";
import cors from "cors";
import pino from "pino";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import { startBot } from "./bot/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env["PORT"] ?? "3000");

const logger = pino({ level: "info" });

const app = express();
app.use(pinoHttp({ logger }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
app.use("/public", express.static(path.join(__dirname, "../public")));

app.listen(port, () => {
  logger.info({ port }, "Server listening");
});

startBot().catch((err) => {
  logger.error({ err }, "Failed to start Discord bot");
  process.exit(1);
});
