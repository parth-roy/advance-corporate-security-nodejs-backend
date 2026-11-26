import {
  AdminUniformItem,
  UNIFORM_CATEGORIES,
  UniformCategory,
} from "../models/admin/AdminOperations.model";

export interface UniformCatalogSeedEntry {
  category: UniformCategory;
  subCategory: string;
  size: string;
  unitPrice: number;
  availableQty: number;
}

export const UNIFORM_CATALOG_SEED: readonly UniformCatalogSeedEntry[] = [
  { category: "Shirt", subCategory: "Black Shirt", size: "L", unitPrice: 450, availableQty: 50 },
  { category: "Shirt", subCategory: "Blue Shirt", size: "L", unitPrice: 450, availableQty: 50 },
  { category: "Shirt", subCategory: "Ward Boy Shirt", size: "L", unitPrice: 450, availableQty: 50 },
  { category: "T-Shirt", subCategory: "", size: "L", unitPrice: 285, availableQty: 50 },
  { category: "Pant", subCategory: "Black Pant", size: "32", unitPrice: 460, availableQty: 50 },
  { category: "Pant", subCategory: "Blue Pant", size: "32", unitPrice: 460, availableQty: 50 },
  { category: "Belt", subCategory: "", size: "Free", unitPrice: 120, availableQty: 60 },
  { category: "Shoe", subCategory: "", size: "8", unitPrice: 480, availableQty: 40 },
  { category: "Badge", subCategory: "", size: "Std", unitPrice: 0, availableQty: 100 },
  { category: "Cap", subCategory: "", size: "Free", unitPrice: 120, availableQty: 60 },
  { category: "Lanyard + Whistle", subCategory: "", size: "Std", unitPrice: 90, availableQty: 80 },
  { category: "Safety Shoe", subCategory: "", size: "8", unitPrice: 570, availableQty: 30 },
  { category: "Safety Gloves", subCategory: "", size: "Free", unitPrice: 180, availableQty: 50 },
  { category: "Jacket", subCategory: "", size: "XL", unitPrice: 550, availableQty: 25 },
  { category: "Safety Helmet", subCategory: "", size: "Free", unitPrice: 200, availableQty: 40 },
  { category: "ID Card", subCategory: "", size: "Std", unitPrice: 50, availableQty: 150 },
];

let seedLock: Promise<boolean> | null = null;

/**
 * Idempotently seeds the 16-item uniform & accessory catalog if no items
 * matching the current UNIFORM_CATEGORIES exist yet. Uses an in-memory promise
 * lock to prevent concurrent requests from duplicating the seed.
 */
export async function ensureUniformCatalogSeeded(): Promise<boolean> {
  if (seedLock) {
    return seedLock;
  }

  seedLock = (async () => {
    const validCategories = [...UNIFORM_CATEGORIES];
    const hasCatalogItems = await AdminUniformItem.exists({
      category: { $in: validCategories },
    });

    if (hasCatalogItems) {
      return false;
    }

    const legacyResult = await AdminUniformItem.deleteMany({
      category: { $nin: validCategories },
    });

    const today = new Date().toISOString().slice(0, 10);
    const docs = UNIFORM_CATALOG_SEED.map((entry) => ({
      name: entry.subCategory || entry.category,
      category: entry.category,
      subCategory: entry.subCategory,
      size: entry.size,
      unitPrice: entry.unitPrice,
      availableQty: entry.availableQty,
      issuedQty: 0,
      lastUpdated: today,
    }));

    await AdminUniformItem.insertMany(docs);
    console.log(
      `✅ Uniform catalog seeded with ${docs.length} items` +
        (legacyResult.deletedCount
          ? ` (removed ${legacyResult.deletedCount} legacy mock items)`
          : "") +
        "."
    );
    return true;
  })();

  try {
    return await seedLock;
  } finally {
    seedLock = null;
  }
}
