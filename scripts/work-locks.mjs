#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LOCK_FILE = path.join(ROOT, "docs", ".work-locks.json");

function loadLocks() {
  if (!fs.existsSync(LOCK_FILE)) {
    return [];
  }

  const raw = fs.readFileSync(LOCK_FILE, "utf8").trim();

  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("Invalid work-lock file: expected an array.");
  }

  return parsed;
}

function saveLocks(locks) {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  fs.writeFileSync(
    LOCK_FILE,
    `${JSON.stringify(locks, null, 2)}\n`,
    "utf8",
  );
}

function normalizeTarget(value) {
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));

  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`Invalid repository path: ${value}`);
  }

  return normalized.replace(/^\.\//, "");
}

function overlaps(a, b) {
  return (
    a === b ||
    a.startsWith(`${b}/`) ||
    b.startsWith(`${a}/`)
  );
}

function printLocks(locks) {
  if (locks.length === 0) {
    console.log("NO_ACTIVE_LOCKS");
    return;
  }

  for (const lock of locks) {
    console.log(
      [
        `OWNER=${lock.owner}`,
        `SCOPE=${lock.scope}`,
        `PATHS=${lock.paths.join(",")}`,
        `CREATED_AT=${lock.createdAt}`,
      ].join(" | "),
    );
  }
}

const [, , command, ...args] = process.argv;

try {
  const locks = loadLocks();

  switch (command) {
    case "list": {
      printLocks(locks);
      break;
    }

    case "check": {
      if (args.length !== 1) {
        throw new Error("Usage: lock:check -- <path>");
      }

      const target = normalizeTarget(args[0]);

      const conflicts = locks.filter((lock) =>
        lock.paths.some((lockedPath) => overlaps(target, lockedPath)),
      );

      if (conflicts.length === 0) {
        console.log(`FREE ${target}`);
        break;
      }

      for (const lock of conflicts) {
        console.log(
          `ACTIVE ${target} OWNER=${lock.owner} SCOPE=${lock.scope}`,
        );
      }

      process.exitCode = 2;
      break;
    }

    case "add": {
      if (args.length < 3) {
        throw new Error(
          "Usage: lock:add -- <owner> <scope> <path...>",
        );
      }

      const [owner, scope, ...rawPaths] = args;

      if (!owner.trim() || !scope.trim()) {
        throw new Error("Owner and scope are required.");
      }

      const paths = [...new Set(rawPaths.map(normalizeTarget))];

      const conflicts = locks.filter(
        (lock) =>
          lock.owner !== owner &&
          paths.some((target) =>
            lock.paths.some((lockedPath) => overlaps(target, lockedPath)),
          ),
      );

      if (conflicts.length > 0) {
        printLocks(conflicts);
        throw new Error("Lock conflict detected.");
      }

      const sameScopeIndex = locks.findIndex(
        (lock) => lock.owner === owner && lock.scope === scope,
      );

      const entry = {
        owner,
        scope,
        paths,
        createdAt: new Date().toISOString(),
      };

      if (sameScopeIndex >= 0) {
        locks[sameScopeIndex] = entry;
      } else {
        locks.push(entry);
      }

      saveLocks(locks);

      console.log(
        `LOCK_ADDED OWNER=${owner} SCOPE=${scope} PATHS=${paths.join(",")}`,
      );

      break;
    }

    case "remove": {
      if (args.length !== 2) {
        throw new Error(
          "Usage: lock:remove -- <owner> <scope>",
        );
      }

      const [owner, scope] = args;

      const remaining = locks.filter(
        (lock) => !(lock.owner === owner && lock.scope === scope),
      );

      if (remaining.length === locks.length) {
        throw new Error(
          `Lock not found for owner=${owner} scope=${scope}`,
        );
      }

      saveLocks(remaining);

      console.log(`LOCK_REMOVED OWNER=${owner} SCOPE=${scope}`);
      break;
    }

    default:
      throw new Error(
        "Commands: list | check | add | remove",
      );
  }
} catch (error) {
  console.error(
    `WORK_LOCK_ERROR=${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
