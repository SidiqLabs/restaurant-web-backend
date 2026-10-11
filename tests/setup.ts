import { randomBytes } from "node:crypto";
import { installIsolatedDatabaseGuard } from "../scripts/isolated-database-guard.js";

// Never replace the operator's URL with a development or shared database.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = randomBytes(32).toString("hex");
process.env.LOG_LEVEL = "silent";
installIsolatedDatabaseGuard();
