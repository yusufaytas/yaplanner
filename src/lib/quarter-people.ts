import { personTracksCapacity } from './person-capacity';
import type { Person, QuarterPerson } from './types';

export interface QuarterPeopleLists {
  inQuarter: Person[];
  sortedInQuarter: Person[];
  notInQuarter: Person[];
  filteredNotInQuarter: Person[];
  quarterPersonByPersonId: Map<string, QuarterPerson>;
}

export function getQuarterPeopleLists(
  people: Person[],
  quarterPeople: QuarterPerson[],
  search: string,
): QuarterPeopleLists {
  const quarterPersonByPersonId = new Map(quarterPeople.map((quarterPerson) => [quarterPerson.personId, quarterPerson]));
  const inQuarter = people.filter((person) => quarterPersonByPersonId.has(person.id));
  const notInQuarter = people.filter(
    (person) => !quarterPersonByPersonId.has(person.id) && personTracksCapacity(person.role),
  );
  const normalizedSearch = search.trim().toLowerCase();
  const filteredNotInQuarter = normalizedSearch
    ? notInQuarter.filter((person) => person.name.toLowerCase().includes(normalizedSearch))
    : notInQuarter;
  const sortedInQuarter = [...inQuarter]
    .filter((person) => personTracksCapacity(person.role))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    inQuarter,
    sortedInQuarter,
    notInQuarter,
    filteredNotInQuarter,
    quarterPersonByPersonId,
  };
}
