import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create a court
  const court = await prisma.court.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Supreme Court of New South Wales',
      courtLevel: 'SUPREME',
      location: 'Sydney',
      room: 'Court 12A',
      isActive: true,
    },
  });
  console.log(`Court: ${court.name} (${court.id})`);

  // Create a court day for today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const courtDay = await prisma.courtDay.upsert({
    where: {
      courtId_date: { courtId: court.id, date: today },
    },
    update: {},
    create: {
      courtId: court.id,
      date: today,
      judgeName: 'Justice Williams',
      registrarName: 'M. Chen',
      status: 'SCHEDULED',
      sessionStatus: 'BEFORE_SITTING',
    },
  });
  console.log(`Court Day: ${courtDay.id} (${courtDay.date.toISOString().split('T')[0]})`);

  // Create sample list items
  const items = [
    {
      caseName: 'Smith v Jones',
      caseReference: '2026/00123',
      partiesShort: 'Smith (P) / Jones (D)',
      estimatedDurationMinutes: 30,
      queuePosition: 1,
      publicNote: 'Application for interim injunction',
    },
    {
      caseName: 'Re Application of ABC Pty Ltd',
      caseReference: '2026/00456',
      partiesShort: 'ABC Pty Ltd (Applicant)',
      estimatedDurationMinutes: 15,
      queuePosition: 2,
      publicNote: 'Directions hearing',
    },
    {
      caseName: 'Brown v State of NSW',
      caseReference: '2026/00789',
      partiesShort: 'Brown (P) / State (D)',
      estimatedDurationMinutes: 60,
      queuePosition: 3,
      isPriority: true,
      publicNote: 'Part-heard from previous sitting',
    },
    {
      caseName: 'Estate of Williams (deceased)',
      caseReference: '2026/00234',
      partiesShort: 'Williams Estate',
      estimatedDurationMinutes: 20,
      queuePosition: 4,
    },
    {
      caseName: 'Chen v Metropolitan Transport',
      caseReference: '2026/00567',
      partiesShort: 'Chen (P) / Metro Transport (D)',
      estimatedDurationMinutes: 45,
      queuePosition: 5,
      publicNote: 'Motion to strike',
    },
  ];

  for (const item of items) {
    const created = await prisma.listItem.upsert({
      where: {
        id: `00000000-0000-0000-0000-00000000010${item.queuePosition}`,
      },
      update: {},
      create: {
        id: `00000000-0000-0000-0000-00000000010${item.queuePosition}`,
        courtDayId: courtDay.id,
        caseName: item.caseName,
        caseReference: item.caseReference,
        partiesShort: item.partiesShort ?? null,
        estimatedDurationMinutes: item.estimatedDurationMinutes,
        queuePosition: item.queuePosition,
        status: 'WAITING',
        isPriority: item.isPriority ?? false,
        publicNote: item.publicNote ?? null,
      },
    });
    console.log(`  Item ${created.queuePosition}: ${created.caseName}`);
  }

  console.log('\nSeed complete. Use the court day ID to test endpoints:');
  console.log(`  Court Day ID: ${courtDay.id}`);
  console.log(`  Court ID:     ${court.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
