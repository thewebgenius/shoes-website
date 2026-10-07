import path from "node:path";

/**
 * Sample 3D model library shipped with the repository (seed-assets/models).
 * Shopkeepers can assign one of these to a product during MVP development when
 * no real scan exists yet. Products using them are labelled "Studio sample model".
 */

const KHRONOS = {
  license: "CC-BY-4.0",
  attribution: "“Materials Variants Shoe” © 2021 Shopify, via Khronos glTF-Sample-Assets (CC BY 4.0)",
};
const OWN = { license: "CC0-1.0", attribution: "Original parametric model created for this project (CC0)" };

export const SAMPLE_MODELS: Array<{ id: string; label: string; style: string; license: string; attribution: string }> = [
  { id: "khronos-shoe-midnight", label: "Knit Runner – Midnight", style: "Running sneaker (photoreal scan-style)", ...KHRONOS },
  { id: "khronos-shoe-beach", label: "Knit Runner – Beach", style: "Running sneaker (photoreal scan-style)", ...KHRONOS },
  { id: "khronos-shoe-street", label: "Knit Runner – Street", style: "Running sneaker (photoreal scan-style)", ...KHRONOS },
  { id: "aero-runner-cobalt", label: "Aero Runner – Cobalt", style: "Running shoe", ...OWN },
  { id: "aero-runner-coral", label: "Aero Runner – Coral", style: "Running shoe", ...OWN },
  { id: "court-classic-white", label: "Court Classic – White", style: "Court sneaker", ...OWN },
  { id: "court-classic-blush", label: "Court Classic – Blush", style: "Court sneaker", ...OWN },
  { id: "summit-high-black", label: "Summit High – Black", style: "High-top sneaker", ...OWN },
  { id: "chelsea-tan", label: "Chelsea Boot – Tan", style: "Chelsea boot", ...OWN },
  { id: "trail-hiker-olive", label: "Trail Hiker – Olive", style: "Hiking boot", ...OWN },
  { id: "penny-loafer-burgundy", label: "Penny Loafer – Burgundy", style: "Loafer", ...OWN },
  { id: "stiletto-pump-noir", label: "Stiletto Pump – Noir", style: "Heeled pump", ...OWN },
  { id: "stiletto-pump-nude", label: "Stiletto Pump – Nude", style: "Heeled pump", ...OWN },
  { id: "ballet-flat-rose", label: "Ballet Flat – Rose", style: "Ballet flat", ...OWN },
  { id: "cloud-slide-sand", label: "Cloud Slide – Sand", style: "Slide sandal", ...OWN },
  { id: "riviera-sandal-cognac", label: "Riviera Sandal – Cognac", style: "Strap sandal", ...OWN },
  { id: "kids-velcro-sky", label: "Kids Velcro – Sky", style: "Kids sneaker", ...OWN },
  { id: "kids-velcro-berry", label: "Kids Velcro – Berry", style: "Kids sneaker", ...OWN },
  { id: "kids-high-lime", label: "Kids High – Lime", style: "Kids high-top", ...OWN },
];

export function sampleModelPath(id: string) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Invalid sample id");
  return path.join(process.cwd(), "seed-assets", "models", `${id}.glb`);
}
