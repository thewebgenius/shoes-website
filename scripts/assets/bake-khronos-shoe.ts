/**
 * Bakes the three KHR_materials_variants of the Khronos "Materials Variants Shoe"
 * (CC-BY 4.0, Shopify) into three standalone GLB files, one per colorway, and
 * downsizes textures so each file stays light enough for mobile.
 *
 * Usage: npx tsx scripts/assets/bake-khronos-shoe.ts
 */
import path from "node:path";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRMaterialsVariants } from "@gltf-transform/extensions";
import { prune, dedup, textureCompress } from "@gltf-transform/functions";

const root = path.resolve(__dirname, "../..");
const src = path.join(root, "seed-assets/vendor/MaterialsVariantsShoe.glb");
const outDir = path.join(root, "seed-assets/models");

async function main() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const probe = await io.read(src);
  const variantsExt = probe.getRoot().listExtensionsUsed().find((e) => e.extensionName === "KHR_materials_variants") as
    | KHRMaterialsVariants
    | undefined;
  if (!variantsExt) throw new Error("Variants extension missing");
  const variantNames = variantsExt.listVariants().map((v) => v.getName());

  for (const variantName of variantNames) {
    const doc = await io.read(src);
    const ext = doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === "KHR_materials_variants") as KHRMaterialsVariants;
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const mappingList = prim.getExtension<any>("KHR_materials_variants");
        if (!mappingList) continue;
        for (const mapping of mappingList.listMappings()) {
          if (mapping.listVariants().some((v: any) => v.getName() === variantName)) {
            prim.setMaterial(mapping.getMaterial());
          }
        }
        prim.setExtension("KHR_materials_variants", null);
      }
    }
    ext.dispose();
    await doc.transform(
      prune(),
      dedup(),
      textureCompress({ encoder: sharp, targetFormat: "jpeg", resize: [1024, 1024], quality: 82, slots: /baseColor|occlusion|metallicRoughness/ }),
      textureCompress({ encoder: sharp, targetFormat: "png", resize: [1024, 1024], slots: /normal/ }),
    );
    const file = path.join(outDir, `khronos-shoe-${variantName.toLowerCase()}.glb`);
    await io.write(file, doc);
    console.log("wrote", file);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
