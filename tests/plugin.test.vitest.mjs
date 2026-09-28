/**
 * @fileoverview Shape of the exported plugin object: meta, the `jsonv` language
 * definition, the `recommended` config and the (currently empty) rules map.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import plugin from "../index.mjs";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("plugin export", () => {
	it("exposes meta with the plugin's own name and version, read from package.json", () => {
		expect(plugin.meta).toEqual({ name: packageJson.name, version: packageJson.version });
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

	it("documents its default language options, in the shape ESLint's Language API reads (defaultLanguageOptions)", () => {
		expect(language.defaultLanguageOptions).toEqual({
			year: 2025,
			mode: "jsonv",
			strictBigInt: false,
			strictOctal: false,
			allowInternalReferences: true
		});
		expect(language.defaultParserOptions).toBeUndefined();
	});

	it("accepts no options, and accepts valid values of every option, without throwing", () => {
		expect(language.validateLanguageOptions({})).toBeUndefined();
		expect(language.validateLanguageOptions(undefined)).toBeUndefined();
		expect(language.validateLanguageOptions({ year: 2011, strictBigInt: true })).toBeUndefined();
		expect(language.validateLanguageOptions({ year: 2025 })).toBeUndefined();
		expect(language.validateLanguageOptions({ strictBigInt: false })).toBeUndefined();
		for (const mode of ["jsonv", "json5", "json"]) expect(language.validateLanguageOptions({ mode })).toBeUndefined();
		for (const value of [true, false]) {
			expect(language.validateLanguageOptions({ strictOctal: value, allowInternalReferences: value })).toBeUndefined();
		}
		expect(language.validateLanguageOptions({ ...language.defaultLanguageOptions })).toBeUndefined();
	});

	it("names every supported option when it rejects an unknown key", () => {
		expect(() => language.validateLanguageOptions({ ecmaVersion: 2020 })).toThrow(
			'Unknown language option "ecmaVersion". Supported options are: year, mode, strictBigInt, strictOctal, allowInternalReferences.'
		);
	});

	it("does not treat an inherited Object.prototype name as a supported or an explained option", () => {
		expect(() => language.validateLanguageOptions({ constructor: true })).toThrow(/^Unknown language option "constructor"\./);
	});

	it.each([
		["reviver", "a reviver only transforms the evaluated value, which linting does not use"],
		["preserveComments", "the AST always carries the comments"],
		["tolerant", "the plugin controls how parse errors are collected"]
	])("rejects jsonv's %s option, and says why", (key, reason) => {
		expect(() => language.validateLanguageOptions({ [key]: true })).toThrow(
			`Language option "${key}" is not supported: ${reason}. Supported options are: year, mode, strictBigInt, strictOctal, allowInternalReferences.`
		);
	});

	it.each([["xml"], ["JSON"], [""], [null], [1]])("rejects the mode value %j", (mode) => {
		expect(() => language.validateLanguageOptions({ mode })).toThrow(
			`Invalid "mode" language option: ${JSON.stringify(mode)}. Supported modes are: jsonv, json5, json.`
		);
	});

	it.each([
		["strictOctal", "true", "string"],
		["strictOctal", 1, "number"],
		["allowInternalReferences", "false", "string"],
		["allowInternalReferences", null, "object"]
	])("rejects a non-boolean %s value (%j)", (key, value, type) => {
		expect(() => language.validateLanguageOptions({ [key]: value })).toThrow(
			`Invalid "${key}" language option: expected a boolean, got ${type}.`
		);
	});

	it("rejects an unknown language option key", () => {
		expect(() => language.validateLanguageOptions({ unknown: "value" })).toThrow(/Unknown language option "unknown"/);
	});

	it("rejects an unsupported year value", () => {
		expect(() => language.validateLanguageOptions({ year: 1999 })).toThrow(/Invalid "year" language option/);
	});

	it("rejects a non-boolean strictBigInt value", () => {
		expect(() => language.validateLanguageOptions({ strictBigInt: "true" })).toThrow(/Invalid "strictBigInt" language option/);
	});
});

describe("recommended config", () => {
	const { recommended } = plugin.configs;

	it("does not set languageOptions.parser — that field is inert for a custom Language API language", () => {
		expect(recommended.languageOptions).toBeUndefined();
	});

	it("enables no rules", () => {
		expect(recommended.rules).toEqual({});
	});

	it("contains only rules", () => {
		expect(Object.keys(recommended).sort()).toEqual(["rules"]);
	});
});

describe("meta resolution from a built dist/ copy", () => {
	const tmpRoot = path.join(root, "tmp");
	const created = [];

	afterEach(() => {
		while (created.length) rmSync(created.pop(), { recursive: true, force: true });
	});

	it("reads name/version from the package.json one level up, the layout scripts/build.mjs produces", async () => {
		// Mirrors the real publish layout: <pkg root>/package.json + <pkg root>/dist/index.mjs,
		// where index.mjs is copied verbatim (scripts/build.mjs does exactly this) — so the
		// co-located "./package.json" lookup misses and the "../package.json" fallback is used.
		mkdirSync(tmpRoot, { recursive: true });
		const pkgRoot = mkdtempSync(path.join(tmpRoot, "plugin-meta-test-"));
		created.push(pkgRoot);

		writeFileSync(path.join(pkgRoot, "package.json"), JSON.stringify({ name: "@cldmv/eslint-plugin-jsonv-sentinel", version: "9.9.9" }));
		mkdirSync(path.join(pkgRoot, "dist"), { recursive: true });
		writeFileSync(path.join(pkgRoot, "dist", "index.mjs"), readFileSync(path.join(root, "index.mjs"), "utf8"));

		expect(existsSync(path.join(pkgRoot, "dist", "package.json"))).toBe(false);

		const builtPlugin = (await import(pathToFileURL(path.join(pkgRoot, "dist", "index.mjs")).href)).default;
		expect(builtPlugin.meta).toEqual({ name: "@cldmv/eslint-plugin-jsonv-sentinel", version: "9.9.9" });
	});
});
