import { useRef, useState } from 'react';
import { Select, Tooltip, TooltipTrigger } from '@backstage/ui';

import { useWorkspacesData } from '../WorkspacesDataProvider';

/** Whether the select's box cuts the selected name short. */
function cutsNameShort(root: HTMLElement | null): boolean {
  const value = root?.querySelector('.bui-SelectValue');
  return Boolean(value && value.scrollWidth > value.clientWidth);
}

/**
 * The Workspaces tab's Organization scope, beside the Environment control:
 * the Organizations the person is a member of. A person in one Organization
 * never sees it; the tab is that Organization's. Must be mounted inside the
 * plugin's `CustomizeDataProvider`.
 *
 * A name longer than a narrow header leaves room for ends in an ellipsis;
 * the whole name is in a tooltip on hover and keyboard focus, and in the
 * open list, which a touch screen shows.
 */
export function WorkspaceOrganizationSelect() {
  const { organizations, organization, setOrganization } = useWorkspacesData();
  // The tooltip opens only where the box cuts the name short, measured as it
  // would open.
  const rootRef = useRef<HTMLDivElement>(null);
  const [showsFullName, setShowsFullName] = useState(false);
  if (organizations.length <= 1 || !organization) {
    return null;
  }
  return (
    <div ref={rootRef} style={{ minWidth: 200 }}>
      <TooltipTrigger
        isOpen={showsFullName}
        onOpenChange={isOpen =>
          setShowsFullName(isOpen && cutsNameShort(rootRef.current))
        }
      >
        <Select
          label="Organization"
          options={organizations.map(name => ({ id: name, label: name }))}
          selectedKey={organization}
          onSelectionChange={key => {
            if (key !== null) {
              setOrganization(String(key));
            }
          }}
        />
        <Tooltip>{organization}</Tooltip>
      </TooltipTrigger>
    </div>
  );
}
