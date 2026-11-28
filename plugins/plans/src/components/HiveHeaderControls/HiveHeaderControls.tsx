import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Flex, SearchField, Select } from '@backstage/ui';
import {
  useHiveSearch,
  useHiveTeam,
  useShowHiveTeamInUrl,
} from '../../hooks/useHive';
import { ALL_TEAMS, HIVE_TEAMS, teamName } from '../../lib/hive';

const TEAM_OPTIONS = [
  ...HIVE_TEAMS.map(team => ({ id: team, label: `Team ${teamName(team)}` })),
  { id: ALL_TEAMS, label: 'All teams' },
];

/**
 * Hive's section-wide controls in the page header: the team every tab is
 * scoped to and the search every tab filters by. A header action of the
 * Hive page (`PluginHeaderActionBlueprint`), so they stay put while the
 * tabs change underneath.
 */
export function HiveHeaderControls() {
  const [team, setTeam, isResolved] = useHiveTeam();
  const showTeamInUrl = useShowHiveTeamInUrl();
  const [query, setQuery] = useHiveSearch();
  const [searchParams] = useSearchParams();

  // A tab opened from the header's tab row carries no `?team=`: write the
  // shown team back, once the reader's own team is known, so the tab (the
  // roadmap's board and the Reviews tab too) reads the scope from the URL
  // and a copied link carries it. Shown, not picked: nothing is saved.
  const urlHasTeam = searchParams.has('team');
  useEffect(() => {
    if (!urlHasTeam && isResolved) {
      showTeamInUrl(team);
    }
  }, [urlHasTeam, isResolved, team, showTeamInUrl]);

  return (
    <Flex align="center" gap="2">
      <SearchField
        aria-label="Search epics, plans and documents"
        placeholder="Search Hive"
        size="small"
        value={query}
        onChange={setQuery}
      />
      <div style={{ minWidth: 200 }}>
        <Select
          aria-label="Team"
          size="small"
          options={TEAM_OPTIONS}
          selectedKey={team}
          onSelectionChange={key => key && setTeam(String(key))}
        />
      </div>
    </Flex>
  );
}
