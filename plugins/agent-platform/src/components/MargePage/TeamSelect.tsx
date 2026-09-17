import { useEffect, useMemo, useState } from 'react';
import { Flex, Select, TextField } from '@backstage/ui';

export type TeamSelectProps = {
  /** The team the page shows. */
  team: string;
  /** The teams the catalogue offers, the person's own first. */
  teams: string[];
  isLoading?: boolean;
  onChange: (team: string) => void;
};

/**
 * The team selector: the catalogue's teams in a dropdown, and a field for any
 * other name. The two are one control with two ways in, because the
 * catalogue is not the authority on what marge sweeps -- marge's team files
 * are -- and a team the catalogue does not list must still be reachable. A
 * name that is in neither place is offered as it is, and the queue says what
 * marge makes of it.
 */
export function TeamSelect({
  team,
  teams,
  isLoading,
  onChange,
}: TeamSelectProps) {
  const options = useMemo(() => {
    const names = teams.includes(team) || !team ? teams : [team, ...teams];
    return names.map(name => ({ id: name, label: name }));
  }, [teams, team]);

  const [draft, setDraft] = useState('');
  useEffect(() => {
    setDraft('');
  }, [team]);

  const submit = () => {
    const next = draft.trim();
    if (next && next !== team) {
      onChange(next);
    }
  };

  return (
    <Flex gap="3" align="end" style={{ flexWrap: 'wrap' }}>
      <Select
        aria-label="Team"
        label="Team"
        size="small"
        options={options}
        selectedKey={team || null}
        isDisabled={isLoading && options.length === 0}
        onSelectionChange={key => {
          if (key !== null && String(key) !== team) {
            onChange(String(key));
          }
        }}
        style={{ width: 260, flex: 'none' }}
      />
      <TextField
        aria-label="Any team"
        label="Any team"
        size="small"
        placeholder="Type a team and press Enter"
        value={draft}
        onChange={setDraft}
        onBlur={submit}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        }}
        style={{ width: 300, flex: 'none' }}
      />
    </Flex>
  );
}
