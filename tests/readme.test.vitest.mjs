/**
 * @fileoverview Keeps the README's language options in step with the code. The `languageOptions`
 * object literals are extracted from the README's JavaScript code blocks and evaluated; their keys
 * must be exactly the options the language supports, `validateLanguageOptions` must accept them,
 * and a `Linter` run with them must work. The **Configuration Options** table must list the same
 * options. A documented option the plugin does not support, or a supported one the README leaves
 * out, fails here.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";
import plugin from "../index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(path.join(root, "README.md"), "utf8");
const language = plugin.languages.jsonv;
const supported = Object.keys(language.defaultLanguageOptions).sort();

/**
 * Returns the contents of every fenced code block tagged `javascript` or `js`.
 * @param {string} markdown - Markdown text.
 * @returns {string[]} The code block bodies.
 * @example
 * javascriptBlocks("```js\nx\n```"); // ["x\n"]
 */
function javascriptBlocks(markdown) {
	return [...markdown.matchAll(/^```(?:javascript|js)\n([\s\S]*?)^```$/gmu)].map((match) => match[1]);
}

/**
 * Returns the source of the object literal that starts at `start` (an opening brace), skipping
 * braces inside strings, template literals and comments.
 * @param {string} code - JavaScript source.
 * @param {number} start - Index of the opening `{`.
 * @returns {string} The object literal source, braces included.
 * @example
 * objectLiteralAt("x = { a: 1 };", 4); // "{ a: 1 }"
 */
function objectLiteralAt(code, start) {
	let depth = 0;
	for (let i = start; i < code.length; i++) {
		const ch = code[i];
		if (ch === '"' || ch === "'" || ch === "`") {
			for (i++; code[i] !== ch; i++) if (code[i] === "\\") i++;
		} else if (code.startsWith("//", i)) {
			i = code.indexOf("\n", i);
		} else if (code.startsWith("/*", i)) {
			i = code.indexOf("*/", i) + 1;
		} else if (ch === "{") {
			depth++;
		} else if (ch === "}" && --depth === 0) {
			return code.slice(start, i + 1);
		}
	}
	throw new Error(`Unterminated object literal at index ${start}`);
}

/**
 * Extracts and evaluates every `languageOptions: { ... }` object literal in the README's
 * JavaScript code blocks.
 * @param {string} markdown - Markdown text.
 * @returns {object[]} The documented language options objects.
 * @example
 * documentedLanguageOptions(readme);
 */
function documentedLanguageOptions(markdown) {
	const found = [];
	for (const block of javascriptBlocks(markdown)) {
		for (const match of block.matchAll(/\blanguageOptions\s*:\s*\{/gu)) {
			const literal = objectLiteralAt(block, match.index + match[0].length - 1);
			found.push(new Function(`return (${literal});`)());
		}
	}
	return found;
}

/**
 * Returns the option names in the first column of the **Configuration Options** table.
 * @param {string} markdown - Markdown text.
 * @returns {string[]} The option names, in table order.
 * @example
 * tableOptions(readme); // ["year", "mode", ...]
 */
function tableOptions(markdown) {
	const section = markdown.slice(markdown.indexOf("### Configuration Options"));
	const body = section.slice(0, section.indexOf("\n### ", 1));
	// Prettier pads every cell to its column width, so allow any run of spaces after the name.
	return [...body.matchAll(/^\| `([^`]+)` *\|/gmu)].map((match) => match[1]);
}

describe("README — Configuration Options", () => {
	const documented = documentedLanguageOptions(readme);

	it("documents languageOptions in at least one JavaScript code block", () => {
		expect(documented.length).toBeGreaterThan(0);
	});

	it("documents exactly the supported options in its code blocks", () => {
		const keys = [...new Set(documented.flatMap((options) => Object.keys(options)))].sort();
		expect(keys).toEqual(supported);
	});

	it("documents the real default of every option", () => {
		for (const options of documented) {
			for (const [key, value] of Object.entries(options)) {
				expect({ [key]: value }).toEqual({ [key]: language.defaultLanguageOptions[key] });
			}
		}
	});

	it("lists exactly the supported options in its table", () => {
		expect([...tableOptions(readme)].sort()).toEqual(supported);
	});

	it("documents options that validateLanguageOptions accepts", () => {
		for (const options of documented) expect(language.validateLanguageOptions(options)).toBeUndefined();
	});

	it("documents options a Linter run accepts", () => {
		const linter = new Linter({ configType: "flat" });
		for (const languageOptions of documented) {
			const config = { files: ["**/*.jsonv"], plugins: { jsonv: plugin }, language: "jsonv/jsonv", languageOptions };
			expect(linter.verify("// config\n{ port: 8080, backup: port, big: 1_000n }", config, "file.jsonv")).toEqual([]);
			expect(linter.verify("{ a: }", config, "file.jsonv")).toMatchObject([{ fatal: true, line: 1, column: 6 }]);
		}
	});
});

describe("README extraction helpers", () => {
	it("skips braces inside strings, template literals and comments", () => {
		const code = 'x = { a: "}", b: \'{\', c: `}`, // }\n d: 1 /* } */, e: "\\"}" };';
		expect(new Function(`return (${objectLiteralAt(code, 4)});`)()).toEqual({ a: "}", b: "{", c: "}", d: 1, e: '"}' });
	});

	it("throws on an unterminated object literal", () => {
		expect(() => objectLiteralAt("{ a: 1", 0)).toThrow("Unterminated object literal at index 0");
	});
});
