import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const court = await prisma.court.create({
    data: {
      name: 'Supreme Court of New South Wales',
      courtLevel: 'SUPREME',
      location: 'Sydney',
      roomLabel: 'Court 12A',
      active: true,
    },
  });
  console.log(`Court: ${court.name} (${court.id})`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const courtDay = await prisma.courtDay.create({
    data: {
      courtId: court.id,
      date: today,
      judgeName: 'Justice Williams',
      sessionPeriod: 'MORNING',
      status: 'SETUP',
    },
  });
  console.log(`Court Day: ${courtDay.id} (${courtDay.date.toISOString().split('T')[0]})`);

  const items = [
    {
      caseTitleFull: 'Smith v Jones [2026] NSWSC 123',
      caseTitlePublic: 'Smith v Jones',
      caseReference: '2026/00123',
      parties: 'Smith (P) / Jones (D)',
      estimatedDurationMinutes: 30,
      position: 1,
      publicNote: 'Application for interim injunction',
    },
    {
      caseTitleFull: 'Re Application of ABC Pty Ltd [2026] NSWSC 456',
      caseTitlePublic: 'Re Application of ABC Pty Ltd',
      caseReference: '2026/00456',
      parties: 'ABC Pty Ltd (Applicant)',
      estimatedDurationMinutes: 15,
      position: 2,
      publicNote: 'Directions hearing',
    },
    {
      caseTitleFull: 'Brown v State of NSW [2026] NSWSC 789',
      caseTitlePublic: 'Brown v State of NSW',
      caseReference: '2026/00789',
      parties: 'Brown (P) / State (D)',
      estimatedDurationMinutes: 60,
      position: 3,
      publicNote: 'Part-heard from previous sitting',
    },
    {
      caseTitleFull: 'Estate of Williams (deceased) [2026] NSWSC 234',
      caseTitlePublic: 'Estate of Williams (deceased)',
      caseReference: '2026/00234',
      parties: 'Williams Estate',
      estimatedDurationMinutes: 20,
      position: 4,
    },
    {
      caseTitleFull: 'Chen v Metropolitan Transport [2026] NSWSC 567',
      caseTitlePublic: 'Chen v Metropolitan Transport',
      caseReference: '2026/00567',
      parties: 'Chen (P) / Metro Transport (D)',
      estimatedDurationMinutes: 45,
      position: 5,
      publicNote: 'Motion to strike',
    },
  ];

  for (const item of items) {
    const created = await prisma.listItem.create({
      data: {
        courtDayId: courtDay.id,
        caseTitleFull: item.caseTitleFull,
        caseTitlePublic: item.caseTitlePublic,
        caseReference: item.caseReference,
        parties: item.parties ?? null,
        counselNames: [],
        estimatedDurationMinutes: item.estimatedDurationMinutes,
        position: item.position,
        status: 'WAITING',
        publicNote: item.publicNote ?? null,
      },
    });
    console.log(`  Item ${created.position}: ${created.caseTitlePublic}`);
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
