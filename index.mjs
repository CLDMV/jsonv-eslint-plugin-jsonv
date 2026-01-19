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
	 * Required by ESLint 9 language API
	 *
	 * @public
	 * @param {Object} languageOptions - The language options to validate
	 * @returns {void}
	 */
	validateLanguageOptions(___languageOptions) {
		// No validation needed - all options are optional
		// year, strictBigInt, mode, preserveComments, tolerant
	},

	/**
	 * Validate language options
	 * Required by ESLint 9 language API
	 *
	 * @public
	 * @param {Object} languageOptions - The language options to validate
	 * @returns {void}
	 */
	validateLanguageOptions(___languageOptions) {
		// No validation needed - all options are optional
		// year, strictBigInt, mode, preserveComments, tolerant
	},

	/**	 * Default parser options
	 *
	 * @public
	 * @type {Object}
	 */
	defaultParserOptions: {
		year: 2025,
		strictBigInt: false,
		mode: "jsonv"
	}
};

/**
 * Recommended configuration for jsonv files
 *
 * @public
 * @type {Object}
 */
const recommendedConfig = {
	languageOptions: {
		parser: jsonvLanguage
	},
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
	meta: {
		name: "eslint-plugin-jsonv",
		version: "0.1.0"
	},
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
