/**
 *
 *	@Project: @cldmv/eslint-plugin-jsonv
 *	@Filename: /tests/language-parse.test.vitest.mjs
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
 * @fileoverview Direct tests of `languages.jsonv.parse()` — the ESLint language
 * API entry point that runs the @cldmv/jsonv parser over a file body.
 */
import { describe, expect, it } from "vitest";
import plugin from "../index.mjs";

const { parse } = plugin.languages.jsonv;

/**
 * Parses a source string the way ESLint calls the language.
 * @param {string} body - File contents.
 * @param {object} [languageOptions] - Language options (omit to pass an empty context).
 * @returns {object} The parse result.
 * @example
 * run("{ a: 1 }", { year: 2015 });
 */
function run(body, languageOptions) {
	return parse({ body }, languageOptions === undefined ? {} : { languageOptions });
}

describe("parse() — valid input", () => {
	it("returns ok with a Program AST and the evaluated value", () => {
		const result = run('{ a: 1, b: "x" }');
		expect(result.ok).toBe(true);
		expect(result.ast.type).toBe("Program");
		expect(result.ast.body.type).toBe("ObjectExpression");
		expect(result.jsonvValue).toEqual({ a: 1, b: "x" });
	});

	it("falls back to default options when the context has no languageOptions", () => {
		const result = parse({ body: "{ a: 0b101, big: 12n }" }, {});
		expect(result.ok).toBe(true);
		expect(result.jsonvValue).toEqual({ a: 5, big: 12n });
	});

	it.each([
		["trailing commas", "[1, 2, 3,]", [1, 2, 3]],
		["top-level string", '"str"', "str"],
		["single-quoted string", "{ a: 'single' }", { a: "single" }],
		["hex / leading-dot numbers", "{ d: 0x1F, e: .5 }", { d: 31, e: 0.5 }],
		["NaN / Infinity", "{ n: NaN, i: Infinity }", { n: NaN, i: Infinity }],
		["octal literal", "{ a: 0o17 }", { a: 15 }],
		["numeric separators", "{ a: 1_000 }", { a: 1000 }],
		["line and block comments", "// head\n{ a: 1 /* inline */ }", { a: 1 }],
		["internal reference", "{ port: 8080, backup: port }", { port: 8080, backup: 8080 }],
		["forward reference", "{ backup: port, port: 8080 }", { backup: 8080, port: 8080 }],
		["template interpolation", '{ host: "h", port: 1, url: `http://${host}:${port}` }', { host: "h", port: 1, url: "http://h:1" }],
		["BOM prefix", "﻿{ a: 1 }", { a: 1 }]
	])("parses %s", (_label, body, expected) => {
		const result = run(body);
		expect(result.ok).toBe(true);
		expect(result.jsonvValue).toEqual(expected);
	});
});

describe("parse() — languageOptions", () => {
	it("gates BigInt literals below the ES2020 year", () => {
		expect(run("{ a: 1n }", { year: 2019 }).ok).toBe(false);
		expect(run("{ a: 1n }", { year: 2020 })).toMatchObject({ ok: true, jsonvValue: { a: 1n } });
	});

	it("gates numeric separators below the ES2021 year", () => {
		expect(run("{ a: 1_000 }", { year: 2020 }).errors[0].message).toBe("Numeric separators not allowed in this year");
		expect(run("{ a: 1_000 }", { year: 2021 }).ok).toBe(true);
	});

	it("gates binary literals below the ES2015 year", () => {
		expect(run("{ a: 0b1 }", { year: 2011 }).errors[0].message).toBe("Binary literals not allowed in this year");
		expect(run("{ a: 0b1 }", { year: 2015 }).ok).toBe(true);
	});

	it("gates template literals below the ES2015 year", () => {
		expect(run("{ a: `t` }", { year: 2011 }).errors[0].message).toBe("Unexpected character: '`'");
		expect(run("{ a: `t` }", { year: 2015 }).ok).toBe(true);
	});

	it("treats a falsy year as the 2025 default", () => {
		expect(run("{ a: 1_000n }", { year: 0 }).ok).toBe(true);
	});

	it("defaults strictBigInt to false, allowing unsafe integers", () => {
		expect(run("{ a: 99999999999999999999 }", {}).ok).toBe(true);
		expect(run("{ a: 99999999999999999999 }", { strictBigInt: false }).ok).toBe(true);
	});

	it("rejects unsafe integers without an `n` suffix when strictBigInt is true", () => {
		const result = run("{ a: 99999999999999999999 }", { strictBigInt: true });
		expect(result.ok).toBe(false);
		expect(result.errors[0].message).toMatch(/is outside safe integer range\. Use BigInt suffix 'n'/);
		expect(run("{ a: 99999999999999999999n }", { strictBigInt: true }).ok).toBe(true);
	});
});

