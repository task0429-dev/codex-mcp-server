#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const fixtureDir = path.join(root, "memory-contracts", "v1", "fixtures");
const required = ["health.ok.json", "facets.ok.json", "error.forbidden.json"];

for (const name of required) {
  const full = path.join(fixtureDir, name);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing fixture: ${name}`);
  }
  const payload = JSON.parse(fs.readFileSync(full, "utf8"));
  if (payload.version !== "v1") {
    throw new Error(`Fixture ${name} has invalid version`);
  }
}

console.log("memory-contracts fixtures: ok");
