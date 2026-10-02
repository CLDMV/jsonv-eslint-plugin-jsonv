/**
 *
 *	@Project: @cldmv/eslint-plugin-jsonv
 *	@Filename: /tests/build.test.vitest.mjs
 *	@Date: 2026-09-28T03:32:46+00:00 (1790566366)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-02T12:15:40-07:00 (1790968540)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview scripts/build.mjs copies index.mjs to dist/index.mjs. Runs the
 * script in an isolated working directory under the repo's tmp/ so the real
 * dist/ is never touched.
 */
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildScript = path.join(root, "scripts", "build.mjs");
const tmpRoot = path.join(root, "tmp");
const created = [];

/**
 * Creates an empty working directory for one build run.
 * @returns {string} Absolute path of the directory.
 * @example
 * const cwd = makeWorkDir();
 */
function makeWorkDir() {
	mkdirSync(tmpRoot, { recursive: true });
	const dir = mkdtempSync(path.join(tmpRoot, "build-test-"));
	created.push(dir);
	return dir;
}

afterEach(() => {
	while (created.length) rmSync(created.pop(), { recursive: true, force: true });
});

describe("scripts/build.mjs", () => {
	it("copies index.mjs to dist/index.mjs, creating dist/", () => {
		const cwd = makeWorkDir();
		writeFileSync(path.join(cwd, "index.mjs"), "export default 42;\n");
		const result = spawnSync(process.execPath, [buildScript], { cwd, encoding: "utf8" });
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("✓ Copied index.mjs → dist/index.mjs");
		expect(readFileSync(path.join(cwd, "dist", "index.mjs"), "utf8")).toBe("export default 42;\n");
	});

	it("exits 1 with an error message when index.mjs is missing", () => {
		const cwd = makeWorkDir();
		const result = spawnSync(process.execPath, [buildScript], { cwd, encoding: "utf8" });
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("✗ Error: Unable to copy index.mjs to dist");
		expect(result.stderr).toContain("ENOENT");
		expect(existsSync(path.join(cwd, "dist"))).toBe(false);
	});
});
