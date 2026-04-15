import "dotenv/config";
import express from "express";
import cors from "cors";
import { createInvectRouter } from "@invect/express";
import { startExternalApiMocks, stopExternalApiMocks } from "./mock-external-apis";
import { invectConfig } from "./invect.config";

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

if (process.env.INVECT_MOCK_EXTERNAL_APIS === "true") {
  startExternalApiMocks();
}

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-User-ID", "x-user-id"],
  }),
);
app.use(express.json());

// Mount Invect routes under /invect (or a path of your choice)
app.use("/invect", await createInvectRouter(invectConfig));

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Hello from Express!",
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Express server running on http://localhost:${port}`);
});

process.on("SIGINT", () => {
  stopExternalApiMocks();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopExternalApiMocks();
  process.exit(0);
});
