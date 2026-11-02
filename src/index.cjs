/**
 *
 *	@Project: @cldmv/eslint-plugin-jsonv
 *	@Filename: /src/index.cjs
 *	@Date: 2026-11-01T12:06:11-08:00 (1793563571)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-01T16:27:58-08:00 (1793579278)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * CommonJS entry point: a thin, synchronous re-export of the ESM plugin.
 *
 * Node's `require()` loads an ES module synchronously as long as its module graph has no
 * top-level await, so this file re-exports `./index.mjs` instead of a second CJS bundle.
 * `require("@cldmv/eslint-plugin-jsonv")` returns the plugin object itself (the ESM default
 * export), which is the shape an `eslint.config.cjs` puts under `plugins`.
 *
 * Node.js versions without require(esm) would fail with a bare ERR_REQUIRE_ESM, so the check
 * below fails early with a message that says what to do instead.
 *
 * tsup.config.mjs copies this file verbatim to dist/index.cjs. Its `require("./index.mjs")`
 * resolves to the sibling src/index.mjs in a checkout and to the bundle in dist/.
 *
 * @module @cldmv/eslint-plugin-jsonv
 */
"use strict";

if (!process.features?.require_module) {
	const error = new Error(
		`@cldmv/eslint-plugin-jsonv: require() needs Node.js ^20.19.0 or >=22.13.0 (this is ${process.version}). On older Node.js, load the package with import() instead.`
	);
	error.code = "ERR_REQUIRE_ESM";
	throw error;
}

module.exports = require("./index.mjs").default;
