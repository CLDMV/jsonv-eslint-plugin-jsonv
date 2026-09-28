/**
 * @fileoverview ESLint plugin for @cldmv/jsonv files
 * @module eslint-plugin-jsonv
 * @public
 *
 * @description
 * Custom ESLint plugin for validating .jsonv files using the @cldmv/jsonv parser.
 * Provides language definition, parser, and recommended rules for jsonv files.
 *
 * Features:
 * - Validates jsonv syntax using the actual jsonv parser
 * - Reports parse errors with accurate source locations
 * - Supports all ES2011-2025 features (JSON5, binary/octal literals, BigInt, numeric separators, etc.)
 * - Detects internal reference errors (circular refs, undefined refs)
 * - Configurable year-based feature detection
 *
 * @example
 * // In eslint.config.mjs
 * import jsonv from 'eslint-plugin-jsonv';
 *
 * export default [
 *   {
 *     files: ["**\/*.jsonv"],
 *     plugins: { jsonv },
 *     language: "jsonv/jsonv",
 *     extends: ["jsonv/recommended"]
 *   }
 * ];
 */

// Use proper package import - package is copied to node_modules during build
import { parseWithOptions } from "@cldmv/jsonv/parser";

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Reads this package's own `name` and `version` from its `package.json`.
 *
 * `scripts/build.mjs` copies this file verbatim into `dist/index.mjs` — one directory
 * deeper than the source file — so `package.json` sits alongside the source copy but
 * one level up from the built copy. Check the co-located path first and fall back to
 * the parent directory so this resolves correctly from either location.
 *
 * @public
 * @returns {{name: string, version: string}} The package's `name` and `version`.
 * @example
 * const { name, version } = readPackageMeta();
 */
function readPackageMeta() {
	const here = dirname(fileURLToPath(import.meta.url));
	const localPath = join(here, "package.json");
	const pkgPath = existsSync(localPath) ? localPath : join(here, "..", "package.json");
	const require = createRequire(import.meta.url);
	const { name, version } = require(pkgPath);
	return { name, version };
}

/**
 * Language options `jsonvLanguage#parse` reads from `context.languageOptions` and
 * forwards to `@cldmv/jsonv`'s `parseWithOptions`. Any other key is rejected by
 * `validateLanguageOptions` since it would silently do nothing.
 *
 * @public
 * @type {Set<string>}
 */
const SUPPORTED_LANGUAGE_OPTIONS = new Set(["year", "strictBigInt"]);

/**
 * Valid `year` language option values, matching @cldmv/jsonv's `ParseOptions["year"]`
 * union (see `@cldmv/jsonv/parser`'s `ParseOptions` type).
 *
 * @public
 * @type {Set<number>}
 */
