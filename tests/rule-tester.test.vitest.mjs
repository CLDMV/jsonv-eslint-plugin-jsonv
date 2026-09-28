/**
 * @fileoverview RuleTester (flat config) runs against the `jsonv/jsonv` language:
 * valid/invalid cases, messages, locations, options and autofix output for the
 * fixture rules in ./fixtures/rules.mjs.
 */
import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import plugin from "../index.mjs";
import { maxLines, noTodo } from "./fixtures/rules.mjs";

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
			errors: [{ messageId: "todo", line: 1, column: 0, endLine: 1, endColumn: 0 }]
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
