import { a as build, i as loadConfig, r as findConfig, t as serve } from "./dev-server-CNs9HX-x.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { existsSync } from "node:fs";
import { register } from "tsx/esm/api";
//#region src/tsconfig.ts
/**
* @file The tsconfig `tsx` transforms the consumer's files with.
*
* The document is JSX, so loading it needs `jsx` and `jsxImportSource` set — but
* a project is not required to have a tsconfig, and one that does is not
* required to have those right. Rather than making that the consumer's problem,
* the settings are generated here and handed to `tsx` directly, layered on top
* of whatever the project already has.
*/
/** Without these the document compiles for React and fails at render. */
const JSX_OPTIONS = {
	jsx: "react-jsx",
	jsxImportSource: "preact"
};
const PROJECT_TSCONFIGS = ["tsconfig.json", "jsconfig.json"];
/** `extends` is resolved as a POSIX path, on Windows too. */
const posix = (path) => path.split(sep).join("/");
/**
* Writes a tsconfig that pins the JSX settings on top of the project's own, and
* returns its path for `tsx`'s `register`.
*
* tsx applies a single tsconfig to everything it transforms, so pointing it
* straight at the project's would leave the JSX settings to chance — they have
* to be set, and `include` has to happen to match the document. Extending gives
* both: ours always apply, and the project keeps its `paths`, `target` and the
* rest.
*/
const jsxTsconfig = async (root) => {
	const directory = join(root, "node_modules", ".tsx-to-pdf");
	await mkdir(directory, { recursive: true });
	const project = PROJECT_TSCONFIGS.map((name) => join(root, name)).find(existsSync);
	const path = join(directory, "tsconfig.json");
	await writeFile(path, `${JSON.stringify({
		...project && { extends: posix(relative(directory, project)) },
		compilerOptions: JSX_OPTIONS,
		include: [`${posix(relative(directory, root))}/**/*`]
	}, null, 2)}\n`);
	return path;
};
//#endregion
//#region src/cli.ts
const USAGE = `tsx-to-pdf <command>

Commands:
  build            Render the document to its output directory
  dev              Serve a live preview at the printed page size

Options:
  --config <path>  Config file. Defaults to tsx-to-pdf.config.ts in the cwd
  --no-pdf         build only: skip the PDF, so no browser is needed
  --port <n>       dev only: overrides the configured port
`;
/** The value after `flag`, or undefined. */
const option = (argv, flag) => {
	const index = argv.indexOf(flag);
	return index === -1 ? void 0 : argv[index + 1];
};
const main = async (argv) => {
	const [command] = argv;
	if (!command || command === "--help" || command === "-h") {
		console.info(USAGE);
		return;
	}
	const configPath = findConfig(option(argv, "--config"));
	register({ tsconfig: await jsxTsconfig(dirname(configPath)) });
	const config = await loadConfig(configPath);
	if (command === "build") {
		const written = await build(config, { pdf: !argv.includes("--no-pdf") });
		console.info(`Wrote ${written.join(", ")}`);
		return;
	}
	if (command === "dev") {
		const port = option(argv, "--port");
		serve(port ? {
			...config,
			port: Number(port)
		} : config);
		return;
	}
	throw new Error(`Unknown command ${JSON.stringify(command)}.\n\n${USAGE}`);
};
try {
	await main(process.argv.slice(2));
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
//#endregion
export {};
