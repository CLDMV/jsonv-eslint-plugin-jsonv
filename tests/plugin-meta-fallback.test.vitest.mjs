/**
 * @fileoverview Exercises `readPackageMeta`'s parent-directory fallback branch (used
 * when `scripts/build.mjs`'s verbatim copy lands this file one directory deeper than
 * its own `package.json`) by mocking `node:fs`/`node:module`, rather than physically
 * copying index.mjs to a different path — a real copy runs as a distinct v8-covered
 * script and its execution can't be attributed back to this tracked file's coverage.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

// index.mjs's own directory: the repo root (one level up from this tests/ directory).
const indexDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localPath = path.join(indexDir, "package.json");
const fallbackPath = path.join(indexDir, "..", "package.json");

describe("readPackageMeta — parent-directory fallback branch", () => {
	afterEach(() => {
		vi.doUnmock("node:fs");
		vi.doUnmock("node:module");
		vi.resetModules();
	});

	it("requires the parent-directory package.json when none is co-located with this file", async () => {
		const requireCalls = [];

		vi.doMock("node:fs", async (importOriginal) => ({
			...(await importOriginal()),
			existsSync: () => false
		}));
		vi.doMock("node:module", async (importOriginal) => ({
			...(await importOriginal()),
			createRequire: () => (id) => {
				requireCalls.push(id);
				return { name: "@cldmv/eslint-plugin-jsonv", version: "0.0.0-mocked" };
			}
		}));

		const plugin = (await import("../index.mjs")).default;

		expect(requireCalls).toEqual([fallbackPath]);
		expect(requireCalls[0]).not.toBe(localPath);
		expect(plugin.meta).toEqual({ name: "@cldmv/eslint-plugin-jsonv", version: "0.0.0-mocked" });
	});
});
