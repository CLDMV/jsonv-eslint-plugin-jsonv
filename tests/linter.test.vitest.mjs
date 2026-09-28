/**
 * @fileoverview End-to-end behaviour of the plugin inside ESLint: the `Linter`
 * class with flat configs, the `ESLint` class, `configs.recommended` (spread and
 * via `extends`), language options, parse-error reporting and autofix.
 */
import { describe, expect, it } from "vitest";
import { ESLint, Linter } from "eslint";
import { defineConfig } from "eslint/config";
import plugin from "../index.mjs";
import { fixturePlugin } from "./fixtures/rules.mjs";

const linter = new Linter({ configType: "flat" });
const base = { files: ["**/*.jsonv"], plugins: { jsonv: plugin }, language: "jsonv/jsonv" };

/**
 * Lints a `.jsonv` source string with the given config.
 * @param {string} code - Source text.
 * @param {object|object[]} [config] - Flat config (defaults to the bare language config).
 * @returns {import("eslint").Linter.LintMessage[]} Lint messages.
 * @example
 * lint("{ a: 1 }");
 */
function lint(code, config = base) {
	return linter.verify(code, config, "file.jsonv");
}

/**
 * Builds the single fatal message ESLint emits for a parse failure.
 * @param {string} message - The parser's message (without the "Parsing error: " prefix).
 * @returns {object} Expected lint message.
 * @example
 * parsingError("Unexpected token: EOF at line 1, column 0");
 */
function parsingError(message) {
	return { ruleId: null, fatal: true, severity: 2, message: `Parsing error: ${message}`, line: 1, column: 1 };
}

describe("Linter — valid jsonv", () => {
	it.each([
		["plain object", '{ a: 1, b: "x" }'],
		["BigInt", "{ a: 123n }"],
		["numeric separators", "{ a: 1_000 }"],
		["comments", "// hi\n{ a: 1 /* x */ }"],
		["internal references", "{ port: 8080, backup: port }"],
		["template interpolation", '{ host: "h", url: `http://${host}` }'],
		["BOM", "﻿{ a: 1 }"],
		["CRLF line endings", "{\r\n  a: 1\r\n}"]
	])("reports nothing for %s", (_label, code) => {
		expect(lint(code)).toEqual([]);
	});

	it("reports nothing when configs.recommended is spread into the config", () => {
		expect(lint("{ a: 1 }", { ...base, ...plugin.configs.recommended })).toEqual([]);
	});
});

describe("Linter — malformed jsonv", () => {
	it.each([
		["empty file", "", "Unexpected token: EOF at line 1, column 0"],
		["missing value", "{ a: }", "Unexpected token: RBRACE at line 1, column 5"],
		["unterminated array", "{\n  a: 1,\n  b: [1, 2\n}", "Expected ',' or ']' in array at line 4, column 0"],
		["undefined reference", "{ a: missing }", "Unresolved reference: missing (circular reference or undefined)"],
		["circular reference", "{ a: b, b: a }", "Unresolved reference: b (circular reference or undefined)"]
	])("reports a fatal parsing error for %s", (_label, code, message) => {
		expect(lint(code)).toEqual([parsingError(message)]);
	});

	it("reports the same parsing error with configs.recommended spread in", () => {
		expect(lint("{ a: }", { ...base, ...plugin.configs.recommended })).toEqual([
			parsingError("Unexpected token: RBRACE at line 1, column 5")
		]);
	});

	it("does not run rules on a file that failed to parse", () => {
		const config = { ...base, plugins: { ...base.plugins, fixture: fixturePlugin }, rules: { "fixture/no-todo": "error" } };
		expect(lint('{ a: "TODO", }}', config)).toHaveLength(1);
		expect(lint('{ a: "TODO", }}', config)[0].fatal).toBe(true);
	});
});

describe("Linter — languageOptions", () => {
	it.each([
		[2011, "{ a: 0b101 }", "Binary literals not allowed in this year"],
		[2019, "{ a: 123n }", "BigInt literals not allowed in this year"],
		[2020, "{ a: 1_000 }", "Numeric separators not allowed in this year"]
	])("year %i rejects features introduced later", (year, code, message) => {
		expect(lint(code, { ...base, languageOptions: { year } })).toEqual([parsingError(message)]);
	});

	it.each([
		[2015, "{ a: 0b101 }"],
		[2020, "{ a: 123n }"],
		[2021, "{ a: 1_000 }"]
	])("year %i accepts the feature it introduced", (year, code) => {
		expect(lint(code, { ...base, languageOptions: { year } })).toEqual([]);
	});

	it("strictBigInt: true rejects an unsafe integer without the n suffix", () => {
		const [message] = lint("{ a: 99999999999999999999 }", { ...base, languageOptions: { strictBigInt: true } });
		expect(message.fatal).toBe(true);
		expect(message.message).toBe(
			"Parsing error: Integer 100000000000000000000 is outside safe integer range. Use BigInt suffix 'n' for integers larger than 9007199254740991 or smaller than -9007199254740991 at line 1, column 5"
		);
	});

	it("strictBigInt: false accepts an unsafe integer", () => {
		expect(lint("{ a: 99999999999999999999 }", { ...base, languageOptions: { strictBigInt: false } })).toEqual([]);
	});

	it("accepts unknown language options without a config error", () => {
		expect(lint("{ a: 1 }", { ...base, languageOptions: { unknown: true } })).toEqual([]);
	});
});

