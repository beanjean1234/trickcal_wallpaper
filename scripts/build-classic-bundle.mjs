import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const stagingRoot = path.resolve(process.argv[2] ?? "");
const distRoot = path.resolve(projectRoot, "dist");

if (
  !process.argv[2] ||
  (stagingRoot !== distRoot && !stagingRoot.startsWith(`${distRoot}${path.sep}`))
) {
  throw new Error(`Refusing to write a wallpaper bundle outside dist: ${stagingRoot}`);
}

const removeImports = (source) =>
  source.replace(/^import\s+[\s\S]*?\s+from\s+["'][^"']+["'];\s*/gm, "");

const removeExports = (source) => source.replace(/^export\s+/gm, "");

async function readModule(fileName) {
  const source = await readFile(path.join(projectRoot, "js", fileName), "utf8");
  return removeExports(removeImports(source)).trim();
}

async function scopedModule(fileName, exportedNames) {
  const source = await readModule(fileName);
  const names = exportedNames.join(", ");
  return `const { ${names} } = (() => {\n${source}\n\nreturn { ${names} };\n})();`;
}

const sections = await Promise.all([
  scopedModule("settings.js", ["LENS", "PARAMETERS"]),
  scopedModule("background.js", ["createBackgroundRenderer"]),
  scopedModule("interaction.js", ["makeDraggableGroup"]),
  scopedModule("group.js", ["createGroupFrameController"]),
  scopedModule("layout.js", [
    "captureLayout",
    "applyLayout",
    "pingLayoutController",
    "loadAssetCatalog",
    "getLibraryAssetUrl",
    "getBackgroundAssetUrl",
    "loadSavedLayout",
    "saveLayout",
    "openPlacementEditor",
    "closePlacementEditor",
    "openImageLibrary",
    "importImagePack",
    "uploadBackground",
  ]),
  scopedModule("scene.js", [
    "getCurrentLensSize",
    "applyParameterPreset",
    "buildFrontSpecularMap",
    "updateSpecularAngle",
    "updateSpecularOpacity",
    "buildPlateWalls",
  ]),
]);
const mainSource = await readModule("main.js");
const bundle = `(() => {\n"use strict";\n\n${sections.join("\n\n")}\n\n${mainSource}\n})();\n`;

const sourceIndex = await readFile(path.join(projectRoot, "index.html"), "utf8");
const moduleTag = '<script type="module" src="./js/main.js"></script>';
if (!sourceIndex.includes(moduleTag)) {
  throw new Error("Could not find the expected module script tag in index.html");
}

const classicIndex = sourceIndex.replace(
  moduleTag,
  '<script src="./js/wallpaper.js"></script>',
);
const outputJsDirectory = path.join(stagingRoot, "js");

await mkdir(outputJsDirectory, { recursive: true });
await writeFile(path.join(outputJsDirectory, "wallpaper.js"), bundle, "utf8");
await writeFile(path.join(stagingRoot, "index.html"), classicIndex, "utf8");
