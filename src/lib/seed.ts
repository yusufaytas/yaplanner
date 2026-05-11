import { db } from './db';
import type {
  Person,
  Subteam,
  Project,
  Quarter,
  QuarterPerson,
  QuarterProject,
  ProjectRole,
  ProjectStakeholder,
  Allocation,
  Unknown,
  Risk,
} from './types';

function uid(): string {
  return crypto.randomUUID();
}

function getWeeks(startDate: string, endDate: string): string[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const firstMonday = new Date(start);
  const dow = firstMonday.getUTCDay();
  firstMonday.setUTCDate(firstMonday.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  const weeks: string[] = [];
  const cursor = new Date(firstMonday);
  while (cursor <= end) {
    weeks.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return weeks;
}

export async function seedSampleData(): Promise<void> {
  const existingQuarters = await db.quarters.count();
  if (existingQuarters > 0) return;

  const now = new Date().toISOString();

  // ── Subteams ──────────────────────────────────────────────────────────────
  const stPlatform: Subteam = { id: uid(), name: 'Platform', purpose: 'Core infrastructure and reliability', driPersonId: null, createdAt: now };
  const stData: Subteam     = { id: uid(), name: 'Data',     purpose: 'Data pipelines, warehousing, and analytics', driPersonId: null, createdAt: now };
  const stSearch: Subteam   = { id: uid(), name: 'Search',   purpose: 'Search indexing and relevance', driPersonId: null, createdAt: now };
  const stFrontend: Subteam = { id: uid(), name: 'Frontend', purpose: 'Web and mobile product surfaces', driPersonId: null, createdAt: now };
  await db.subteams.bulkAdd([stPlatform, stData, stSearch, stFrontend]);

  // ── People ────────────────────────────────────────────────────────────────
  const alice:  Person = { id: uid(), name: 'Alice Chen',       email: 'alice@example.com',  role: 'EM',       defaultCapacity: 80,  subteamId: null,          notes: '', createdAt: now };
  const ben:    Person = { id: uid(), name: 'Ben Okafor',       email: 'ben@example.com',    role: 'Engineer', defaultCapacity: 100, subteamId: stPlatform.id, notes: '', createdAt: now };
  const cem:    Person = { id: uid(), name: 'Cem Yildiz',       email: 'cem@example.com',    role: 'Engineer', defaultCapacity: 100, subteamId: stPlatform.id, notes: '', createdAt: now };
  const diana:  Person = { id: uid(), name: 'Diana Park',       email: 'diana@example.com',  role: 'EM',       defaultCapacity: 80,  subteamId: null,          notes: '', createdAt: now };
  const ethan:  Person = { id: uid(), name: 'Ethan Müller',     email: 'ethan@example.com',  role: 'Engineer', defaultCapacity: 100, subteamId: stData.id,     notes: '', createdAt: now };
  const fatima: Person = { id: uid(), name: 'Fatima Al-Rashid', email: 'fatima@example.com', role: 'Engineer', defaultCapacity: 100, subteamId: stPlatform.id, notes: '', createdAt: now };
  const george: Person = { id: uid(), name: 'George Santos',    email: 'george@example.com', role: 'Engineer', defaultCapacity: 100, subteamId: stSearch.id,   notes: '', createdAt: now };
  const hana:   Person = { id: uid(), name: 'Hana Suzuki',      email: 'hana@example.com',   role: 'Engineer', defaultCapacity: 100, subteamId: stSearch.id,   notes: '', createdAt: now };
  const ivan:   Person = { id: uid(), name: 'Ivan Petrov',      email: 'ivan@example.com',   role: 'EM',       defaultCapacity: 80,  subteamId: null,          notes: '', createdAt: now };
  const julia:  Person = { id: uid(), name: 'Julia Osei',       email: 'julia@example.com',  role: 'Engineer', defaultCapacity: 100, subteamId: stFrontend.id, notes: '', createdAt: now };
  const kai:    Person = { id: uid(), name: 'Kai Nakamura',     email: 'kai@example.com',    role: 'PM',       defaultCapacity: 100, subteamId: null,          notes: '', createdAt: now };
  const lena:   Person = { id: uid(), name: 'Lena Hoffmann',    email: 'lena@example.com',   role: 'PM',       defaultCapacity: 100, subteamId: null,          notes: '', createdAt: now };

  await db.people.bulkAdd([alice, ben, cem, diana, ethan, fatima, george, hana, ivan, julia, kai, lena]);

  await db.subteams.update(stPlatform.id, { driPersonId: cem.id    });
  await db.subteams.update(stData.id,     { driPersonId: ethan.id  });
  await db.subteams.update(stSearch.id,   { driPersonId: george.id });
  await db.subteams.update(stFrontend.id, { driPersonId: julia.id  });

  // ── Projects ──────────────────────────────────────────────────────────────
  const pMercury: Project = { id: uid(), name: 'Project Mercury',         description: 'Migrate core API to new infrastructure with zero downtime.',          status: 'Active', tags: ['platform', 'migration'], owningSubteamId: stPlatform.id, createdAt: now, archivedAt: null };
  const pData:    Project = { id: uid(), name: 'Data Migration',           description: 'Move legacy data warehouse to modern lakehouse architecture.',         status: 'Active', tags: ['data', 'migration'], owningSubteamId: stData.id,     createdAt: now, archivedAt: null };
  const pSearch:  Project = { id: uid(), name: 'Search Revamp',            description: 'Rebuild search indexing pipeline for 10x throughput.',                status: 'Active', tags: ['search', 'reliability'], owningSubteamId: stSearch.id,   createdAt: now, archivedAt: null };
  const pMobile:  Project = { id: uid(), name: 'Mobile App v2',            description: 'Redesign mobile app with new design system and offline support.',     status: 'Active', tags: ['mobile', 'frontend'], owningSubteamId: stFrontend.id, createdAt: now, archivedAt: null };
  const pInfra:   Project = { id: uid(), name: 'Platform Infra Hardening', description: 'Improve observability, reduce p99 latency, and harden SLOs.',        status: 'Active', tags: ['platform', 'infra'], owningSubteamId: stPlatform.id, createdAt: now, archivedAt: null };

  await db.projects.bulkAdd([pMercury, pData, pSearch, pMobile, pInfra]);

  // ── Quarter ───────────────────────────────────────────────────────────────
  const quarter: Quarter = {
    id: uid(),
    name: '2026-Q3',
    startDate: '2026-06-29',
    endDate: '2026-09-27',
    status: 'active',
    createdAt: now,
    createdFromQuarterId: null,
    capacityLineAfter: 3,
    overhead: {
      items: [
        { id: 'pto',      label: 'PTO',      type: 'weeks', value: 1  },
        { id: 'meetings', label: 'Meetings', type: 'pct',   value: 10 },
        { id: 'oncall',   label: 'oncall',    type: 'pct',   value: 0  },
        { id: 'learning', label: 'Learning', type: 'pct',   value: 5  },
      ],
    },
  };
  await db.quarters.add(quarter);

  // ── QuarterPeople ─────────────────────────────────────────────────────────
  const allPeople = [alice, ben, cem, diana, ethan, fatima, george, hana, ivan, julia, kai, lena];
  const quarterPeople: QuarterPerson[] = allPeople.map((p) => ({
    id: uid(),
    quarterId: quarter.id,
    personId: p.id,
    subteamId: p.subteamId,
    inactive: false,
    quarterCapacity: p.defaultCapacity,
    overheadOverride: null,
  }));
  await db.quarterPeople.bulkAdd(quarterPeople);

  // ── QuarterProjects ───────────────────────────────────────────────────────
  const allProjects = [pMercury, pData, pSearch, pMobile, pInfra];
  const quarterProjects: QuarterProject[] = allProjects.map((p, i) => ({
    id: uid(),
    quarterId: quarter.id,
    projectId: p.id,
    status: p.status,
    priority: i,
    estimatedPersonWeeks: [18, 12, 15, 10, 14][i] ?? null,
    notes: '',
    plannedStartWeek: '2026-06-29',
    plannedEndWeek: '2026-09-27',
    targetMilestone: null,
  }));
  await db.quarterProjects.bulkAdd(quarterProjects);

  // ── Project Roles ─────────────────────────────────────────────────────────
  // Project roles include DRI/EM/PM plus explicitly assigned engineers
  const roles: ProjectRole[] = [
    // Mercury (Platform): Alice=EM, Cem=DRI, Kai=PM, Ben=Engineer
    { id: uid(), quarterId: quarter.id, projectId: pMercury.id, personId: alice.id,  role: 'EM'  },
    { id: uid(), quarterId: quarter.id, projectId: pMercury.id, personId: cem.id,    role: 'DRI' },
    { id: uid(), quarterId: quarter.id, projectId: pMercury.id, personId: kai.id,    role: 'PM'  },
    { id: uid(), quarterId: quarter.id, projectId: pMercury.id, personId: ben.id,    role: 'Engineer' },
    // Data Migration (Data): Diana=EM, Ethan=DRI, Lena=PM
    { id: uid(), quarterId: quarter.id, projectId: pData.id,    personId: diana.id,  role: 'EM'  },
    { id: uid(), quarterId: quarter.id, projectId: pData.id,    personId: ethan.id,  role: 'DRI' },
    { id: uid(), quarterId: quarter.id, projectId: pData.id,    personId: lena.id,   role: 'PM'  },
    // Search Revamp (Search): no EM in Search subteam, Alice covers cross-team; George=DRI, Lena=PM, Hana=Engineer
    { id: uid(), quarterId: quarter.id, projectId: pSearch.id,  personId: alice.id,  role: 'EM'  },
    { id: uid(), quarterId: quarter.id, projectId: pSearch.id,  personId: george.id, role: 'DRI' },
    { id: uid(), quarterId: quarter.id, projectId: pSearch.id,  personId: lena.id,   role: 'PM'  },
    { id: uid(), quarterId: quarter.id, projectId: pSearch.id,  personId: hana.id,   role: 'Engineer' },
    // Mobile App v2 (Frontend): Ivan=EM, Julia=DRI, Kai=PM
    { id: uid(), quarterId: quarter.id, projectId: pMobile.id,  personId: ivan.id,   role: 'EM'  },
    { id: uid(), quarterId: quarter.id, projectId: pMobile.id,  personId: julia.id,  role: 'DRI' },
    { id: uid(), quarterId: quarter.id, projectId: pMobile.id,  personId: kai.id,    role: 'PM'  },
    // Platform Infra Hardening (Platform): Alice=EM, Cem=DRI, Lena=PM, Ben/Fatima=Engineers
    { id: uid(), quarterId: quarter.id, projectId: pInfra.id,   personId: alice.id,  role: 'EM'  },
    { id: uid(), quarterId: quarter.id, projectId: pInfra.id,   personId: cem.id,    role: 'DRI' },
    { id: uid(), quarterId: quarter.id, projectId: pInfra.id,   personId: lena.id,   role: 'PM'  },
    { id: uid(), quarterId: quarter.id, projectId: pInfra.id,   personId: ben.id,    role: 'Engineer' },
    { id: uid(), quarterId: quarter.id, projectId: pInfra.id,   personId: fatima.id, role: 'Engineer' },
  ];
  await db.projectRoles.bulkAdd(roles);

  // ── Stakeholders ──────────────────────────────────────────────────────────
  // Stakeholders are people interested in the project but not leading it
  const stakeholders: ProjectStakeholder[] = [
    { id: uid(), quarterId: quarter.id, projectId: pMercury.id, personId: ivan.id   }, // Frontend EM watching Platform migration
    { id: uid(), quarterId: quarter.id, projectId: pData.id,    personId: kai.id    }, // PM watching Data Migration
    { id: uid(), quarterId: quarter.id, projectId: pSearch.id,  personId: ivan.id   }, // Frontend EM watching Search
    { id: uid(), quarterId: quarter.id, projectId: pMobile.id,  personId: diana.id  }, // Data EM watching Mobile
    { id: uid(), quarterId: quarter.id, projectId: pInfra.id,   personId: diana.id  }, // Data EM watching Infra
  ];
  await db.projectStakeholders.bulkAdd(stakeholders);

  // ── Allocations ───────────────────────────────────────────────────────────
  const weeks = getWeeks('2026-06-29', '2026-09-27');
  const allocations: Allocation[] = [];

  for (const w of weeks) {
    // Platform engineers split across Mercury and Infra
    allocations.push({ id: uid(), quarterId: quarter.id, personId: ben.id,    projectId: pMercury.id, weekStart: w, percentage: 70  });
    allocations.push({ id: uid(), quarterId: quarter.id, personId: ben.id,    projectId: pInfra.id,   weekStart: w, percentage: 30  });
    allocations.push({ id: uid(), quarterId: quarter.id, personId: cem.id,    projectId: pMercury.id, weekStart: w, percentage: 50  });
    allocations.push({ id: uid(), quarterId: quarter.id, personId: cem.id,    projectId: pInfra.id,   weekStart: w, percentage: 50  });
    allocations.push({ id: uid(), quarterId: quarter.id, personId: fatima.id, projectId: pInfra.id,   weekStart: w, percentage: 100 });
    // Data engineer
    allocations.push({ id: uid(), quarterId: quarter.id, personId: ethan.id,  projectId: pData.id,    weekStart: w, percentage: 80  });
    // Search engineers
    allocations.push({ id: uid(), quarterId: quarter.id, personId: george.id, projectId: pSearch.id,  weekStart: w, percentage: 90  });
    allocations.push({ id: uid(), quarterId: quarter.id, personId: hana.id,   projectId: pSearch.id,  weekStart: w, percentage: 100 });
    // Frontend engineer
    allocations.push({ id: uid(), quarterId: quarter.id, personId: julia.id,  projectId: pMobile.id,  weekStart: w, percentage: 80  });
  }
  await db.allocations.bulkAdd(allocations);

  // ── Unknowns ──────────────────────────────────────────────────────────────
  const unknowns: Unknown[] = [
    { id: uid(), projectId: pMercury.id, quarterId: quarter.id, title: 'Can migration run without customer downtime?', description: 'Need to confirm with infra team whether blue-green deploy is feasible.', resolved: false, resolvedAt: null, createdAt: now },
    { id: uid(), projectId: pData.id,    quarterId: quarter.id, title: 'Lakehouse vendor pricing at scale',            description: 'Cost model unclear above 10TB/day. Need vendor confirmation.',           resolved: false, resolvedAt: null, createdAt: now },
  ];
  await db.unknowns.bulkAdd(unknowns);

  // ── Risks ─────────────────────────────────────────────────────────────────
  const risks: Risk[] = [
    { id: uid(), projectId: pSearch.id, quarterId: quarter.id, title: 'Index rebuild may exceed maintenance window', likelihood: 'High', impact: 'High', mitigationNote: 'Spike planned for W28 to validate rebuild time.', mitigated: false, mitigatedAt: null, createdAt: now },
  ];
  await db.risks.bulkAdd(risks);
}
