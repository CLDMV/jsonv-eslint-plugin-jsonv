/**
 *
 *	@Project: @cldmv/eslint-plugin-jsonv
 *	@Filename: /tests/language-ast.test.vitest.mjs
 *	@Date: 2026-09-28T04:37:17+00:00 (1790570237)
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
 * @fileoverview The AST `languages.jsonv.parse()` builds from @cldmv/jsonv's `parseToAst()`:
 * node types and shapes, 1-based `loc` + `range` on every node, comments and tokens, and
 * `visitorKeys` (issue #19 — the language used to return an empty Program).
 */
import { describe, expect, it } from "vitest";
import plugin from "../index.mjs";

const language = plugin.languages.jsonv;

/**
 * Parses a body the way ESLint does and returns the AST.
 * @param {string} body - File contents.
 * @returns {object} The Program node.
 * @example
 * astFor("{ a: 1 }").body.type; // "ObjectExpression"
 */
function astFor(body) {
	const result = language.parse({ body }, {});
	expect(result.ok).toBe(true);
	return result.ast;
}

/**
 * Builds an ESLint `loc`/`range` pair from 1-based line/column pairs and offsets.
 * @param {number} startLine - Start line.
 * @param {number} startColumn - Start column (1-based).
 * @param {number} endLine - End line.
 * @param {number} endColumn - End column (1-based).
 * @param {number} start - Start offset.
 * @param {number} end - End offset.
 * @returns {{loc: object, range: number[]}} Position fields.
 * @example
 * at(1, 1, 1, 4, 0, 3);
 */
function at(startLine, startColumn, endLine, endColumn, start, end) {
	return { loc: { start: { line: startLine, column: startColumn }, end: { line: endLine, column: endColumn } }, range: [start, end] };
}

/**
 * Yields every node of an AST by following `language.visitorKeys`.
 * @param {object} node - Root node.
 * @returns {Generator<object>} Nodes, depth first.
 * @example
 * [...walk(ast)].map((n) => n.type);
 */
function* walk(node) {
	yield node;
	for (const key of language.visitorKeys[node.type]) {
		const child = node[key];
		for (const item of Array.isArray(child) ? child : [child]) yield* walk(item);
	}
}

describe("parse() — AST shape", () => {
	it("builds a positioned Program > ObjectExpression > Property tree for the issue's reproduction", () => {
		const ast = astFor('{\n  a: 1,\n  b: "TODO"\n}');
		expect(ast).toEqual({
			type: "Program",
			...at(1, 1, 4, 2, 0, 23),
			body: {
				type: "ObjectExpression",
				...at(1, 1, 4, 2, 0, 23),
				properties: [
					{
						type: "Property",
						computed: false,
						...at(2, 3, 2, 7, 4, 8),
						key: { type: "Identifier", name: "a", ...at(2, 3, 2, 4, 4, 5) },
						value: { type: "Literal", value: 1, raw: "1", ...at(2, 6, 2, 7, 7, 8) }
					},
					{
						type: "Property",
						computed: false,
						...at(3, 3, 3, 12, 12, 21),
						key: { type: "Identifier", name: "b", ...at(3, 3, 3, 4, 12, 13) },
						value: { type: "Literal", value: "TODO", raw: '"TODO"', ...at(3, 6, 3, 12, 15, 21) }
					}
				]
			},
			comments: [],
			tokens: expect.any(Array)
		});
	});

	it("uses a Literal key for quoted and numeric keys and an Identifier key for unquoted ones", () => {
		const [quoted, single, numeric, bare, keyword] = astFor("{ \"q\": 1, 's': 2, 3: 3, b: 4, true: 5 }").body.properties.map((p) => p.key);
		expect(quoted).toMatchObject({ type: "Literal", value: "q", raw: '"q"' });
		expect(single).toMatchObject({ type: "Literal", value: "s", raw: "'s'" });
		expect(numeric).toMatchObject({ type: "Literal", value: 3, raw: "3" });
		expect(bare).toMatchObject({ type: "Identifier", name: "b" });
		expect(keyword).toMatchObject({ type: "Identifier", name: "true" });
	});

	it("builds ArrayExpression and Literal nodes for every literal kind", () => {
		const elements = astFor("[1, -2, +3, .5, 0xFF, 0b1, 0o7, 1_000, 7n, true, false, null, Infinity, -Infinity, NaN, 's', \"d\", `t`]").body
			.elements;
		expect(elements.every((node) => node.type === "Literal")).toBe(true);
		expect(elements.map((node) => node.raw)).toEqual([
			"1",
			"-2",
			"+3",
			".5",
			"0xFF",
			"0b1",
			"0o7",
			"1_000",
			"7n",
			"true",
			"false",
			"null",
			"Infinity",
			"-Infinity",
			"NaN",
			"'s'",
			'"d"',
			"`t`"
		]);
		expect(elements.map((node) => node.value)).toEqual([
			1,
			-2,
			3,
			0.5,
			255,
			1,
			7,
			1000,
			7n,
			true,
			false,
			null,
			Infinity,
			-Infinity,
			NaN,
			"s",
			"d",
			"t"
		]);
		expect(elements[8].bigint).toBe("7");
	});

	it("keeps internal references as Identifier and MemberExpression nodes", () => {
		const [, backup, nested] = astFor("{ server: { port: 1 }, backup: server, nested: server.port }").body.properties;
		expect(backup.value).toEqual({ type: "Identifier", name: "server", ...at(1, 32, 1, 38, 31, 37) });
		expect(nested.value).toEqual({
			type: "MemberExpression",
			computed: false,
			...at(1, 48, 1, 59, 47, 58),
			object: { type: "Identifier", name: "server", ...at(1, 48, 1, 54, 47, 53) },
			property: { type: "Identifier", name: "port", ...at(1, 55, 1, 59, 54, 58) }
		});
	});

	it("builds TemplateLiteral nodes with quasis and interpolated expressions", () => {
		const [, url] = astFor("{ host: 1, url: `http://${host}/` }").body.properties;
		expect(url.value).toEqual({
			type: "TemplateLiteral",
			...at(1, 17, 1, 34, 16, 33),
			quasis: [
				{ type: "TemplateElement", tail: false, value: { raw: "`http://${", cooked: "http://" }, ...at(1, 17, 1, 27, 16, 26) },
				{ type: "TemplateElement", tail: true, value: { raw: "/`", cooked: "/" }, ...at(1, 32, 1, 34, 31, 33) }
			],
			expressions: [{ type: "Identifier", name: "host", ...at(1, 27, 1, 31, 26, 30) }]
		});
	});

	it("spans a multi-line (backslash-continued) string across its lines", () => {
		const [prop] = astFor('{\n  d: "l1\\\n l2"\n}').body.properties;
		expect(prop.value).toMatchObject({ type: "Literal", value: "l1 l2", ...at(2, 6, 3, 5, 7, 16) });
	});

	it("counts CRLF, lone CR, U+2028 and U+2029 as line breaks, like jsonv", () => {
		const elements = astFor("[1,\r\n2,\r3 ,4 ]").body.elements;
		expect(elements.map((node) => node.loc.start)).toEqual([
			{ line: 1, column: 2 },
			{ line: 2, column: 1 },
			{ line: 3, column: 1 },
			{ line: 4, column: 2 }
		]);
	});

	it("gives every node a range that slices back to its source text", () => {
		const text = "// head\n{\n  a: [1, 'x', `y${d}`],\n  b: { c: d },\n  \"d\": 2n, /* tail */\n  e: b.c\n}\n";
		const ast = astFor(text);
		const nodes = [...walk(ast)];
		expect(nodes).toHaveLength(25);
		for (const node of nodes) {
			expect(node.range[0]).toBeLessThanOrEqual(node.range[1]);
			if (node.raw !== undefined) expect(text.slice(...node.range)).toBe(node.raw);
			if (node.type === "Identifier") expect(text.slice(...node.range)).toBe(node.name);
		}
		expect(ast.range).toEqual([0, text.length]);
	});
});

