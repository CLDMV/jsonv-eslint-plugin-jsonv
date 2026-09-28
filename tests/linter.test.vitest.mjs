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
 * Builds the single fatal message ESLint emits for a parse failure, at the error's real
 * 1-based `line`/`column` (jsonv positions every syntax and reference error).
 * @param {string} message - The parser's message (without the "Parsing error: " prefix).
 * @param {number} [line] - Expected 1-based line.
 * @param {number} [column] - Expected 1-based column.
 * @returns {object} Expected lint message.
 * @example
 * parsingError("Unexpected token: RBRACE at line 1, column 5", 1, 6);
 */
function parsingError(message, line, column) {
	return { ruleId: null, fatal: true, severity: 2, message: `Parsing error: ${message}`, line, column };
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
		["empty file", "", "Unexpected token: EOF at line 1, column 0", 1, 1],
		["missing value", "{ a: }", "Unexpected token: RBRACE at line 1, column 5", 1, 6],
		["unterminated array", "{\n  a: 1,\n  b: [1, 2\n}", "Expected ',' or ']' in array at line 4, column 0", 4, 1],
		["undefined reference", "{ a: missing }", "Unresolved reference: missing (circular reference or undefined)", 1, 6],
		["circular reference", "{ a: b, b: a }", "Unresolved reference: b (circular reference or undefined)", 1, 6],
		["undefined reference on a later line", "{\n  a: 1,\n  b: nope.c\n}", "Unresolved reference: nope.c (circular reference or undefined)", 3, 6]
	])("reports a fatal parsing error for %s", (_label, code, message, line, column) => {
		expect(lint(code)).toEqual([parsingError(message, line, column)]);
	});

	it("reports the same parsing error with configs.recommended spread in", () => {
		expect(lint("{ a: }", { ...base, ...plugin.configs.recommended })).toEqual([
			parsingError("Unexpected token: RBRACE at line 1, column 5", 1, 6)
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
		[2011, "{ a: 0b101 }", "Binary literals not allowed in this year", 1, 6],
		[2019, "{ a: 123n }", "BigInt literals not allowed in this year", 1, 9],
		[2020, "{ a: 1_000 }", "Numeric separators not allowed in this year", 1, 7]
	])("year %i rejects features introduced later", (year, code, message, line, column) => {
		expect(lint(code, { ...base, languageOptions: { year } })).toEqual([parsingError(message, line, column)]);
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

	it("rejects unknown language options with a config error", () => {
		expect(() => lint("{ a: 1 }", { ...base, languageOptions: { unknown: true } })).toThrow(
			/Key "languageOptions": Unknown language option "unknown"/
		);
	});

	it("rejects an unsupported year value with a config error", () => {
		expect(() => lint("{ a: 1 }", { ...base, languageOptions: { year: 1999 } })).toThrow(
			/Key "languageOptions": Invalid "year" language option/
		);
	});

	it("rejects a non-boolean strictBigInt value with a config error", () => {
		expect(() => lint("{ a: 1 }", { ...base, languageOptions: { strictBigInt: "yes" } })).toThrow(
			/Key "languageOptions": Invalid "strictBigInt" language option/
		);
	});

	it("uses defaultLanguageOptions (year 2025, strictBigInt false) when a config specifies neither", () => {
		expect(lint("{ a: 1_000n }", base)).toEqual([]);
		expect(lint("{ a: 99999999999999999999 }", base)).toEqual([]);
	});
});

describe("Linter — rules on the jsonv language", () => {
	const config = {
		...base,
		plugins: { ...base.plugins, fixture: fixturePlugin },
		rules: { "fixture/no-todo": "error" }
	};

	it("runs a rule and reports a Program-node problem across the whole document", () => {
		expect(lint('{ a: "TODO" }', config)).toEqual([
			{
				ruleId: "fixture/no-todo",
				severity: 2,
				message: "Unexpected TODO marker.",
				messageId: "todo",
				line: 1,
				column: 1,
				endLine: 1,
				endColumn: 14,
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


	it("runs a core JavaScript rule without reporting anything", () => {
		expect(lint("{ a: 1 }", { ...base, rules: { "no-debugger": "error" } })).toEqual([]);
	});
});

describe("Linter — node positions (issue #19)", () => {
	const report = {
		meta: { messages: { m: "{{type}}" } },
		create: (context) => ({
			Program(node) {
				context.report({ node, messageId: "m", data: { type: node.type } });
				context.report({ loc: { line: 3, column: 5 }, messageId: "m", data: { type: "explicit loc" } });
			}
		})
	};
	const config = { ...base, plugins: { ...base.plugins, l: { rules: { r: report } } }, rules: { "l/r": "error" } };

	it("places a Program-node report at the document span and an explicit loc as given", () => {
		expect(lint('{\n  a: 1,\n  b: "TODO"\n}', config).map(({ message, line, column, endLine, endColumn }) => [message, line, column, endLine, endColumn])).toEqual([
			["Program", 1, 1, 4, 2],
			["explicit loc", 3, 5, undefined, undefined]
		]);
	});
});

describe("Linter — selectors on the AST (issue #19)", () => {
	/**
	 * Lints with a rule that reports `getText()` of every node a selector matches.
	 * @param {string} selector - esquery selector.
	 * @param {string} code - Source text.
	 * @returns {Array<[string, number, number]>} `[text, line, column]` per report.
	 * @example
	 * select("Literal", "[1]");
	 */
	function select(selector, code) {
		const rule = {
			meta: { messages: { m: "{{text}}" } },
			create: (context) => ({ [selector]: (node) => context.report({ node, messageId: "m", data: { text: context.sourceCode.getText(node) } }) })
		};
		const config = { ...base, plugins: { ...base.plugins, s: { rules: { r: rule } } }, rules: { "s/r": "error" } };
		return lint(code, config).map(({ message, line, column }) => [message, line, column]);
	}

	const code = '{\n  name: "x",\n  list: [1, true, null],\n  nested: { deep: 2n },\n  ref: nested.deep,\n  t: `${name}!`\n}';

	it.each([
		["ObjectExpression", [["{ deep: 2n }", 4, 11]], "ObjectExpression ObjectExpression"],
		["ArrayExpression", [["[1, true, null]", 3, 9]], "ArrayExpression"],
		["Property keys", [["name", 2, 3], ["list", 3, 3], ["nested", 4, 3], ["deep", 4, 13], ["ref", 5, 3], ["t", 6, 3]], "Property > .key"],
		["array elements", [["1", 3, 10], ["true", 3, 13], ["null", 3, 19]], "ArrayExpression > Literal"],
		["a string literal by value", [['"x"', 2, 9]], 'Literal[value="x"]'],
		["a BigInt literal", [["2n", 4, 19]], "Literal[bigint]"],
		["a member reference", [["nested.deep", 5, 8]], "MemberExpression"],
		["a template interpolation", [["name", 6, 9]], "TemplateLiteral > Identifier"],
		["a property by key name", [['name: "x"', 2, 3]], "Property:has(> Identifier.key[name='name'])"]
	])("selects %s", (_label, expected, selector) => {
		expect(select(selector, code)).toEqual(expected);
	});

	it("fires :exit selectors for nested nodes", () => {
		// ESLint sorts messages by position, so the outer array comes first.
		expect(select("ArrayExpression:exit", "[[1]]")).toEqual([
			["[[1]]", 1, 1],
			["[1]", 1, 2]
		]);
	});
});

describe("Linter — inline configuration comments (issue #19)", () => {
	const config = {
		...base,
		plugins: { ...base.plugins, fixture: fixturePlugin },
		rules: { "fixture/no-todo-value": "error" }
	};
	const lines = (messages) => messages.map(({ ruleId, line, column }) => [ruleId, line, column]);

	it.each([
		["// eslint-disable", '// eslint-disable\n{ a: "TODO" }'],
		["/* eslint-disable */", '/* eslint-disable */\n{ a: "TODO" }'],
		["/* eslint-disable <rule> */", '/* eslint-disable fixture/no-todo-value */\n{ a: "TODO" }'],
		["// eslint-disable-next-line", '{\n  // eslint-disable-next-line\n  a: "TODO"\n}'],
		["// eslint-disable-next-line <rule>", '{\n  // eslint-disable-next-line fixture/no-todo-value\n  a: "TODO"\n}'],
		["// eslint-disable-line", '{ a: "TODO" } // eslint-disable-line'],
		["/* eslint-disable-line <rule> */", '{ a: "TODO" /* eslint-disable-line fixture/no-todo-value */ }']
	])("%s suppresses the report", (_label, code) => {
		expect(lint(code, config)).toEqual([]);
	});

	it("scopes directives to the right lines and rules", () => {
		const code = [
			"{",
			'  a: "TODO", // eslint-disable-line fixture/no-todo',
			"  // eslint-disable-next-line fixture/no-todo-value",
			'  b: "TODO",',
			"  /* eslint-disable */",
			'  c: "TODO",',
			"  /* eslint-enable */",
			'  d: "TODO"',
			"}"
		].join("\n");
		// Line 2's directive names a different rule, so the report stays and ESLint flags the
		// directive itself as unused (ESLint's default unused-directive reporting).
		const messages = lint(code, config);
		expect(lines(messages)).toEqual([
			["fixture/no-todo-value", 2, 6],
			[null, 2, 14],
			["fixture/no-todo-value", 8, 6]
		]);
		expect(messages[1].message).toBe("Unused eslint-disable directive (no problems were reported from 'fixture/no-todo').");
	});

	it("applies /* eslint <rule>: <severity> */ config comments", () => {
		expect(lint('/* eslint fixture/no-todo-value: "off" */\n{ a: "TODO" }', config)).toEqual([]);
		const [message] = lint('/* eslint fixture/no-todo-value: "warn" */\n{ a: "TODO" }', config);
		expect(message).toMatchObject({ ruleId: "fixture/no-todo-value", severity: 1, line: 2, column: 6 });
		const [enabled] = lint('/* eslint fixture/no-todo: "error" */\n{ a: "TODO" }', { ...base, plugins: { ...base.plugins, fixture: fixturePlugin } });
		expect(enabled).toMatchObject({ ruleId: "fixture/no-todo", severity: 2 });
	});

	it("reports a malformed config comment and a multi-line eslint-disable-line as problems", () => {
		const [malformed] = lint('/* eslint fixture/no-todo-value: [ */\n{ a: 1 }', config);
		expect(malformed).toMatchObject({ ruleId: null, fatal: true, line: 1, column: 1, endLine: 1, endColumn: 38 });
		expect(malformed.message).toMatch(/^Failed to parse JSON from/);

		expect(lint('{ a: "TODO" } /* eslint-disable-line\n */', config)).toEqual([
			expect.objectContaining({ ruleId: "fixture/no-todo-value", line: 1, column: 6 }),
			expect.objectContaining({
				ruleId: null,
				message: "eslint-disable-line comment should not span multiple lines.",
				line: 1,
				column: 15,
				endLine: 2,
				endColumn: 4
			})
		]);
	});

	it("reports unused disable directives at the comment's position", () => {
		const messages = linter.verify("{ a: 1 }\n// eslint-disable-next-line fixture/no-todo-value\n", config, {
			filename: "file.jsonv",
			reportUnusedDisableDirectives: "error"
		});
		expect(messages).toEqual([
			expect.objectContaining({
				ruleId: null,
				message: "Unused eslint-disable directive (no problems were reported from 'fixture/no-todo-value').",
				line: 2,
				column: 1
			})
		]);
	});

	it("ignores inline config when allowInlineConfig is false", () => {
		const messages = linter.verify('// eslint-disable\n{ a: "TODO" }', config, { filename: "file.jsonv", allowInlineConfig: false });
		expect(lines(messages)).toEqual([["fixture/no-todo-value", 2, 6]]);
	});

	it("warns about inline config when noInlineConfig is set", () => {
		const messages = linter.verify('// eslint-disable\n{ a: "TODO" }', { ...config, linterOptions: { noInlineConfig: true } }, "file.jsonv");
		expect(messages).toEqual([
			expect.objectContaining({ ruleId: null, severity: 1, message: expect.stringContaining("'// eslint-disable' has no effect"), line: 1, column: 1 }),
			expect.objectContaining({ ruleId: "fixture/no-todo-value", line: 2, column: 6 })
		]);
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

	it("expands the string reference jsonv/recommended into a files-scoped block ahead of the user block, with no languageOptions.parser", () => {
		expect(config).toHaveLength(2);
		expect(config[0]).toEqual({
			name: "UserConfig[0][0] > jsonv/recommended",
			files: ["**/*.jsonv"],
			rules: {}
		});
		expect(config[1]).toEqual({ files: ["**/*.jsonv"], plugins: { jsonv: plugin }, language: "jsonv/jsonv" });
	});

	it("lints with the extended config", () => {
		expect(lint("{ a: 1 }", config)).toEqual([]);
		expect(lint("{ a: }", config)).toEqual([parsingError("Unexpected token: RBRACE at line 1, column 5", 1, 6)]);
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
