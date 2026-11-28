/**
 *
 *	@Project: @cldmv/eslint-plugin-jsonv
 *	@Filename: /.configs/vitest.config.mjs
 *	@Date: 2026-09-28T03:32:46+00:00 (1790566366)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-07T22:16:46-08:00 (1794118606)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Vitest configuration for @cldmv/eslint-plugin-jsonv — runs the
 * `tests/**\/*.test.vitest.mjs` suite and measures v8 coverage of the plugin source in src/.
 * @module eslint-plugin-jsonv/vitest-config
 */
import { defineConfig, mergeConfig } from "vitest/config";
import { devCondition } from "@cldmv/configs/vitest.config.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Anchor the project root to the package directory so include/exclude work no
// matter what cwd vitest is invoked from.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// devCondition() puts the package's eslint-plugin-jsonv-dev condition (which routes the "."
// export to src/) ahead of Vite's default conditions for the client and SSR resolvers, and on
// the worker command line, so Node's own resolver loads src/ too.
// `--mode=dist` (npm run test:dist) leaves the -dev condition off, so tests that import "@cldmv/eslint-plugin-jsonv" by name run
// against the build in dist/ instead of src/.
export default defineConfig(({ mode }) =>
	mergeConfig(
		mode === "dist" ? {} : devCondition({ root }),
		defineConfig({
			root,
			test: {
				include: ["tests/**/*.test.vitest.mjs"],
				exclude: ["node_modules"],
				environment: "node",
				testTimeout: 30000,
				// "dot" keeps CI logs to one character per test file instead of a full
				// "RUN vX.Y.Z" + per-file pass/fail block for every file. The final
				// "Test Files X passed" / "Tests Y passed" summary is unaffected.
				reporters: ["dot"],
				coverage: {
					provider: "v8",
					// The plugin source. src/index.cjs is a few lines loaded through require(), which
					// tests/cjs-entry.test.vitest.mjs and tests/cjs/entry.test.cjs check directly.
					include: ["src/**/*.mjs"],
					exclude: ["tests/**", "dist/**"],
					reporter: ["text", "html", "json-summary", "json"]
				}
			}
		})
	)
);
