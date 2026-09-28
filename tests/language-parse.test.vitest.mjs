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

const EMPTY_PROGRAM = { type: "Program", body: [], sourceType: "module", comments: [], tokens: [] };

describe("parse() — valid input", () => {
	it("returns ok with a minimal Program AST and the parsed value", () => {
		const result = run('{ a: 1, b: "x" }');
		expect(result.ok).toBe(true);
		expect(result.ast).toEqual(EMPTY_PROGRAM);
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
	it.each([
		["empty file", "", "Unexpected token: EOF at line 1, column 0"],
		["missing value", "{ a: }", "Unexpected token: RBRACE at line 1, column 5"],
		["unterminated array", "{\n  a: 1,\n  b: [1, 2\n}", "Expected ',' or ']' in array at line 4, column 0"],
		["computed key", "{ [k]: 1 }", "Expected property key, got LBRACKET at line 1, column 2"],
		["function value", "{ a: function() {} }", "Unexpected character: '('"],
		["undefined reference", "{ a: missing }", "Unresolved reference: missing (circular reference or undefined)"],
		["circular reference", "{ a: b, b: a }", "Unresolved reference: b (circular reference or undefined)"]
	])("reports %s as a single error", (_label, body, message) => {
		const result = run(body);
		expect(result.ok).toBe(false);
		expect(result).not.toHaveProperty("ast");
		expect(result.errors).toEqual([{ message, line: 1, column: 1 }]);
	});

	it("reports every error at line 1, column 1 because parser errors carry the position only in the message", () => {
		const result = run("[\n\n\n  1,\n  }");
		expect(result.errors[0].message).toMatch(/at line 5, column 2$/);
		expect(result.errors[0].line).toBe(1);
		expect(result.errors[0].column).toBe(1);
	});
});
