/**
 * @fileoverview Shape of the exported plugin object: meta, the `jsonv` language
 * definition, the `recommended` config and the (currently empty) rules map.
 */
import { describe, expect, it } from "vitest";
import plugin from "../index.mjs";

describe("plugin export", () => {
	it("exposes meta with the plugin name and version", () => {
		expect(plugin.meta).toEqual({ name: "eslint-plugin-jsonv", version: "0.1.0" });
	});

	it("registers exactly one language, `jsonv`", () => {
		expect(Object.keys(plugin.languages)).toEqual(["jsonv"]);
	});

	it("exports exactly one config, `recommended`", () => {
		expect(Object.keys(plugin.configs)).toEqual(["recommended"]);
	});

	it("ships no rules yet", () => {
		expect(plugin.rules).toEqual({});
	});
});

describe("jsonv language definition", () => {
	const language = plugin.languages.jsonv;

	it("declares a text language with 1-based lines and columns", () => {
		expect(language.fileType).toBe("text");
		expect(language.lineStart).toBe(1);
		expect(language.columnStart).toBe(1);
		expect(language.nodeTypeKey).toBe("type");
	});

	it("implements the ESLint language API methods", () => {
		expect(typeof language.parse).toBe("function");
		expect(typeof language.createSourceCode).toBe("function");
		expect(typeof language.validateLanguageOptions).toBe("function");
	});

	it("documents its default parser options", () => {
		expect(language.defaultParserOptions).toEqual({ year: 2025, strictBigInt: false, mode: "jsonv" });
	});

	it("accepts any language options without throwing", () => {
		expect(language.validateLanguageOptions({})).toBeUndefined();
		expect(language.validateLanguageOptions({ year: 2011, strictBigInt: true })).toBeUndefined();
		expect(language.validateLanguageOptions({ unknown: "value" })).toBeUndefined();
		expect(language.validateLanguageOptions(undefined)).toBeUndefined();
	});
});

describe("recommended config", () => {
	const { recommended } = plugin.configs;

	it("points languageOptions.parser at the jsonv language object", () => {
		expect(recommended.languageOptions.parser).toBe(plugin.languages.jsonv);
	});

	it("enables no rules", () => {
		expect(recommended.rules).toEqual({});
	});

	it("contains only languageOptions and rules", () => {
		expect(Object.keys(recommended).sort()).toEqual(["languageOptions", "rules"]);
	});
});
