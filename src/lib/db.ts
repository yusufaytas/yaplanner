import Dexie, { type EntityTable } from 'dexie';
import type {
  Allocation,
  Person,
  Project,
  Cycle,
  CyclePerson,
  CycleProject,
  Subteam,
} from './types';

export const DB_SCHEMA = {
  people: 'id, name, role, subteamId',
  subteams: 'id, name',
  projects: 'id, name, status, subteamId',
  cycles: 'id, name, status, startDate, endDate',
  cycleProjects: 'id, &[cycleId+projectId], cycleId, projectId',
  cyclePeople: 'id, &[cycleId+personId], cycleId, personId',
  allocations: 'id, &[cycleId+personId+projectId+role+startDate+endDate], cycleId, personId, projectId, role, startDate, endDate',
} as const;

export class YaplannerDB extends Dexie {
  people!: EntityTable<Person, 'id'>;
  subteams!: EntityTable<Subteam, 'id'>;
  projects!: EntityTable<Project, 'id'>;
  cycles!: EntityTable<Cycle, 'id'>;
  cycleProjects!: EntityTable<CycleProject, 'id'>;
  cyclePeople!: EntityTable<CyclePerson, 'id'>;
  allocations!: EntityTable<Allocation, 'id'>;

  constructor() {
    super('YaplannerDB');

    this.version(1).stores(DB_SCHEMA);
  }
}

export const db = new YaplannerDB();