describe("parse() — malformed input", () => {
	// @cldmv/jsonv 1.0.10 throws a `JsonvSyntaxError` (or its `LexerError` subclass) for every
	// parser-level and lexer-level failure, carrying a real `line`/`column`/`loc`. ESLint's
	// language API uses 1-based columns (`columnStart: 1`), while jsonv's `column` — like the
	// one embedded in its messages — is 0-based, so the reported column is `error.column + 1`.
	it.each([
		["empty file", "", "Unexpected token: EOF at line 1, column 0", { line: 1, column: 1, endLine: 1, endColumn: 1 }],
		["missing value", "{ a: }", "Unexpected token: RBRACE at line 1, column 5", { line: 1, column: 6, endLine: 1, endColumn: 7 }],
		[
			"unterminated array (multi-line, LF)",
			"{\n  a: 1,\n  b: [1, 2\n}",
			"Expected ',' or ']' in array at line 4, column 0",
			{ line: 4, column: 1, endLine: 4, endColumn: 2 }
		],
		[
			"unterminated array (multi-line, CRLF)",
			"{\r\n  a: 1,\r\n  b: [1, 2\r\n}",
			"Expected ',' or ']' in array at line 4, column 0",
			{ line: 4, column: 1, endLine: 4, endColumn: 2 }
		],
		[
			"computed key",
			"{ [k]: 1 }",
			"Expected property key, got LBRACKET at line 1, column 2",
			{ line: 1, column: 3, endLine: 1, endColumn: 4 }
		],
		[
			"function value (lexer error)",
			"{ a: function() {} }",
			"Unexpected character: '('",
			{ line: 1, column: 14, endLine: 1, endColumn: 14 }
		],
		["unterminated string (lexer error)", '{ a: "unterminated }', "Unterminated string", { line: 1, column: 21, endLine: 1, endColumn: 21 }]
	])("reports %s at its real source position", (_label, body, message, position) => {
		const result = run(body);
		expect(result.ok).toBe(false);
		expect(result).not.toHaveProperty("ast");
		expect(result.errors).toEqual([{ message, ...position }]);
	});

	it("reports a parser-level error at its real position across multiple lines", () => {
		const result = run("[\n\n\n  1,\n  }");
		expect(result.errors).toEqual([
			{
				message: expect.stringMatching(/at line 5, column 2$/),
				line: 5,
				column: 3,
				endLine: 5,
				endColumn: 4
			}
		]);
	});

	// @cldmv/jsonv throws a `JsonvReferenceError` for unresolved and circular internal references,
	// positioned on the offending reference node (0-based column, like syntax errors). Since 1.1.1
	// a true cycle gets its own "Circular reference: a -> b -> a" message, pointing at the reference
	// that closes the cycle rather than the first one in the chain.
	it.each([
		[
			"undefined reference",
			"{ a: missing }",
			"Unresolved reference: missing (circular reference or undefined)",
			{ line: 1, column: 6, endLine: 1, endColumn: 13 }
		],
		["circular reference", "{ a: b, b: a }", "Circular reference: a -> b -> a", { line: 1, column: 12, endLine: 1, endColumn: 13 }],
		[
			"unresolved template interpolation",
			"{\n  x: `${nope}`\n}",
			"Unresolved reference: <template> (circular reference or undefined)",
			{ line: 2, column: 6, endLine: 2, endColumn: 15 }
		]
	])("reports a %s at the reference's source position", (_label, body, message, position) => {
		const result = run(body);
		expect(result.ok).toBe(false);
		expect(result).not.toHaveProperty("ast");
		expect(result.errors).toEqual([{ message, ...position }]);
	});

	it("falls back to line 1, column 1 for an error that carries no position (call-stack exhaustion on deep nesting)", () => {
		const depth = 100000;
		const result = run("[".repeat(depth) + "]".repeat(depth));
		expect(result.ok).toBe(false);
		expect(result.errors).toEqual([{ message: expect.stringMatching(/call stack/i), line: 1, column: 1 }]);
	});
});