const VALID_YEARS = new Set([2011, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);

/**
 * Language definition for jsonv files
 *
 * @public
 * @type {Object}
 */
const jsonvLanguage = {
	/** File type - must be "text" for text-based languages */
	fileType: "text",
	/** Line numbering starts at 1 */
	lineStart: 1,
	/** Column numbering starts at 1 */
	columnStart: 1,
	/** Property name for node types */
	nodeTypeKey: "type",

	/**
	 * Parse jsonv source code - ESLint 9 Language API
	 * @param {Object} file - File object with body property containing source text
	 * @param {Object} context - Context with languageOptions
	 * @returns {Object} Parse result {ok, ast, jsonvValue} or {ok: false, errors}
	 */
	parse(file, context) {
		const text = file.body;
		const options = context.languageOptions || {};

		try {
			// Parse with all features enabled (ES2025) and strict mode off by default
			const result = parseWithOptions(text, {
				year: options.year || 2025,
				strictBigInt: options.strictBigInt !== undefined ? options.strictBigInt : false,
				mode: "jsonv",
				preserveComments: true,
				tolerant: false
			});

			// Return parse result with minimal ESTree-compatible AST
			return {
				ok: true,
				ast: {
					type: "Program",
					body: [],
					sourceType: "module",
					comments: [],
					tokens: []
				},
				// Store the parsed jsonv value for potential use by rules
				jsonvValue: result
			};
		} catch (error) {
			// Return error result
			return {
				ok: false,
				errors: [
					{
						message: error.message,
						line: error.line || 1,
						column: error.column || 1
					}
				]
			};
		}
	},

	/**
	 * Create source code object
	 * Required by ESLint 9 language API
	 *
	 * @public
	 * @param {Object} file - The file object
	 * @param {Object} parseResult - The result from parse()
	 * @param {Object} context - Context object
	 * @returns {Object} SourceCode object
	 */
	createSourceCode(file, parseResult, context) {
		const text = typeof file.body === "string" ? file.body : String(file.body || "");
		const ast = parseResult.ast;

		return {
			text,
			ast,
			lines: text.split(/\r\n|[\r\n\u2028\u2029]/g),
			hasBOM: text.charCodeAt(0) === 0xfeff,

			// Required methods
			getLoc(node) {
				return node.loc || { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } };
			},

			getRange(node) {
				return node.range || [0, 0];
			},

			traverse() {
				// ESLint expects: { kind: 1 (VISIT), target: node, phase: 1|2, args: [] }
				// kind: 1 = STEP_KIND_VISIT
				// phase: 1 = enter, 2 = exit
				return [
					{
						kind: 1,
						target: ast,
						phase: 1,
						args: [ast]
					},
					{
						kind: 1,
						target: ast,
						phase: 2,
						args: [ast]
					}
				].values();
			},

			// Optional helper methods
			getText(node, beforeCount, afterCount) {
				if (node && node.range) {
					const [start, end] = node.range;
					return text.slice(Math.max(0, start - (beforeCount || 0)), Math.min(text.length, end + (afterCount || 0)));
				}
				return text;
			},

			getLines() {
				return text.split(/\r\n|[\r\n\u2028\u2029]/g);
			}
		};
	},

	/**
	 * Validate language options
	 * Required by ESLint 9 language API. ESLint calls this with the languageOptions
	 * already merged with `defaultLanguageOptions` below, so `languageOptions` here
	 * reflects the effective options that will reach `parse()`.
	 *
	 * @public
	 * @param {Object} languageOptions - The (already-merged) language options to validate
	 * @returns {void}
	 * @throws {TypeError} When an unsupported key is present, or a supported key holds an invalid value
	 */
	validateLanguageOptions(languageOptions) {
		const options = languageOptions ?? {};

		for (const key of Object.keys(options)) {
			if (!SUPPORTED_LANGUAGE_OPTIONS.has(key)) {
				throw new TypeError(`Unknown language option "${key}". Supported options are: ${[...SUPPORTED_LANGUAGE_OPTIONS].join(", ")}.`);
			}
		}

		if (options.year !== undefined && !VALID_YEARS.has(options.year)) {
			throw new TypeError(
				`Invalid "year" language option: ${JSON.stringify(options.year)}. Supported years are: ${[...VALID_YEARS].join(", ")}.`
			);
		}

		if (options.strictBigInt !== undefined && typeof options.strictBigInt !== "boolean") {
			throw new TypeError(`Invalid "strictBigInt" language option: expected a boolean, got ${typeof options.strictBigInt}.`);
		}
	},

	/**
	 * Default language options
	 * Required by ESLint 9 language API to supply defaults when a config specifies
	 * none — ESLint deep-merges this with the config's `languageOptions` before
	 * calling `validateLanguageOptions` and `parse()`.
	 *
	 * @public
	 * @type {Object}
	 */
	defaultLanguageOptions: {
		year: 2025,
		strictBigInt: false
	}
};

/**
 * Recommended configuration for jsonv files
 *
 * `languageOptions.parser` is intentionally omitted: that field is only read by
 * ESLint's built-in "js" language (for its legacy custom-parser support) — a custom
 * `language` such as `jsonv/jsonv` never consults it, so setting it here was inert.
 *
 * @public
 * @type {Object}
 */
const recommendedConfig = {
	rules: {
		// Add custom jsonv rules here in the future
		// For now, parsing validation is enough
	}
};

/**
 * ESLint plugin export
 *
 * @public
 * @type {Object}
 */
const plugin = {
	meta: readPackageMeta(),
	languages: {
		jsonv: jsonvLanguage
	},
	configs: {
		recommended: recommendedConfig
	},
	rules: {
		// Future: Add custom rules for jsonv-specific validations
		// Examples:
		// - "no-circular-references": enforce no circular internal refs
		// - "require-bigint-suffix": enforce 'n' suffix for large integers
		// - "prefer-template-interpolation": prefer ${} over string concat
		// - "no-duplicate-keys": enforce unique object keys
	}
};

export default plugin;