describe("parse() — comments and tokens", () => {
	it("collects line and block comments with delimiter-free values and positions", () => {
		const ast = astFor("// head\n{ a: 1 /* inline */ }\n/* multi\nline */");
		expect(ast.comments).toEqual([
			{ type: "Line", value: " head", ...at(1, 1, 1, 8, 0, 7) },
			{ type: "Block", value: " inline ", ...at(2, 8, 2, 20, 15, 27) },
			{ type: "Block", value: " multi\nline ", ...at(3, 1, 4, 8, 30, 46) }
		]);
	});

	it("collects every non-comment token in source order with positions", () => {
		const ast = astFor("{ a: [1, 'x'] } // c");
		expect(ast.tokens.map((token) => [token.type, token.raw, token.range])).toEqual([
			["{", "{", [0, 1]],
			["Identifier", "a", [2, 3]],
			[":", ":", [3, 4]],
			["[", "[", [5, 6]],
			["Number", "1", [6, 7]],
			[",", ",", [7, 8]],
			["String", "'x'", [9, 12]],
			["]", "]", [12, 13]],
			["}", "}", [14, 15]]
		]);
		expect(ast.tokens[1].loc).toEqual({ start: { line: 1, column: 3 }, end: { line: 1, column: 4 } });
	});

	it("does not treat tokens that share a node type name as nodes", () => {
		const ast = astFor("{ a: `t`, b: `x${a}` }");
		expect(ast.tokens.map((token) => token.type)).toEqual([
			"{",
			"Identifier",
			":",
			"TemplateLiteral",
			",",
			"Identifier",
			":",
			"TemplateHead",
			"Identifier",
			"TemplateTail",
			"}"
		]);
		expect(ast.tokens[3]).not.toHaveProperty("quasis");
	});
});

describe("language.visitorKeys", () => {
	it("lists the child keys of every node type the parser emits", () => {
		expect(language.visitorKeys).toEqual({
			Program: ["body"],
			ObjectExpression: ["properties"],
			Property: ["key", "value"],
			ArrayExpression: ["elements"],
			Literal: [],
			Identifier: [],
			MemberExpression: ["object", "property"],
			TemplateLiteral: ["quasis", "expressions"],
			TemplateElement: []
		});
		expect(Object.isFrozen(language.visitorKeys)).toBe(true);
	});
});
