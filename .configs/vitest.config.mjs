/**
 * @fileoverview Vitest configuration for @cldmv/eslint-plugin-jsonv — runs the
 * `tests/**\/*.test.vitest.mjs` suite and measures v8 coverage of the plugin entry.
 * @module eslint-plugin-jsonv/vitest-config
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Anchor the project root to the package directory so include/exclude work no
// matter what cwd vitest is invoked from.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
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
			// The published plugin is the single `index.mjs` entry (the build copies it
			// verbatim to dist/). scripts/build.mjs is exercised in a child process by
			// tests/build.test.vitest.mjs, where v8 cannot attribute it, so it is not
			// part of the measured surface.
			include: ["index.mjs"],
			exclude: ["tests/**", "dist/**", "scripts/**"],
			reporter: ["text", "html", "json-summary", "json"]
		}
	}
});
