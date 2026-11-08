/**
 *
 *	@Project: @cldmv/eslint-plugin-jsonv
 *	@Filename: /tests/resolve.test.vitest.mjs
 *	@Date: 2026-11-07T22:16:36-08:00 (1794118596)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-07T22:16:58-08:00 (1794118618)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * The tests import "@cldmv/eslint-plugin-jsonv" by name, so the eslint-plugin-jsonv-dev condition decides what they run against: src/ for `npm test`, the
 * build in dist/ for `npm run test:dist` (`--mode=dist`). This checks the name resolved to that tree.
 */
import { describe, it, expect } from "vitest";
import * as pkg from "@cldmv/eslint-plugin-jsonv";

describe("the @cldmv/eslint-plugin-jsonv import", () => {
	it(`resolves to ${import.meta.env.MODE === "dist" ? "dist/" : "src/"}`, async () => {
		const expected = import.meta.env.MODE === "dist" ? await import("../dist/index.mjs") : await import("../src/index.mjs");
		expect(pkg.default).toBe(expected.default);
		expect(pkg.JsonvSourceCode).toBe(expected.JsonvSourceCode);
	});
});
