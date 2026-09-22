import "dotenv/config";
import { prisma } from "../src/lib/prisma";

/**
 * Guarantee an "Others" bucket exists, so a request that fits no category can
 * still be raised and routed to a point of contact:
 *
 *   - a top-level "Others" category, and
 *   - an "Others" sub-category inside every category.
 *
 * Both are ordinary rows: they show up in the raise-request pickers, and POCs
 * are attached to them from the App Admin Console (Categories & POCs) exactly
 * like any other category or sub-category.
 *
 * Idempotent — safe to re-run, and it never touches rows that already exist
 * (so a renamed or deactivated "Others" is left as the admin left it).
 *
 *   npx tsx prisma/ensure-others.ts      (or: pnpm db:ensure-others)
 */
const OTHERS = "Others";

async function main() {
  console.log("Ensuring the 'Others' category and sub-categories …");

  const existing = await prisma.category.findFirst({ where: { name: OTHERS } });
  const maxOrder = (await prisma.category.aggregate({ _max: { order: true } }))._max.order ?? 0;

  const others =
    existing ??
    (await prisma.category.create({
      data: {
        name: OTHERS,
        description:
          "Anything that does not fit the categories above. A point of contact for this queue takes it up.",
        order: maxOrder + 1,
      },
    }));
  console.log(`  category "Others": ${others.id} (${existing ? "already existed" : "created"})`);

  const categories = await prisma.category.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] });
  let created = 0;
  for (const category of categories) {
    const already = await prisma.subCategory.findFirst({
      where: { categoryId: category.id, name: OTHERS },
      select: { id: true },
    });
    if (already) continue;
    const maxSubOrder =
      (await prisma.subCategory.aggregate({ where: { categoryId: category.id }, _max: { order: true } }))._max
        .order ?? 0;
    await prisma.subCategory.create({
      data: { categoryId: category.id, name: OTHERS, order: maxSubOrder + 1 },
    });
    created += 1;
  }
  console.log(
    `  sub-category "Others": ${created} created across ${categories.length} categories (${categories.length - created} already had one)`
  );
  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
