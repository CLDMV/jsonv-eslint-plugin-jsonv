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
 *  - dist/*.mjs: one file per src/*.mjs module (`bundle: false`), each minified in place with
 *    names kept. Nothing is merged or duplicated, so `JsonvSourceCode` is the same class whether
 *    it comes from the package root's language or from the `./source-code` subpath, and imports
 *    of dependencies and peers stay as written.
 *  - dist/index.cjs: the hand-written CJS entry src/index.cjs, copied verbatim by onSuccess below
 *    and never transformed by esbuild. It `require()`s ./index.mjs, which Node loads synchronously
 *    because the module graph has no top-level await.
 *
 * The `dist/*.d.mts` declarations are generated afterwards by `npm run types:build`. Sourcemaps are generated for
 * local debugging but excluded from the published tarball via package.json's `files` negation entry.
 */
import { copyFileSync } from "node:fs";
import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/*.mjs"],
	bundle: false,
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
	outExtension() {
		return { js: ".mjs" };
	},
	onSuccess() {
		copyFileSync("src/index.cjs", "dist/index.cjs");
	}
});
