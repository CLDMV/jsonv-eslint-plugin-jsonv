/**
 * @fileoverview Guards the README's "Configuration Options" section against drifting from what
 * `validateLanguageOptions` actually accepts (see #34 — the README used to document a `mode`
 * option that validation rejected). Extracts the `languageOptions` object literal(s) out of the
 * README's own fenced code examples and proves every documented option is real: it validates,
 * and a config carrying it lints a file successfully end to end.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Linter } from "eslint";
import plugin from "../index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(path.join(root, "README.md"), "utf8");

/**
 * Pulls every fenced ```javascript / ```js code block's contents out of a markdown document.
 * @param {string} markdown - Markdown source.
 * @returns {string[]} The contents of each fenced javascript/js block, in document order.
 * @example
 * extractJsCodeBlocks("```js\nconst a = 1;\n```"); // ["const a = 1;\n"]
 */
function extractJsCodeBlocks(markdown) {
	const blocks = [];
	const fence = /```(?:javascript|js)\n([\s\S]*?)```/g;
	let match;
	while ((match = fence.exec(markdown)) !== null) {
		blocks.push(match[1]);
	}
	return blocks;
}

/**
 * Finds the object literal following `languageOptions:` in a code snippet (balanced-brace scan,
 * so it doesn't care how deep or how the object is formatted) and evaluates it to a real object.
 * @param {string} code - A JS code snippet containing a `languageOptions: { ... }` entry.
 * @returns {object|undefined} The parsed `languageOptions` object, or `undefined` if not present.
 * @example
 * extractLanguageOptions("languageOptions: { year: 2025 }"); // { year: 2025 }
 */
function extractLanguageOptions(code) {
	const marker = "languageOptions:";
	const markerIndex = code.indexOf(marker);
	if (markerIndex === -1) return undefined;

	const openBrace = code.indexOf("{", markerIndex);
	if (openBrace === -1) throw new Error("Found `languageOptions:` with no opening brace");

	let depth = 0;
	let closeBrace = -1;
	for (let i = openBrace; i < code.length; i++) {
		if (code[i] === "{") depth++;
		else if (code[i] === "}") {
			depth--;
			if (depth === 0) {
				closeBrace = i;
				break;
			}
		}
	}
	if (closeBrace === -1) throw new Error("Unbalanced braces after `languageOptions:`");

	const objectSource = code.slice(openBrace, closeBrace + 1);
	// The README examples are plain object literals (numbers, booleans, `//` comments) — safe to
	// evaluate directly so this test tracks the README's real text instead of re-parsing it by hand.
	// eslint-disable-next-line no-new-func
	return new Function(`"use strict"; return (${objectSource});`)();
}

const jsBlocks = extractJsCodeBlocks(readme);
const languageOptionsBlocks = jsBlocks.map(extractLanguageOptions).filter((options) => options !== undefined);

describe("README Configuration Options — extraction", () => {
	it("finds at least one documented languageOptions example", () => {
		expect(languageOptionsBlocks.length).toBeGreaterThan(0);
	});

	it("documents exactly `year` and `strictBigInt`", () => {
		for (const options of languageOptionsBlocks) {
			expect(Object.keys(options).sort()).toEqual(["strictBigInt", "year"]);
		}
	});
});

describe("README Configuration Options — validated against the real language", () => {
	const { validateLanguageOptions } = plugin.languages.jsonv;

	it.each(languageOptionsBlocks.map((options, i) => [i, options]))(
		"example #%i validates as a whole with validateLanguageOptions",
		(_i, options) => {
			expect(() => validateLanguageOptions(options)).not.toThrow();
		}
	);

	for (const options of languageOptionsBlocks) {
		it.each(Object.entries(options))("documented option `%s` is individually accepted", (key, value) => {
			expect(() => validateLanguageOptions({ [key]: value })).not.toThrow();
		});
	}
});

describe("README Configuration Options — used in a real Linter run", () => {
	const linter = new Linter({ configType: "flat" });
	const base = { files: ["**/*.jsonv"], plugins: { jsonv: plugin }, language: "jsonv/jsonv" };

	for (const options of languageOptionsBlocks) {
		it("lints a valid file cleanly with the documented languageOptions applied together", () => {
			const messages = linter.verify("{ a: 1 }", { ...base, languageOptions: options }, "file.jsonv");
			expect(messages).toEqual([]);
		});

		for (const [key, value] of Object.entries(options)) {
			it(`lints a valid file cleanly with only the documented \`${key}\` option applied`, () => {
				const messages = linter.verify("{ a: 1 }", { ...base, languageOptions: { [key]: value } }, "file.jsonv");
				expect(messages).toEqual([]);
			});
		}
	}
});