describe("Linter — rules on the jsonv language", () => {
	const config = {
		...base,
		plugins: { ...base.plugins, fixture: fixturePlugin },
		rules: { "fixture/no-todo": "error" }
	};

	it("runs a rule and reports at the Program node's fallback location (line 1, column 0)", () => {
		expect(lint('{ a: "TODO" }', config)).toEqual([
			{
				ruleId: "fixture/no-todo",
				severity: 2,
				message: "Unexpected TODO marker.",
				messageId: "todo",
				line: 1,
				column: 0,
				endLine: 1,
				endColumn: 0,
				fix: { range: [6, 10], text: "DONE" }
			}
		]);
	});

	it("applies autofixes with verifyAndFix", () => {
		expect(linter.verifyAndFix('{ a: "TODO", b: "TODO" }', config, "file.jsonv")).toEqual({
			fixed: true,
			messages: [],
			output: '{ a: "DONE", b: "DONE" }'
		});
	});

	it("does not honour eslint-disable comments (the language exposes no inline config)", () => {
		expect(lint('// eslint-disable\n{ a: "TODO" }', config)).toHaveLength(1);
		expect(lint('/* eslint-disable fixture/no-todo */\n{ a: "TODO" }', config)).toHaveLength(1);
	});

	it("runs a core JavaScript rule without reporting anything", () => {
		expect(lint("{ a: 1 }", { ...base, rules: { "no-debugger": "error" } })).toEqual([]);
	});
});

describe("Linter — file matching", () => {
	it("does not apply the jsonv config to non-.jsonv files", () => {
		expect(linter.verify("{ a: 1 }", base, "file.json")).toEqual([
			{ ruleId: null, severity: 1, message: "No matching configuration found for file.json.", line: 0, column: 0 }
		]);
	});
});

describe("defineConfig extends", () => {
	const config = defineConfig([
		{ files: ["**/*.jsonv"], plugins: { jsonv: plugin }, language: "jsonv/jsonv", extends: ["jsonv/recommended"] }
	]);

	it("expands the string reference jsonv/recommended into a files-scoped block ahead of the user block", () => {
		expect(config).toHaveLength(2);
		expect(config[0]).toEqual({
			name: "UserConfig[0][0] > jsonv/recommended",
			files: ["**/*.jsonv"],
			languageOptions: { parser: plugin.languages.jsonv },
			rules: {}
		});
		expect(config[1]).toEqual({ files: ["**/*.jsonv"], plugins: { jsonv: plugin }, language: "jsonv/jsonv" });
	});

	it("lints with the extended config", () => {
		expect(lint("{ a: 1 }", config)).toEqual([]);
		expect(lint("{ a: }", config)).toEqual([parsingError("Unexpected token: RBRACE at line 1, column 5")]);
	});
});

describe("ESLint class", () => {
	/**
	 * Creates an ESLint instance that ignores any on-disk config.
	 * @param {object} [extra] - Extra config merged into the jsonv block.
	 * @returns {ESLint} Configured instance.
	 * @example
	 * const eslint = createESLint({ rules: {} });
	 */
	function createESLint(extra = {}) {
		return new ESLint({
			overrideConfigFile: true,
			overrideConfig: [{ ...base, ...plugin.configs.recommended, ...extra }],
			fix: true
		});
	}

	it("lints valid text with no messages", async () => {
		const [result] = await createESLint().lintText("{ a: 1 }", { filePath: "data.jsonv" });
		expect(result.messages).toEqual([]);
		expect(result.errorCount).toBe(0);
		expect(result.fatalErrorCount).toBe(0);
	});

	it("counts a parse failure as a fatal error", async () => {
		const [result] = await createESLint().lintText("{ a: }", { filePath: "data.jsonv" });
		expect(result.errorCount).toBe(1);
		expect(result.fatalErrorCount).toBe(1);
		expect(result.messages[0].message).toBe("Parsing error: Unexpected token: RBRACE at line 1, column 5");
	});

	it("returns fixed output for a fixable rule", async () => {
		const eslint = createESLint({
			plugins: { jsonv: plugin, fixture: fixturePlugin },
			rules: { "fixture/no-todo": "error" }
		});
		const [result] = await eslint.lintText('{ note: "TODO" }', { filePath: "data.jsonv" });
		expect(result.output).toBe('{ note: "DONE" }');
		expect(result.messages).toEqual([]);
	});
});
