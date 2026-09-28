/**
 * @fileoverview RuleTester (flat config) runs against the `jsonv/jsonv` language:
 * valid/invalid cases, messages, locations, options and autofix output for the
 * fixture rules in ./fixtures/rules.mjs. Reports on the Program node span the whole
 * document; reports on an inner node land on that node's own 1-based position.
 */
import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import plugin from "../index.mjs";
import { maxLines, noTodo, noTodoValue } from "./fixtures/rules.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
	files: ["**/*.jsonv"],
	plugins: { jsonv: plugin },
	language: "jsonv/jsonv"
});

const filename = "fixture.jsonv";

ruleTester.run("no-todo (jsonv language)", noTodo, {
	valid: [
		{ filename, code: '{ status: "done" }' },
		{ filename, code: "[1, 2, 3,]" },
		{ filename, code: "// comment\n{ a: 1_000n }" }
	],
	invalid: [
		{
			filename,
			code: '{ status: "TODO" }',
			output: '{ status: "DONE" }',
			errors: [{ messageId: "todo", line: 1, column: 1, endLine: 1, endColumn: 19 }]
		},
		{
			filename,
			code: '{\n  a: "TODO",\n  // TODO: tidy\n  b: 2\n}',
			output: '{\n  a: "DONE",\n  // DONE: tidy\n  b: 2\n}',
			errors: [{ messageId: "todo" }, { messageId: "todo" }]
		},
		{
			filename,
			code: '{ a: "TODO" }',
			output: '{ a: "DONE" }',
			errors: [{ message: "Unexpected TODO marker." }]
		}
	]
});

// RuleTester validates every case's config against `test.js` (the JS language), so
// jsonv-specific languageOptions cannot go on an individual case — they belong in a
// files-scoped tester config instead.
const es2011Tester = new RuleTester({
	files: ["**/*.jsonv"],
	plugins: { jsonv: plugin },
	language: "jsonv/jsonv",
	languageOptions: { year: 2011 }
});

es2011Tester.run("no-todo (jsonv language, year 2011)", noTodo, {
	valid: [{ filename, code: "{ a: 0x1F, b: 'ok' }" }],
	invalid: [
		{
			filename,
			code: "{ a: 'TODO' }",
			output: "{ a: 'DONE' }",
			errors: [{ messageId: "todo" }]
		}
	]
});

ruleTester.run("no-todo-value (jsonv language, node-level reports)", noTodoValue, {
	valid: [
		{ filename, code: '{ status: "done" }' },
		{ filename, code: '{ "TODO": 1, list: ["TODO"] }' },
		{ filename, code: "// TODO: comment only\n{ a: 1 }" }
	],
	invalid: [
		{
			filename,
			code: '{\n  a: 1,\n  b: "TODO"\n}',
			output: '{\n  a: 1,\n  b: "DONE"\n}',
			errors: [{ messageId: "todo", data: { key: "b" }, line: 3, column: 6, endLine: 3, endColumn: 12 }]
		},
		{
			filename,
			code: "{\r\n  'x y': 'a TODO',\r\n  7: `TODO`\r\n}",
			output: "{\r\n  'x y': 'a DONE',\r\n  7: `DONE`\r\n}",
			errors: [
				{ message: "Unexpected TODO in the value of x y.", line: 2, column: 10, endLine: 2, endColumn: 18 },
				{ message: "Unexpected TODO in the value of 7.", line: 3, column: 6, endLine: 3, endColumn: 12 }
			]
		},
		{
			filename,
			code: '{\n  // eslint-disable-next-line\n  a: "TODO",\n  b: "TODO" // eslint-disable-line\n, c: "TODO" }',
			output: '{\n  // eslint-disable-next-line\n  a: "TODO",\n  b: "TODO" // eslint-disable-line\n, c: "DONE" }',
			errors: [{ messageId: "todo", data: { key: "c" }, line: 5, column: 6, endLine: 5, endColumn: 12 }]
		}
	]
});

ruleTester.run("max-lines (jsonv language)", maxLines, {
	valid: [
		{ filename, code: "{\n  a: 1\n}" },
		{ filename, code: "{\n  a: 1,\n  b: 2\n}", options: [{ max: 4 }] }
	],
	invalid: [
		{
			filename,
			code: "{\n  a: 1,\n  b: 2\n}",
			errors: [{ messageId: "tooMany", data: { count: "4", max: "3" } }]
		},
		{
			filename,
			code: "{\r\n  a: 1\r\n}",
			options: [{ max: 1 }],
			errors: [{ message: "File has 3 lines (max 1)." }]
		}
	]
});
