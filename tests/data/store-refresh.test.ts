import test from "node:test";
import assert from "node:assert/strict";
import { MemoryRepository, setRepository } from "@/lib/data/local-adapter";
import { getSnapshot, refreshDatabase } from "@/lib/data/store";
import { createEmptyDatabase } from "@/lib/data/seed";

test("failed reload invalidates old financial results and a complete retry recovers", async () => {
  const repo = new MemoryRepository();
  setRepository(repo);
  const db = createEmptyDatabase();
  await repo.replaceAll(db);
  await refreshDatabase();
  assert.equal(getSnapshot().status, "ready");

  const originalLoad = repo.load.bind(repo);
  repo.load = async () => { throw new Error("Financial data is incomplete."); };
  await assert.rejects(refreshDatabase(), /incomplete/);
  assert.equal(getSnapshot().status, "error");
  assert.equal(getSnapshot().data, null);

  repo.load = originalLoad;
  await refreshDatabase();
  assert.equal(getSnapshot().status, "ready");
  assert.deepEqual(getSnapshot().data, db);

  await repo.clear();
  await assert.rejects(refreshDatabase(), /reload/);
  assert.equal(getSnapshot().data, null);
  assert.equal(getSnapshot().status, "error");
});
