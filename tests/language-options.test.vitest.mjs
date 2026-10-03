/**
 *
 *	@Project: @cldmv/eslint-plugin-jsonv
 *	@Filename: /tests/language-options.test.vitest.mjs
 *	@Date: 2026-09-28T20:00:50+00:00 (1790625650)
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
 * @fileoverview Every language option reaches @cldmv/jsonv: `parse()` forwards `year`, `mode`,
 * `strictBigInt`, `strictOctal` and `allowInternalReferences` (with the defaults filled in) to
 * both `parseWithOptions()` and `parseToAst()`, and the plugin's verdict for each mode is
 * exactly jsonv's own. The parser functions are wrapped in spies that call through to the real
 * implementations, so the parse results are jsonv's.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@cldmv/jsonv/parser", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		parseWithOptions: vi.fn(actual.parseWithOptions),
		parseToAst: vi.fn(actual.parseToAst)
	};
});

const { parseToAst, parseWithOptions } = await import("@cldmv/jsonv/parser");
const { default: plugin } = await import("../index.mjs");

const { parse } = plugin.languages.jsonv;
const defaults = { year: 2025, mode: "jsonv", strictBigInt: false, strictOctal: false, allowInternalReferences: true };

/**
 * Parses a source string the way ESLint calls the language.
 * @param {string} body - File contents.
 * @param {object} [languageOptions] - Language options (omit to pass an empty context).
 * @returns {object} The parse result.
 * @example
 * run("{ a: 1 }", { mode: "json" });
 */
