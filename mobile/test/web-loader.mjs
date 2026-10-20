// Test the real frontend API and controllers without loading native packages.
// TypeScript is already a project dependency; no browser or new test library is needed.
import ts from "typescript";
import { readFile } from "node:fs/promises";
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "react-native")
    return { url: "paprint-test:native", shortCircuit: true };
  if (specifier === "@react-native-async-storage/async-storage")
    return { url: "paprint-test:storage", shortCircuit: true };
  if (
    context.parentURL?.includes("/mobile/src/") &&
    specifier.startsWith(".") &&
    !/\.[a-z]+$/i.test(specifier)
  )
    return nextResolve(specifier + ".ts", context);
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url === "paprint-test:native")
    return {
      format: "module",
      source: 'export const Platform = { OS: "web" };',
      shortCircuit: true,
    };
  if (url === "paprint-test:storage")
    return {
      format: "module",
      source: "export default globalThis.paprintTestStorage;",
      shortCircuit: true,
    };
  if (url.includes("/mobile/src/") && url.endsWith(".ts")) {
    const source = await readFile(new URL(url), "utf8");
    return {
      format: "module",
      source: ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
