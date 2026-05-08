import Dexie, { type EntityTable } from 'dexie';
import type {
  Person,
  Subteam,
  Project,
  ProjectLink,
  ProjectStakeholder,
  Quarter,
  QuarterProject,
  QuarterPerson,
  ProjectRole,
  Allocation,
  Unknown,
  Risk,
} from './types';

export class YaplannerDB extends Dexie {
  // Global persistent entities
  people!: EntityTable<Person, 'id'>;
  subteams!: EntityTable<Subteam, 'id'>;
  projects!: EntityTable<Project, 'id'>;
  projectLinks!: EntityTable<ProjectLink, 'id'>;
  projectStakeholders!: EntityTable<ProjectStakeholder, 'id'>;

  // Quarter planning entities
  quarters!: EntityTable<Quarter, 'id'>;
  quarterProjects!: EntityTable<QuarterProject, 'id'>;
  quarterPeople!: EntityTable<QuarterPerson, 'id'>;
  projectRoles!: EntityTable<ProjectRole, 'id'>;
  allocations!: EntityTable<Allocation, 'id'>;
  unknowns!: EntityTable<Unknown, 'id'>;
  risks!: EntityTable<Risk, 'id'>;

  constructor() {
    super('YaplannerDB');
    this.version(1).stores({
      people:              '++id, name, role, subteamId',
      subteams:            '++id, name, driPersonId',
      projects:            '++id, name, status, owningSubteamId',
      projectLinks:        '++id, projectId',
      projectStakeholders: '++id, quarterId, projectId, personId',
      quarters:            '++id, name, status, startDate, endDate',
      quarterProjects:     '++id, quarterId, projectId',
      quarterPeople:       '++id, quarterId, personId',
      projectRoles:        '++id, quarterId, projectId, personId, role',
      allocations:         '++id, quarterId, personId, projectId, weekStart',
      unknowns:            '++id, projectId, quarterId, resolved',
      risks:               '++id, projectId, quarterId, mitigated',
    });
  }
}

export const db = new YaplannerDB();
