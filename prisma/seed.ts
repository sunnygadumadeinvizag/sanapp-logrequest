import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Seeding app5_db (Log Request) …");

  // ------------------------------------------------------------------
  // Users — provisioned from the central SSO at first login. Usernames
  // must match SSO usernames; designations set here are kept because the
  // SSO callback only updates identity fields.
  // ------------------------------------------------------------------
  const users = [
    { username: "admin", name: "System Administrator", role: "ADMIN" as const },
    { username: "sanyasi", name: "Sanyasi Naidu", role: "POC" as const },
    { username: "ramesh", name: "Ramesh Kumar", role: "POC" as const },
    { username: "lakshmi", name: "Lakshmi Devi", role: "POC" as const },
    { username: "geeta", name: "Geeta Sharma", role: "USER" as const },
    { username: "kiran", name: "Kiran Rao", role: "USER" as const },
    { username: "venkat", name: "Venkat Reddy", role: "USER" as const },
  ] as const;

  for (const u of users) {
    await prisma.appUser.upsert({
      where: { username: u.username },
      update: { name: u.name, role: u.role },
      create: { username: u.username, name: u.name, role: u.role },
    });
  }
  console.log(`  users: ${users.map((u) => u.username).join(", ")}`);

  // ------------------------------------------------------------------
  // Categories & sub-categories
  // ------------------------------------------------------------------
  const categories = [
    {
      key: "electricity",
      name: "Electricity Works",
      description: "Power failures, wiring, lighting, UPS and electrical repairs.",
      subs: ["Lighting", "Power supply", "UPS / Inverter", "Wiring & sockets"],
    },
    {
      key: "civil",
      name: "Civil Works",
      description: "Plumbing, masonry, painting, carpentry and building repairs.",
      subs: ["Plumbing", "Painting", "Carpentry", "Masonry"],
    },
    {
      key: "it-hardware",
      name: "IT Hardware",
      description: "Desktop, laptop, printer and peripheral faults.",
      subs: ["Desktop", "Laptop", "Printer / Scanner", "Networking hardware"],
    },
    {
      key: "it-software",
      name: "IT Software",
      description: "Software installation, accounts, licensing and application access.",
      subs: ["Installation", "Licensing", "Application access", "Operating system"],
    },
    {
      key: "it-network",
      name: "IT Network",
      description: "Wi-Fi, LAN, internet connectivity and network services.",
      subs: ["Wi-Fi", "LAN", "Internet", "VPN"],
    },
  ] as const;

  const catIds: Record<string, string> = {};
  for (const [i, c] of categories.entries()) {
    const cat = await prisma.category.upsert({
      where: { id: `seed-${c.key}` },
      update: { name: c.name, description: c.description, order: i, active: true },
      create: {
        id: `seed-${c.key}`,
        name: c.name,
        description: c.description,
        order: i,
        active: true,
        // Everyone may raise initially; the app-admin tunes per category.
        allowedRoles: [],
      },
    });
    catIds[c.key] = cat.id;

    for (const [si, sname] of c.subs.entries()) {
      const subId = `seed-${c.key}-${si + 1}`;
      await prisma.subCategory.upsert({
        where: { id: subId },
        update: { name: sname, order: si, active: true },
        create: { id: subId, categoryId: cat.id, name: sname, order: si, active: true },
      });
    }
  }
  console.log(`  categories: ${categories.map((c) => c.name).join(", ")}`);

  // ------------------------------------------------------------------
  // POC assignments — first-come-first-served queue order per category.
  // Sub-category level assignments (subCategoryId set) take precedence;
  // otherwise the category-level POC serves.
  // ------------------------------------------------------------------
  const pocUsers = await prisma.appUser.findMany({ where: { role: { in: ["POC", "ADMIN"] } } });
  const byName = Object.fromEntries(pocUsers.map((u) => [u.username, u.id]));
  // admin is a POC for everything (fallback); others per department.
  const assignments: { user: string; cat: string; sub?: string; order: number }[] = [
    { user: "admin", cat: "electricity", order: 3 },
    { user: "admin", cat: "civil", order: 3 },
    { user: "admin", cat: "it-hardware", order: 3 },
    { user: "admin", cat: "it-software", order: 3 },
    { user: "admin", cat: "it-network", order: 3 },
    // Electricity & civil — ramesh first, lakshmi second
    { user: "ramesh", cat: "electricity", order: 1 },
    { user: "lakshmi", cat: "electricity", order: 2 },
    { user: "ramesh", cat: "civil", order: 1 },
    { user: "lakshmi", cat: "civil", order: 2 },
    // IT — sanyasi first, ramesh second
    { user: "sanyasi", cat: "it-hardware", order: 1 },
    { user: "ramesh", cat: "it-hardware", order: 2 },
    { user: "sanyasi", cat: "it-software", order: 1 },
    { user: "sanyasi", cat: "it-network", order: 1 },
    { user: "ramesh", cat: "it-network", order: 2 },
  ];

  for (const a of assignments) {
    const sub = a.sub
      ? await prisma.subCategory.findFirst({ where: { id: `seed-${a.cat}-1` } })
      : null;
    const existing = await prisma.pocAssignment.findFirst({
      where: { userId: byName[a.user], categoryId: catIds[a.cat], subCategoryId: sub?.id ?? null },
    });
    const pocData = {
      userId: byName[a.user],
      categoryId: catIds[a.cat],
      subCategoryId: sub?.id ?? null,
      queueOrder: a.order,
      active: true,
    };
    if (existing) {
      await prisma.pocAssignment.update({ where: { id: existing.id }, data: pocData });
    } else {
      await prisma.pocAssignment.create({ data: pocData });
    }
  }
  console.log(`  poc assignments: ${assignments.length}`);

  // ------------------------------------------------------------------
  // Sample requests — a small, realistic spread so the app is not empty.
  // ------------------------------------------------------------------
  const userIds = Object.fromEntries((await prisma.appUser.findMany()).map((u) => [u.username, u.id]));
  const itNet = await prisma.category.findUniqueOrThrow({ where: { id: catIds["it-network"] } });
  const elec = await prisma.category.findUniqueOrThrow({ where: { id: catIds["electricity"] } });
  const wifiSub = await prisma.subCategory.findFirst({ where: { id: "seed-it-network-1" } });
  const lightSub = await prisma.subCategory.findFirst({ where: { id: "seed-electricity-1" } });

  const existing = await prisma.request.count();
  if (existing === 0) {
    const req1 = await prisma.request.create({
      data: {
        number: 1,
        categoryId: itNet.id,
        subCategoryId: wifiSub?.id ?? null,
        title: "Wi-Fi not connecting in Library reading hall",
        description: "The Wi-Fi network drops every few minutes near the reading hall entrance.",
        requestedById: userIds["geeta"],
        requestedForId: userIds["geeta"],
        assignedPocId: userIds["sanyasi"],
        status: "IN_PROGRESS",
        priority: "MEDIUM",
        totalWorkMinutes: 25,
        events: {
          create: [
            { userId: userIds["geeta"], type: "CREATED", message: "Request raised" },
            { userId: userIds["admin"], type: "ASSIGNED", message: "Assigned to Sanyasi Naidu (FCFS)" },
            { userId: userIds["sanyasi"], type: "STARTED", message: "Started working", minutesWorked: 25 },
          ],
        },
        comments: {
          create: [
            { userId: userIds["geeta"], body: "It happens mostly in the afternoon." },
            { userId: userIds["sanyasi"], body: "Checked the access point; firmware is outdated. Updating now." },
          ],
        },
        notifications: {
          create: [
            { userId: userIds["sanyasi"], kind: "ASSIGNED", title: "New request assigned", body: "REQ-0001 Wi-Fi not connecting in Library reading hall", read: true },
            { userId: userIds["geeta"], kind: "STATUS", title: "Request is being worked", body: "REQ-0001 is now In Progress", read: false },
          ],
        },
        workLogs: {
          create: [{ pocId: userIds["sanyasi"], startedAt: new Date(Date.now() - 30 * 60000), minutes: 25, note: "AP firmware update" }],
        },
      },
    });

    const req2 = await prisma.request.create({
      data: {
        number: 2,
        categoryId: elec.id,
        subCategoryId: lightSub?.id ?? null,
        title: "Tube light fused in Room 204",
        description: "Two tube lights are fused in Room 204 (2nd floor, MAB).",
        requestedById: userIds["kiran"],
        requestedForId: userIds["kiran"],
        assignedPocId: userIds["ramesh"],
        status: "ASSIGNED",
        priority: "LOW",
        events: {
          create: [
            { userId: userIds["kiran"], type: "CREATED", message: "Request raised" },
            { userId: userIds["admin"], type: "ASSIGNED", message: "Assigned to Ramesh Kumar (FCFS)" },
          ],
        },
        notifications: {
          create: [
            { userId: userIds["ramesh"], kind: "ASSIGNED", title: "New request assigned", body: "REQ-0002 Tube light fused in Room 204", read: false },
          ],
        },
      },
    });

    // One open request waiting in the queue (no POC taken it yet).
    await prisma.request.create({
      data: {
        number: 3,
        categoryId: itNet.id,
        subCategoryId: wifiSub?.id ?? null,
        title: "Request for static IP for printer",
        description: "The shared printer in the accounts section needs a static IP address.",
        requestedById: userIds["venkat"],
        requestedForId: userIds["venkat"],
        status: "OPEN",
        priority: "HIGH",
        events: {
          create: [{ userId: userIds["venkat"], type: "CREATED", message: "Request raised" }],
        },
        notifications: {
          create: [
            { userId: userIds["sanyasi"], kind: "REQUEST_RAISED", title: "New request in your queue", body: "REQ-0003 Request for static IP for printer", read: false },
            { userId: userIds["ramesh"], kind: "REQUEST_RAISED", title: "New request in your queue", body: "REQ-0003 Request for static IP for printer", read: false },
          ],
        },
      },
    });

    console.log(`  sample requests: ${[req1.number, req2.number, 3].join(", ")}`);
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
