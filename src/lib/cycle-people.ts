import { personTracksCapacity } from './person-capacity';
import type { Person, CyclePerson } from './types';

export interface CyclePeopleLists {
  inCycle: Person[];
  sortedInCycle: Person[];
  notInCycle: Person[];
  filteredNotInCycle: Person[];
  cyclePersonByPersonId: Map<string, CyclePerson>;
}

export function getCyclePeopleLists(
  people: Person[],
  cyclePeople: CyclePerson[],
  search: string,
): CyclePeopleLists {
  const cyclePersonByPersonId = new Map(cyclePeople.map((cyclePerson) => [cyclePerson.personId, cyclePerson]));
  const inCycle = people.filter((person) => cyclePersonByPersonId.has(person.id));
  const notInCycle = people.filter(
    (person) => !cyclePersonByPersonId.has(person.id) && personTracksCapacity(person.role),
  );
  const normalizedSearch = search.trim().toLowerCase();
  const filteredNotInCycle = normalizedSearch
    ? notInCycle.filter((person) => person.name.toLowerCase().includes(normalizedSearch))
    : notInCycle;
  const sortedInCycle = [...inCycle]
    .filter((person) => personTracksCapacity(person.role))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    inCycle,
    sortedInCycle,
    notInCycle,
    filteredNotInCycle,
    cyclePersonByPersonId,
  };
}
