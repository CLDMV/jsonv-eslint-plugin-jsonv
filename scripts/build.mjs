/**
 * Build script to copy the package entry file into dist.
 */

import { copyFile, mkdir, stat } from "fs/promises";
import { dirname, resolve } from "path";

/**
 * Ensures the destination directory exists.
 * @param {string} dirPath - Directory path to create.
 * @returns {Promise<void>} Resolves when the directory exists.
 * @example
 * await ensureDir("dist");
 */
async function ensureDir(dirPath) {
	await mkdir(dirPath, { recursive: true });
}

/**
 * Copies the root entry file into dist.
 * @param {string} sourcePath - Source file path.
 * @param {string} targetPath - Destination file path.
 * @returns {Promise<void>} Resolves when the copy completes.
 * @example
 * await copyEntry("index.mjs", "dist/index.mjs");
 */
async function copyEntry(sourcePath, targetPath) {
	await ensureDir(dirname(targetPath));
	await copyFile(sourcePath, targetPath);
}

const sourcePath = resolve("index.mjs");
const targetPath = resolve("dist/index.mjs");

try {
	await stat(sourcePath);
	await copyEntry(sourcePath, targetPath);
	console.log("✓ Copied index.mjs → dist/index.mjs");
} catch (error) {
	console.error("✗ Error: Unable to copy index.mjs to dist");
	console.error(error);
	process.exit(1);
}