function run(body, languageOptions) {
	return parse({ body }, languageOptions === undefined ? {} : { languageOptions });
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("parse() — options forwarded to @cldmv/jsonv", () => {
	it("forwards the defaults to both parser calls when the context has no languageOptions", () => {
		expect(run("{ a: 1 }").ok).toBe(true);
		expect(parseWithOptions).toHaveBeenCalledExactlyOnceWith("{ a: 1 }", { ...defaults, tolerant: false });
		expect(parseToAst).toHaveBeenCalledExactlyOnceWith("{ a: 1 }", defaults);
	});

	it("forwards ESLint's merged defaults (defaultLanguageOptions) unchanged", () => {
		run("{ a: 1 }", { ...plugin.languages.jsonv.defaultLanguageOptions });
		expect(parseWithOptions).toHaveBeenCalledExactlyOnceWith("{ a: 1 }", { ...defaults, tolerant: false });
		expect(parseToAst).toHaveBeenCalledExactlyOnceWith("{ a: 1 }", defaults);
	});

	it("forwards every option a config sets to both parser calls", () => {
		const options = { year: 2020, mode: "json5", strictBigInt: true, strictOctal: true, allowInternalReferences: false };
		expect(run("{ a: 1 }", options).ok).toBe(true);
		expect(parseWithOptions).toHaveBeenCalledExactlyOnceWith("{ a: 1 }", { ...options, tolerant: false });
		expect(parseToAst).toHaveBeenCalledExactlyOnceWith("{ a: 1 }", options);
	});

	it.each([
		["mode", "json"],
		["mode", "json5"],
		["strictOctal", true],
		["allowInternalReferences", false]
	])("forwards %s: %j alongside the other defaults", (key, value) => {
		// A quoted key, unlike `{ a: 1 }`, parses under every mode under test here — mode: "json"
		// rejects an unquoted key (@cldmv/jsonv >=1.1.1 enforces this), which would short-circuit
		// before parseToAst() is ever called and make the assertion below moot.
		run('{ "a": 1 }', { [key]: value });
		expect(parseWithOptions).toHaveBeenCalledExactlyOnceWith('{ "a": 1 }', { ...defaults, [key]: value, tolerant: false });
		expect(parseToAst).toHaveBeenCalledExactlyOnceWith('{ "a": 1 }', { ...defaults, [key]: value });
	});

	it("never forwards reviver, preserveComments or a tolerant parseToAst", () => {
		run('{ "a": 1 }', { mode: "json" });
		const [, pwoOptions] = parseWithOptions.mock.calls[0];
		const [, astOptions] = parseToAst.mock.calls[0];
		expect(pwoOptions).not.toHaveProperty("reviver");
		expect(pwoOptions).not.toHaveProperty("preserveComments");
		expect(astOptions).not.toHaveProperty("reviver");
		expect(astOptions).not.toHaveProperty("preserveComments");
		expect(astOptions).not.toHaveProperty("tolerant");
	});
});

describe("parse() — each mode gives jsonv's own verdict", () => {
	const documents = [
		["a line comment", '{\n  // note\n  "a": 1\n}'],
		["a block comment", '{ "a": 1 /* note */ }'],
		["an unquoted key", "{ a: 1 }"],
		["a trailing comma", '{ "a": 1, }'],
		["a single-quoted string", "{ 'a': 1 }"],
		["a hexadecimal number", '{ "a": 0xFF }'],
		["Infinity", '{ "a": Infinity }'],
		["an internal reference", '{ "port": 8080, "backup": port }'],
		["a dotted internal reference", '{ "s": { "p": 1 }, "b": s.p }'],
		["a template interpolation", '{ "host": "h", "url": `http://${host}` }'],
		["a binary literal", '{ "a": 0b101 }'],
		["a BigInt literal", '{ "a": 10n }'],
		["a numeric separator", '{ "a": 1_000 }'],
		["strict JSON", '{ "a": 1, "b": [true, null, "x"] }']
	];

	/**
	 * Runs jsonv's evaluating parser directly (the real implementation, outside the spy).
	 * @param {string} text - Source text.
	 * @param {object} options - Parse options.
	 * @returns {string|null} The error message, or `null` when jsonv accepts the text.
	 * @example
	 * jsonvVerdict("{ a: 1 }", { mode: "json" });
	 */
	function jsonvVerdict(text, options) {
		try {
			parseWithOptions.getMockImplementation()(text, { ...options, tolerant: false });
			return null;
		} catch (error) {
			return error.message;
		}
	}

	describe.each(["jsonv", "json5", "json"])('mode: "%s"', (mode) => {
		it.each(documents)("matches jsonv for %s", (_label, text) => {
			const expected = jsonvVerdict(text, { ...defaults, mode });
			const result = run(text, { mode });
			if (expected === null) {
				expect(result.ok).toBe(true);
			} else {
				expect(result.ok).toBe(false);
				expect(result.errors[0].message).toBe(expected);
			}
		});
	});

	it('mode: "json" rejects a comment that "jsonv" and "json5" accept', () => {
		expect(run('{ "a": 1 /* note */ }', { mode: "json" })).toMatchObject({
			ok: false,
			errors: [{ message: "Comments not allowed in JSON mode", line: 1, column: 10 }]
		});
		expect(run('{ "a": 1 /* note */ }', { mode: "json5" }).ok).toBe(true);
		expect(run('{ "a": 1 /* note */ }', { mode: "jsonv" }).ok).toBe(true);
	});
});

describe("parse() — allowInternalReferences", () => {
	it("resolves references by default and when true", () => {
		expect(run("{ port: 8080, backup: port }").jsonvValue).toEqual({ port: 8080, backup: 8080 });
		expect(run("{ port: 8080, backup: port }", { allowInternalReferences: true }).jsonvValue).toEqual({ port: 8080, backup: 8080 });
	});

	it("leaves a reference as jsonv's unresolved marker when false, and still builds the AST", () => {
		const result = run("{ port: 8080, backup: port }", { allowInternalReferences: false });
		expect(result.ok).toBe(true);
		expect(result.jsonvValue.port).toBe(8080);
		expect(result.jsonvValue.backup).toMatchObject({ __UNRESOLVED__: true, path: "port" });
		expect(result.ast.body.properties[1].value).toMatchObject({ type: "Identifier", name: "port" });
	});
});
