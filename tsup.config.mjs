/**
 *
 *	@Project: @cldmv/eslint-plugin-jsonv
 *	@Filename: /tsup.config.mjs
 *	@Date: 2026-11-01T12:06:11-08:00 (1793563571)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-01T12:07:55-08:00 (1793563675)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Bundler config: produces the published dist/ output from src/.
 *
 *  - dist/index.mjs: tsup bundle of src/index.mjs (minified, names kept). Runtime dependencies
 *    (`@eslint/core`, `@eslint/plugin-kit`) and the `@cldmv/jsonv` / `eslint` peers stay external.
 *  - dist/index.cjs: the hand-written CJS entry src/index.cjs, copied verbatim by onSuccess below
 *    and never transformed by esbuild. It `require()`s ./index.mjs, which Node loads synchronously
 *    because the module graph has no top-level await.
 *
 * `dist/index.d.mts` is generated afterwards by `npm run build:types`. Sourcemaps are generated for
 * local debugging but excluded from the published tarball via package.json's `files` negation entry.
 */
import { copyFileSync } from "node:fs";
import { defineConfig } from "tsup";

export default defineConfig({
	entry: { index: "src/index.mjs" },
	format: ["esm"],
	outDir: "dist",
	target: "node20",
	platform: "node",
	splitting: false,
	sourcemap: true,
	dts: false,
	minify: true,
	keepNames: true,
	removeNodeProtocol: false,
	clean: true,
	external: ["@eslint/core", "@eslint/plugin-kit", "@cldmv/jsonv", "eslint"],
	outExtension() {
		return { js: ".mjs" };
	},
	onSuccess() {
		copyFileSync("src/index.cjs", "dist/index.cjs");
	}
});
