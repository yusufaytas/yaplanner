import { db } from './db';
import { DEFAULT_OVERHEAD_ITEMS } from './types';
import type {
  Allocation,
  CapacityOverhead,
  Person,
  Project,
  Quarter,
  QuarterPerson,
  QuarterProject,
  Role,
  Subteam,
} from './types';

function uid(): string {
  return crypto.randomUUID();
}

function cloneDefaultOverhead(): CapacityOverhead {
  return {
    items: DEFAULT_OVERHEAD_ITEMS.map((item) => ({ ...item })),
  };
}

function makeSubteam(name: string, purpose: string, createdAt: string): Subteam {
  return {
    id: uid(),
    name,
    purpose,
    createdAt,
  };
}

function makePerson(params: {
  name: string;
  email: string;
  role: Role;
  defaultCapacity: number;
  subteamId: string | null;
  createdAt: string;
  notes?: string;
}): Person {
  return {
    id: uid(),
    name: params.name,
    email: params.email,
    role: params.role,
    defaultCapacity: params.defaultCapacity,
    subteamId: params.subteamId,
    notes: params.notes ?? '',
    createdAt: params.createdAt,
  };
}

function makeQuarter(params: {
  name: string;
  startDate: string;
  endDate: string;
  status: Quarter['status'];
  createdAt: string;
  capacityLineAfter: number | null;
  createdFromQuarterId?: string | null;
  overhead?: CapacityOverhead;
}): Quarter {
  return {
    id: uid(),
    name: params.name,
    startDate: params.startDate,
    endDate: params.endDate,
    status: params.status,
    createdAt: params.createdAt,
    createdFromQuarterId: params.createdFromQuarterId ?? null,
    capacityLineAfter: params.capacityLineAfter,
    overhead: params.overhead ?? cloneDefaultOverhead(),
  };
}

function makeProject(params: {
  name: string;
  description: string;
  status: Project['status'];
  tags: string[];
  subteamId: string;
  createdAt: string;
  archivedAt?: string | null;
  links?: Project['links'];
  unknowns?: Project['unknowns'];
  risks?: Project['risks'];
}): Project {
  return {
    id: uid(),
    name: params.name,
    description: params.description,
    status: params.status,
    tags: params.tags,
    subteamId: params.subteamId,
    createdAt: params.createdAt,
    archivedAt: params.archivedAt ?? null,
    links: params.links ?? [],
    unknowns: params.unknowns ?? [],
    risks: params.risks ?? [],
  };
}

function makeQuarterPerson(params: {
  quarterId: string;
  person: Person;
  subteamId?: string | null;
  inactive?: boolean;
  quarterCapacity?: number;
  overheadOverride?: CapacityOverhead | null;
}): QuarterPerson {
  return {
    id: uid(),
    quarterId: params.quarterId,
    personId: params.person.id,
    subteamId: params.subteamId ?? params.person.subteamId,
    inactive: params.inactive ?? false,
    quarterCapacity: params.quarterCapacity ?? params.person.defaultCapacity,
    overheadOverride: params.overheadOverride ?? null,
  };
}

function makeQuarterProject(params: {
  quarterId: string;
  project: Project;
  priority: number;
  estimatedPersonWeeks: number | null;
  notes?: string;
  plannedStartWeek?: string | null;
  plannedEndWeek?: string | null;
  targetMilestone?: string | null;
  status?: Project['status'];
}): QuarterProject {
  return {
    id: uid(),
    quarterId: params.quarterId,
    projectId: params.project.id,
    status: params.status ?? params.project.status,
    priority: params.priority,
    estimatedPersonWeeks: params.estimatedPersonWeeks,
    notes: params.notes ?? '',
    plannedStartWeek: params.plannedStartWeek ?? null,
    plannedEndWeek: params.plannedEndWeek ?? null,
    targetMilestone: params.targetMilestone ?? null,
  };
}

function makeAllocation(params: {
  quarterId: string | null;
  projectId: string;
  personId: string;
  role: Role;
  startDate: string;
  endDate?: string | null;
  percentage?: number;
}): Allocation {
  return {
    id: uid(),
    quarterId: params.quarterId,
    projectId: params.projectId,
    personId: params.personId,
    role: params.role,
    startDate: params.startDate,
    endDate: params.endDate ?? null,
    percentage: params.percentage ?? 0,
  };
}

