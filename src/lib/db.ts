import Dexie, { type EntityTable } from 'dexie';
import type {
  Allocation,
  Person,
  Project,
  Quarter,
  QuarterPerson,
  QuarterProject,
  Subteam,
} from './types';

export class YaplannerDB extends Dexie {
  people!: EntityTable<Person, 'id'>;
  subteams!: EntityTable<Subteam, 'id'>;
  projects!: EntityTable<Project, 'id'>;
  quarters!: EntityTable<Quarter, 'id'>;
  quarterProjects!: EntityTable<QuarterProject, 'id'>;
  quarterPeople!: EntityTable<QuarterPerson, 'id'>;
  allocations!: EntityTable<Allocation, 'id'>;

  constructor() {
    super('YaplannerDB');

    this.version(1).stores({
      people: '++id, name, role, subteamId',
      subteams: '++id, name',
      projects: '++id, name, status, subteamId',
      quarters: '++id, name, status, startDate, endDate',
      quarterProjects: '++id, quarterId, projectId',
      quarterPeople: '++id, quarterId, personId',
      allocations: '++id, quarterId, personId, projectId, role, startDate, endDate',
    });
  }
}

export const db = new YaplannerDB();
