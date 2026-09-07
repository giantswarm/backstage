import { Badge } from '@backstage/ui';
import { useInstallations } from '@giantswarm/backstage-plugin-gs';

export type InstallationChipProps = {
  installation: string;
};

/**
 * The installation a detail page's resource lives on, as a chip in the page
 * header: the name, with the installation's pipeline in the tooltip when the
 * configuration knows it. Every detail route already carries the installation
 * in its path; the chip says it where a person reads, so an "SRE Agent" on one
 * installation is never mistaken for its namesake on another.
 */
export function InstallationChip({ installation }: InstallationChipProps) {
  const { installations } = useInstallations();
  const pipeline = installations.find(
    candidate => candidate.name === installation,
  )?.pipeline;

  return (
    <Badge
      size="small"
      data-testid="installation-chip"
      title={
        pipeline
          ? `Installation ${installation} (${pipeline})`
          : `Installation ${installation}`
      }
    >
      {installation}
    </Badge>
  );
}