export async function seedSampleData(): Promise<void> {
  if (await db.quarters.count()) return;

  const now = new Date().toISOString();

  const stPlatform = makeSubteam('Platform', 'Core platform, gateways, and reliability', now);
  const stData = makeSubteam('Data', 'Warehouse, pipelines, and analytics systems', now);
  const stFrontend = makeSubteam('Frontend', 'Apps, design systems, and customer surfaces', now);
  const stGrowth = makeSubteam('Growth', 'Experiments and acquisition surfaces', now);
  await db.subteams.bulkAdd([stPlatform, stData, stFrontend, stGrowth]);

  const alice = makePerson({ name: 'Alice Chen', email: 'alice@example.com', role: 'EM', defaultCapacity: 80, subteamId: null, createdAt: now, notes: 'Previously covered Platform and Data.' });
  const priya = makePerson({ name: 'Priya Raman', email: 'priya@example.com', role: 'EM', defaultCapacity: 80, subteamId: null, createdAt: now });
  const kai = makePerson({ name: 'Kai Nakamura', email: 'kai@example.com', role: 'PM', defaultCapacity: 100, subteamId: null, createdAt: now });
  const mateo = makePerson({ name: 'Mateo Silva', email: 'mateo@example.com', role: 'PM', defaultCapacity: 100, subteamId: null, createdAt: now });

  const ben = makePerson({ name: 'Ben Okafor', email: 'ben@example.com', role: 'Engineer', defaultCapacity: 100, subteamId: stPlatform.id, createdAt: now });
  const cem = makePerson({ name: 'Cem Yildiz', email: 'cem@example.com', role: 'Engineer', defaultCapacity: 100, subteamId: stPlatform.id, createdAt: now });
  const leila = makePerson({ name: 'Leila Haddad', email: 'leila@example.com', role: 'Engineer', defaultCapacity: 80, subteamId: stPlatform.id, createdAt: now });
  const quinn = makePerson({ name: 'Quinn Foster', email: 'quinn@example.com', role: 'Engineer', defaultCapacity: 100, subteamId: stPlatform.id, createdAt: now, notes: 'Rolled off Platform mid-quarter.' });

  const farah = makePerson({ name: 'Farah Noor', email: 'farah@example.com', role: 'Engineer', defaultCapacity: 90, subteamId: stData.id, createdAt: now });
  const imani = makePerson({ name: 'Imani Brooks', email: 'imani@example.com', role: 'Engineer', defaultCapacity: 80, subteamId: stData.id, createdAt: now });
  const jonah = makePerson({ name: 'Jonah Klein', email: 'jonah@example.com', role: 'Engineer', defaultCapacity: 60, subteamId: stData.id, createdAt: now });
  const tanner = makePerson({ name: 'Tanner Lee', email: 'tanner@example.com', role: 'Engineer', defaultCapacity: 70, subteamId: stData.id, createdAt: now, notes: 'On leave this quarter.' });

  const nia = makePerson({ name: 'Nia Alvarez', email: 'nia@example.com', role: 'Engineer', defaultCapacity: 90, subteamId: stFrontend.id, createdAt: now });
  const omar = makePerson({ name: 'Omar Costa', email: 'omar@example.com', role: 'Engineer', defaultCapacity: 85, subteamId: stFrontend.id, createdAt: now });
  const zoya = makePerson({ name: 'Zoya Singh', email: 'zoya@example.com', role: 'Engineer', defaultCapacity: 50, subteamId: stFrontend.id, createdAt: now });
  const greta = makePerson({ name: 'Greta Novak', email: 'greta@example.com', role: 'Engineer', defaultCapacity: 100, subteamId: stGrowth.id, createdAt: now });

  const people = [
    alice, priya, kai, mateo,
    ben, cem, leila, quinn,
    farah, imani, jonah, tanner,
    nia, omar, zoya, greta,
  ];
  await db.people.bulkAdd(people);

  const closedQuarter = makeQuarter({
    name: '2026-Q1',
    startDate: '2026-01-01',
    endDate: '2026-03-31',
    status: 'closed',
    createdAt: now,
    capacityLineAfter: 1,
  });
  const activeQuarter = makeQuarter({
    name: '2026-Q2',
    startDate: '2026-04-01',
    endDate: '2026-06-30',
    status: 'active',
    createdAt: now,
    capacityLineAfter: 3,
    createdFromQuarterId: closedQuarter.id,
  });
  const draftQuarter = makeQuarter({
    name: '2026-Q3',
    startDate: '2026-07-01',
    endDate: '2026-09-30',
    status: 'draft',
    createdAt: now,
    capacityLineAfter: null,
    createdFromQuarterId: activeQuarter.id,
  });
  await db.quarters.bulkAdd([closedQuarter, activeQuarter, draftQuarter]);

  const mercury = makeProject({
    name: 'Project Mercury',
    description: 'Migrate the edge API layer to the new gateway and retire legacy routing.',
    status: 'Active',
    tags: ['platform', 'infra'],
    subteamId: stPlatform.id,
    createdAt: now,
    links: [
      { id: uid(), label: 'Design doc', url: 'https://example.com/mercury-design' },
      { id: uid(), label: 'Cutover checklist', url: 'https://example.com/mercury-cutover' },
    ],
    unknowns: [
      {
        id: uid(),
        quarterId: activeQuarter.id,
        title: 'Migration plan gap',
        description: 'Need a tested rollback runbook before traffic cutover.',
        resolved: false,
        resolvedAt: null,
        createdAt: now,
      },
      {
        id: uid(),
        quarterId: closedQuarter.id,
        title: 'Gateway rate limits',
        description: 'Initial concern about provider throttling was closed after load testing.',
        resolved: true,
        resolvedAt: '2026-03-20T18:00:00.000Z',
        createdAt: '2026-02-11T09:00:00.000Z',
      },
    ],
    risks: [
      {
        id: uid(),
        quarterId: activeQuarter.id,
        title: 'Rollback complexity',
        likelihood: 'Medium',
        impact: 'High',
        mitigationNote: 'Keep the legacy routing tables warm and rehearse rollback in staging.',
        mitigated: false,
        mitigatedAt: null,
        createdAt: now,
      },
    ],
  });
  const atlas = makeProject({
    name: 'Atlas Control Plane',
    description: 'Ship the operator APIs and rollout tooling for the internal platform control plane.',
    status: 'Active',
    tags: ['platform', 'control-plane'],
    subteamId: stPlatform.id,
    createdAt: now,
    links: [{ id: uid(), label: 'RFC', url: 'https://example.com/atlas-rfc' }],
  });
  const lakehouse = makeProject({
    name: 'Lakehouse Migration',
    description: 'Move the warehouse and downstream ETL jobs onto the new lakehouse platform.',
    status: 'Active',
    tags: ['data', 'migration'],
    subteamId: stData.id,
    createdAt: now,
    risks: [
      {
        id: uid(),
        quarterId: activeQuarter.id,
        title: 'Warehouse cutover risk',
        likelihood: 'High',
        impact: 'High',
        mitigationNote: 'Run dual writes and parallel validation until finance signs off.',
        mitigated: false,
        mitigatedAt: null,
        createdAt: now,
      },
    ],
  });
  const realtime = makeProject({
    name: 'Realtime Insights',
    description: 'Backfill and launch the low-latency product analytics stream.',
    status: 'Active',
    tags: ['data', 'analytics'],
    subteamId: stData.id,
    createdAt: now,
    unknowns: [
      {
        id: uid(),
        quarterId: activeQuarter.id,
        title: 'Sampling strategy',
        description: 'Still need product sign-off on the event retention and sampling policy.',
        resolved: false,
        resolvedAt: null,
        createdAt: now,
      },
    ],
  });
  const mobile = makeProject({
    name: 'Mobile App v2',
    description: 'Refresh the iOS and Android app around the new navigation and design system.',
    status: 'Active',
    tags: ['frontend', 'mobile'],
    subteamId: stFrontend.id,
    createdAt: now,
    links: [{ id: uid(), label: 'Prototype', url: 'https://example.com/mobile-prototype' }],
    unknowns: [
      {
        id: uid(),
        quarterId: closedQuarter.id,
        title: 'Native module performance',
        description: 'Profiling concern was resolved after replacing the image pipeline.',
        resolved: true,
        resolvedAt: '2026-03-18T16:00:00.000Z',
        createdAt: '2026-02-09T10:00:00.000Z',
      },
    ],
    risks: [
      {
        id: uid(),
        quarterId: activeQuarter.id,
        title: 'App store review timing',
        likelihood: 'Low',
        impact: 'Medium',
        mitigationNote: 'Keep the release train staged one week ahead of the planned launch.',
        mitigated: true,
        mitigatedAt: '2026-04-22T12:00:00.000Z',
        createdAt: '2026-04-05T12:00:00.000Z',
      },
    ],
  });
  const experimentation = makeProject({
    name: 'Experimentation Hub',
    description: 'Unify feature flags and experiment reporting for growth and product teams.',
    status: 'On Hold',
    tags: ['frontend', 'growth'],
    subteamId: stFrontend.id,
    createdAt: now,
    unknowns: [
      {
        id: uid(),
        quarterId: activeQuarter.id,
        title: 'Analytics owner',
        description: 'Waiting for the growth leadership decision on experiment metrics ownership.',
        resolved: false,
        resolvedAt: null,
        createdAt: now,
      },
    ],
  });
  const designSystem = makeProject({
    name: 'Design System Refresh',
    description: 'Prepare the next design system milestone for the second half planning cycle.',
    status: 'Proposed',
    tags: ['frontend', 'design-system'],
    subteamId: stFrontend.id,
    createdAt: now,
  });
  const legacyBilling = makeProject({
    name: 'Legacy Billing Sunset',
    description: 'Retire the last legacy billing entrypoints and archive the old job runners.',
    status: 'Complete',
    tags: ['platform', 'billing'],
    subteamId: stPlatform.id,
    createdAt: '2026-01-05T09:00:00.000Z',
    archivedAt: '2026-04-01T09:00:00.000Z',
    links: [{ id: uid(), label: 'Retrospective', url: 'https://example.com/billing-retro' }],
  });
  await db.projects.bulkAdd([
    mercury,
    atlas,
    lakehouse,
    realtime,
    mobile,
    experimentation,
    designSystem,
    legacyBilling,
  ]);

  const activeQuarterPeople: QuarterPerson[] = [
    makeQuarterPerson({ quarterId: activeQuarter.id, person: alice, quarterCapacity: 70 }),
    makeQuarterPerson({ quarterId: activeQuarter.id, person: priya, quarterCapacity: 80 }),
    makeQuarterPerson({ quarterId: activeQuarter.id, person: kai }),
    makeQuarterPerson({ quarterId: activeQuarter.id, person: mateo }),
    makeQuarterPerson({ quarterId: activeQuarter.id, person: ben, subteamId: stPlatform.id, quarterCapacity: 90 }),
    makeQuarterPerson({ quarterId: activeQuarter.id, person: cem, subteamId: stPlatform.id, quarterCapacity: 100 }),
    makeQuarterPerson({
      quarterId: activeQuarter.id,
      person: leila,
      subteamId: stPlatform.id,
      quarterCapacity: 60,
      overheadOverride: {
        items: [
          { id: 'pto', label: 'PTO', type: 'weeks', value: 1.5 },
          { id: 'meetings', label: 'Meetings', type: 'pct', value: 8 },
        ],
      },
    }),
    makeQuarterPerson({ quarterId: activeQuarter.id, person: farah, subteamId: stData.id, quarterCapacity: 80 }),
    makeQuarterPerson({ quarterId: activeQuarter.id, person: imani, subteamId: stData.id, quarterCapacity: 70 }),
    makeQuarterPerson({ quarterId: activeQuarter.id, person: jonah, subteamId: stData.id, quarterCapacity: 50 }),
    makeQuarterPerson({ quarterId: activeQuarter.id, person: tanner, subteamId: stData.id, inactive: true, quarterCapacity: 70 }),
    makeQuarterPerson({ quarterId: activeQuarter.id, person: nia, subteamId: stFrontend.id, quarterCapacity: 85 }),
    makeQuarterPerson({
      quarterId: activeQuarter.id,
      person: omar,
      subteamId: stFrontend.id,
      quarterCapacity: 80,
      overheadOverride: {
        items: [
          { id: 'meetings', label: 'Meetings', type: 'pct', value: 12 },
          { id: 'support', label: 'Support', type: 'pct', value: 10 },
        ],
      },
    }),
    makeQuarterPerson({ quarterId: activeQuarter.id, person: zoya, subteamId: stFrontend.id, quarterCapacity: 40 }),
    makeQuarterPerson({ quarterId: activeQuarter.id, person: greta, subteamId: stGrowth.id, quarterCapacity: 100 }),
  ];

  const closedQuarterPeople: QuarterPerson[] = [
    makeQuarterPerson({ quarterId: closedQuarter.id, person: alice, quarterCapacity: 80 }),
    makeQuarterPerson({ quarterId: closedQuarter.id, person: kai }),
    makeQuarterPerson({ quarterId: closedQuarter.id, person: ben, subteamId: stPlatform.id }),
    makeQuarterPerson({ quarterId: closedQuarter.id, person: cem, subteamId: stPlatform.id }),
    makeQuarterPerson({ quarterId: closedQuarter.id, person: leila, subteamId: stPlatform.id, quarterCapacity: 70 }),
    makeQuarterPerson({ quarterId: closedQuarter.id, person: quinn, subteamId: stPlatform.id }),
    makeQuarterPerson({ quarterId: closedQuarter.id, person: farah, subteamId: stData.id }),
    makeQuarterPerson({ quarterId: closedQuarter.id, person: imani, subteamId: stData.id, quarterCapacity: 70 }),
    makeQuarterPerson({ quarterId: closedQuarter.id, person: nia, subteamId: stFrontend.id }),
    makeQuarterPerson({ quarterId: closedQuarter.id, person: omar, subteamId: stFrontend.id, quarterCapacity: 80 }),
  ];
  await db.quarterPeople.bulkAdd([...closedQuarterPeople, ...activeQuarterPeople]);

  const activeQuarterProjects: QuarterProject[] = [
    makeQuarterProject({ quarterId: activeQuarter.id, project: mercury, priority: 0, estimatedPersonWeeks: 24, plannedStartWeek: activeQuarter.startDate, plannedEndWeek: activeQuarter.endDate, notes: 'Critical migration path for the platform roadmap.' }),
    makeQuarterProject({
      quarterId: activeQuarter.id,
      project: atlas,
      priority: 1,
      estimatedPersonWeeks: 16,
      plannedStartWeek: activeQuarter.startDate,
      plannedEndWeek: activeQuarter.endDate,
      notes: 'Clean sample project that goes at-risk only when shared delivery people exceed effective capacity.',
    }),
    makeQuarterProject({ quarterId: activeQuarter.id, project: lakehouse, priority: 2, estimatedPersonWeeks: 20, plannedStartWeek: activeQuarter.startDate, plannedEndWeek: activeQuarter.endDate }),
    makeQuarterProject({ quarterId: activeQuarter.id, project: realtime, priority: 3, estimatedPersonWeeks: 12, plannedStartWeek: activeQuarter.startDate, plannedEndWeek: activeQuarter.endDate }),
    makeQuarterProject({ quarterId: activeQuarter.id, project: mobile, priority: 4, estimatedPersonWeeks: 14, plannedStartWeek: activeQuarter.startDate, plannedEndWeek: activeQuarter.endDate }),
    makeQuarterProject({ quarterId: activeQuarter.id, project: experimentation, priority: 5, estimatedPersonWeeks: 6, plannedStartWeek: activeQuarter.startDate, plannedEndWeek: null, notes: 'Paused until growth leadership confirms scope.' }),
  ];
  const closedQuarterProjects: QuarterProject[] = [
    makeQuarterProject({ quarterId: closedQuarter.id, project: legacyBilling, priority: 0, estimatedPersonWeeks: 10, plannedStartWeek: closedQuarter.startDate, plannedEndWeek: closedQuarter.endDate, targetMilestone: 'Billing sunset complete' }),
    makeQuarterProject({
      quarterId: closedQuarter.id,
      project: mercury,
      priority: 1,
      estimatedPersonWeeks: 14,
      plannedStartWeek: closedQuarter.startDate,
      plannedEndWeek: closedQuarter.endDate,
      status: 'Complete',
      notes: 'Gateway migration phase 1 completed last quarter; Q2 continues with the next cutover phase.',
      targetMilestone: 'Phase 1 complete',
    }),
    makeQuarterProject({
      quarterId: closedQuarter.id,
      project: mobile,
      priority: 2,
      estimatedPersonWeeks: 9,
      plannedStartWeek: closedQuarter.startDate,
      plannedEndWeek: closedQuarter.endDate,
      status: 'Complete',
      notes: 'The first mobile redesign milestone shipped in Q1 before the Q2 expansion work.',
      targetMilestone: 'V2 milestone 1 shipped',
    }),
  ];
  await db.quarterProjects.bulkAdd([...closedQuarterProjects, ...activeQuarterProjects]);

  const allocations: Allocation[] = [
    // Closed quarter history
    makeAllocation({ quarterId: closedQuarter.id, projectId: legacyBilling.id, personId: ben.id, role: 'DRI', startDate: closedQuarter.startDate, endDate: closedQuarter.endDate, percentage: 55 }),
    makeAllocation({ quarterId: closedQuarter.id, projectId: legacyBilling.id, personId: quinn.id, role: 'Engineer', startDate: closedQuarter.startDate, endDate: closedQuarter.endDate, percentage: 45 }),
    makeAllocation({ quarterId: closedQuarter.id, projectId: legacyBilling.id, personId: alice.id, role: 'EM', startDate: closedQuarter.startDate, endDate: closedQuarter.endDate }),
    makeAllocation({ quarterId: closedQuarter.id, projectId: legacyBilling.id, personId: kai.id, role: 'PM', startDate: closedQuarter.startDate, endDate: closedQuarter.endDate }),
    makeAllocation({ quarterId: closedQuarter.id, projectId: mercury.id, personId: ben.id, role: 'DRI', startDate: closedQuarter.startDate, endDate: closedQuarter.endDate, percentage: 40 }),
    makeAllocation({ quarterId: closedQuarter.id, projectId: mercury.id, personId: cem.id, role: 'Engineer', startDate: closedQuarter.startDate, endDate: closedQuarter.endDate, percentage: 30 }),
    makeAllocation({ quarterId: closedQuarter.id, projectId: mercury.id, personId: leila.id, role: 'Engineer', startDate: closedQuarter.startDate, endDate: closedQuarter.endDate, percentage: 20 }),
    makeAllocation({ quarterId: closedQuarter.id, projectId: mercury.id, personId: alice.id, role: 'EM', startDate: closedQuarter.startDate, endDate: closedQuarter.endDate }),
    makeAllocation({ quarterId: closedQuarter.id, projectId: mercury.id, personId: kai.id, role: 'PM', startDate: closedQuarter.startDate, endDate: closedQuarter.endDate }),
    makeAllocation({ quarterId: closedQuarter.id, projectId: mobile.id, personId: nia.id, role: 'DRI', startDate: closedQuarter.startDate, endDate: closedQuarter.endDate, percentage: 45 }),
    makeAllocation({ quarterId: closedQuarter.id, projectId: mobile.id, personId: omar.id, role: 'Engineer', startDate: closedQuarter.startDate, endDate: closedQuarter.endDate, percentage: 35 }),

    // Active Platform subteam: same roster across Mercury and Atlas, with history
    makeAllocation({ quarterId: activeQuarter.id, projectId: mercury.id, personId: ben.id, role: 'DRI', startDate: activeQuarter.startDate, endDate: '2026-04-14', percentage: 45 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: mercury.id, personId: quinn.id, role: 'Engineer', startDate: activeQuarter.startDate, endDate: '2026-04-10', percentage: 20 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: mercury.id, personId: alice.id, role: 'EM', startDate: activeQuarter.startDate, endDate: '2026-04-20' }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: mercury.id, personId: mateo.id, role: 'PM', startDate: activeQuarter.startDate, endDate: '2026-04-12' }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: mercury.id, personId: cem.id, role: 'DRI', startDate: '2026-04-15', percentage: 40 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: mercury.id, personId: ben.id, role: 'Engineer', startDate: activeQuarter.startDate, percentage: 40 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: mercury.id, personId: leila.id, role: 'Engineer', startDate: activeQuarter.startDate, percentage: 15 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: mercury.id, personId: priya.id, role: 'EM', startDate: '2026-04-21' }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: mercury.id, personId: kai.id, role: 'PM', startDate: '2026-04-13' }),

    makeAllocation({ quarterId: activeQuarter.id, projectId: atlas.id, personId: quinn.id, role: 'Engineer', startDate: activeQuarter.startDate, endDate: '2026-04-10', percentage: 20 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: atlas.id, personId: ben.id, role: 'DRI', startDate: activeQuarter.startDate, percentage: 50 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: atlas.id, personId: cem.id, role: 'Engineer', startDate: activeQuarter.startDate, percentage: 20 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: atlas.id, personId: leila.id, role: 'Engineer', startDate: activeQuarter.startDate, percentage: 5 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: atlas.id, personId: priya.id, role: 'EM', startDate: activeQuarter.startDate }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: atlas.id, personId: mateo.id, role: 'PM', startDate: activeQuarter.startDate }),

    // Active Data subteam: same roster across Lakehouse and Realtime
    makeAllocation({ quarterId: activeQuarter.id, projectId: lakehouse.id, personId: farah.id, role: 'DRI', startDate: activeQuarter.startDate, percentage: 45 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: lakehouse.id, personId: imani.id, role: 'Engineer', startDate: activeQuarter.startDate, percentage: 20 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: lakehouse.id, personId: jonah.id, role: 'Engineer', startDate: activeQuarter.startDate, percentage: 10 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: lakehouse.id, personId: alice.id, role: 'EM', startDate: activeQuarter.startDate }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: lakehouse.id, personId: kai.id, role: 'PM', startDate: activeQuarter.startDate }),

    makeAllocation({ quarterId: activeQuarter.id, projectId: realtime.id, personId: imani.id, role: 'DRI', startDate: activeQuarter.startDate, percentage: 25 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: realtime.id, personId: farah.id, role: 'Engineer', startDate: activeQuarter.startDate, percentage: 20 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: realtime.id, personId: jonah.id, role: 'Engineer', startDate: activeQuarter.startDate, percentage: 10 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: realtime.id, personId: alice.id, role: 'EM', startDate: activeQuarter.startDate }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: realtime.id, personId: mateo.id, role: 'PM', startDate: activeQuarter.startDate }),

    // Active Frontend subteam: same roster across Mobile and Experimentation Hub
    makeAllocation({ quarterId: activeQuarter.id, projectId: mobile.id, personId: nia.id, role: 'DRI', startDate: activeQuarter.startDate, percentage: 40 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: mobile.id, personId: omar.id, role: 'Engineer', startDate: activeQuarter.startDate, percentage: 25 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: mobile.id, personId: zoya.id, role: 'Engineer', startDate: activeQuarter.startDate, percentage: 10 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: mobile.id, personId: priya.id, role: 'EM', startDate: activeQuarter.startDate }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: mobile.id, personId: mateo.id, role: 'PM', startDate: activeQuarter.startDate }),

    makeAllocation({ quarterId: activeQuarter.id, projectId: experimentation.id, personId: omar.id, role: 'DRI', startDate: activeQuarter.startDate, percentage: 10 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: experimentation.id, personId: nia.id, role: 'Engineer', startDate: activeQuarter.startDate, percentage: 0 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: experimentation.id, personId: zoya.id, role: 'Engineer', startDate: activeQuarter.startDate, percentage: 0 }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: experimentation.id, personId: priya.id, role: 'EM', startDate: activeQuarter.startDate }),
    makeAllocation({ quarterId: activeQuarter.id, projectId: experimentation.id, personId: kai.id, role: 'PM', startDate: activeQuarter.startDate }),
  ];
  await db.allocations.bulkAdd(allocations);
}
