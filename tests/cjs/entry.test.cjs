/**
 *
 *	@Project: @cldmv/eslint-plugin-jsonv
 *	@Filename: /tests/cjs/entry.test.cjs
 *	@Date: 2026-11-01T12:06:18-08:00 (1793563578)
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
 * @fileoverview Checks the built dist/ output: `require()` of dist/index.cjs returns the same
 * plugin object as the ESM default export of dist/index.mjs, and that object works with ESLint.
 * Run after `npm run build` (see `test:dist`).
 */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "../..");
const dist = path.join(root, "dist");

test("dist/index.cjs is the ESM default export", async () => {
	const esm = await import(pathToFileURL(path.join(dist, "index.mjs")).href);
	const cjs = require(path.join(dist, "index.cjs"));
	assert.equal(cjs, esm.default);
	assert.deepEqual(Object.keys(cjs).sort(), ["configs", "languages", "meta", "rules"]);
});

test("dist/index.cjs is a verbatim copy of src/index.cjs, not a bundle", () => {
	assert.equal(fs.readFileSync(path.join(dist, "index.cjs"), "utf8"), fs.readFileSync(path.join(root, "src/index.cjs"), "utf8"));
});

test("the built plugin reads its meta from the package root", () => {
	const pkg = require(path.join(root, "package.json"));
	assert.deepEqual(require(path.join(dist, "index.cjs")).meta, { name: pkg.name, version: pkg.version });
});

test("the built plugin lints a .jsonv file through a CommonJS config", () => {
	const { Linter } = require("eslint");
	const jsonv = require(path.join(dist, "index.cjs"));
	const config = [{ files: ["**/*.jsonv"], plugins: { jsonv }, language: "jsonv/jsonv" }];
	const linter = new Linter({ configType: "flat" });
	assert.deepEqual(linter.verify("{ a: 1, b: a }", config, "x.jsonv"), []);
	const [problem] = linter.verify("{ a: }", config, "x.jsonv");
	assert.equal(problem.fatal, true);
});

test("the package root resolves to dist/ without the dev condition and to src/ with it", () => {
	const { spawnSync } = require("node:child_process");
	const probe = 'console.log(require.resolve("@cldmv/eslint-plugin-jsonv"))';
	const plain = spawnSync(process.execPath, ["-e", probe], { cwd: root, encoding: "utf8" });
	assert.equal(plain.status, 0, plain.stderr);
	assert.equal(plain.stdout.trim(), path.join(dist, "index.cjs"));
	const dev = spawnSync(process.execPath, ["--conditions=eslint-plugin-jsonv-dev", "-e", probe], { cwd: root, encoding: "utf8" });
	assert.equal(dev.status, 0, dev.stderr);
	assert.equal(dev.stdout.trim(), path.join(root, "src/index.cjs"));
});
