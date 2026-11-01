/**
 *
 *	@Project: @cldmv/eslint-plugin-jsonv
 *	@Filename: /tests/cjs-entry.test.vitest.mjs
 *	@Date: 2026-11-01T12:06:56-08:00 (1793563616)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-01T12:07:54-08:00 (1793563674)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview The CommonJS entry, from source: `require("src/index.cjs")` returns the ESM
 * plugin object itself, the package name resolves to src/ under the `eslint-plugin-jsonv-dev`
 * condition, and the require(esm) guard explains itself on a Node.js without require(esm).
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import plugin from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const cjsEntry = path.join(root, "src", "index.cjs");

describe("src/index.cjs", () => {
	it("exports the plugin object itself, not the ESM namespace", () => {
		const cjs = require(cjsEntry);
		// Node's own loader (not Vitest's module graph) loads both, so they share one module instance.
		expect(cjs).toBe(require(path.join(root, "src", "index.mjs")).default);
		expect(Object.keys(cjs).sort()).toEqual(Object.keys(plugin).sort());
		expect(cjs.meta).toEqual(plugin.meta);
	});

	it("is what the package name resolves to for require() under the dev condition", () => {
		const probe = 'console.log(require.resolve("@cldmv/eslint-plugin-jsonv"))';
		const result = spawnSync(process.execPath, ["--conditions=eslint-plugin-jsonv-dev", "-e", probe], { cwd: root, encoding: "utf8" });
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout.trim()).toBe(cjsEntry);
	});

	it("throws ERR_REQUIRE_ESM with the supported Node.js range when require(esm) is unavailable", () => {
		// --no-experimental-require-module turns process.features.require_module off, which is
		// exactly the state of a Node.js release older than the package's floor.
		const probe = `try { require(${JSON.stringify(cjsEntry)}); } catch (error) { console.log(JSON.stringify({ code: error.code, message: error.message })); }`;
		const result = spawnSync(process.execPath, ["--no-experimental-require-module", "--no-warnings", "-e", probe], { encoding: "utf8" });
		expect(result.status, result.stderr).toBe(0);
		const { code, message } = JSON.parse(result.stdout);
		expect(code).toBe("ERR_REQUIRE_ESM");
		expect(message).toContain("@cldmv/eslint-plugin-jsonv: require() needs Node.js ^20.19.0 or >=22.13.0");
	});
});
