/**
 *
 *	@Project: @cldmv/eslint-plugin-jsonv
 *	@Filename: /src/visitor-keys.mjs
 *	@Date: 2026-01-18T20:55:56-08:00 (1768798556)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-01T12:07:54-08:00 (1793563674)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Child keys of the jsonv AST and the helpers that walk it. Shared by the language
 * (`index.mjs`, which positions the parsed AST) and `JsonvSourceCode` (`source-code.mjs`, which
 * traverses it). Internal: not listed in package.json `exports`.
 * @module eslint-plugin-jsonv/visitor-keys
 * @internal
 */

/**
 * Child keys of every node type in the AST `jsonvLanguage#parse` produces, in source order
 * where that is defined. The node types and their shapes come from @cldmv/jsonv's own AST
 * (`@cldmv/jsonv/parser`'s `Program`/`Expression` types); the plugin only re-positions them.
 *
 * - `Program` — the document; `body` is the single root value.
 * - `ObjectExpression` — `{ ... }`, with `properties` (`Property` nodes).
 * - `Property` — `key: value`; `key` is a `Literal` (quoted or numeric key) or an `Identifier` (unquoted key).
 * - `ArrayExpression` — `[ ... ]`, with `elements`.
 * - `Literal` — string, number, BigInt, boolean, null, `Infinity`, `NaN` (`raw` holds the source text).
 * - `Identifier` — an unquoted key, or an internal reference such as `backup: port`.
 * - `MemberExpression` — a dotted internal reference such as `server.port`.
 * - `TemplateLiteral` / `TemplateElement` — backtick strings and their `${...}` interpolations.
 *
 * @public
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const VISITOR_KEYS = Object.freeze({
	Program: Object.freeze(["body"]),
	ObjectExpression: Object.freeze(["properties"]),
	Property: Object.freeze(["key", "value"]),
	ArrayExpression: Object.freeze(["elements"]),
	Literal: Object.freeze([]),
	Identifier: Object.freeze([]),
	MemberExpression: Object.freeze(["object", "property"]),
	TemplateLiteral: Object.freeze(["quasis", "expressions"]),
	TemplateElement: Object.freeze([])
});

/**
 * Tests whether a value is a positioned @cldmv/jsonv AST node.
 * @public
 * @param {unknown} value - Any property value of a node.
 * @returns {value is {type: string, [key: string]: unknown}} `true` for an object with a string `type` and a `loc`.
 * @example
 * isJsonvNode({ type: "Literal", loc: { start: {}, end: {} } }); // true
 */
export function isJsonvNode(value) {
	return (
		value !== null &&
		typeof value === "object" &&
		"type" in value &&
		typeof value.type === "string" &&
		"loc" in value &&
		typeof value.loc === "object"
	);
}

/**
 * Returns the child keys to visit for a node: its entry in {@link VISITOR_KEYS}, or — for a
 * node type @cldmv/jsonv may add later — every key holding a node or an array of nodes.
 * @public
 * @param {{type: string, [key: string]: unknown}} node - An AST node.
 * @returns {ReadonlyArray<string>} Child property names.
 * @example
 * getChildKeys({ type: "Property", key, value }); // ["key", "value"]
 */
export function getChildKeys(node) {
	return (
		VISITOR_KEYS[node.type] ??
		Object.keys(node).filter((key) => {
			const value = node[key];
			return Array.isArray(value) ? value.some(isJsonvNode) : isJsonvNode(value);
		})
	);
}
