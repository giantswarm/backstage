import { useState } from 'react';
import {
  catalogApiRef,
  EntityRefLink,
  useEntity,
} from '@backstage/plugin-catalog-react';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import { InfoCard, Progress } from '@backstage/core-components';
import useAsync from 'react-use/esm/useAsync';
import { Link as RouterLink } from 'react-router-dom';
import { entityKratixResourcesRouteRef } from '../../../routes';
import {
  IconButton,
  Typography,
  Link,
  makeStyles,
  Theme,
} from '@material-ui/core';
import CachedIcon from '@material-ui/icons/Cached';
import { Entity, getEntitySourceLocation } from '@backstage/catalog-model';

const useStyles = makeStyles((theme: Theme) => ({
  paragraphWithMargin: {
    marginTop: theme.spacing(1),
  },
}));

export function EntityKratixStatusCard() {
  const classes = useStyles();

  const { entity } = useEntity();
  const entitySourceLocation = getEntitySourceLocation(entity);

  const catalogApi = useApi(catalogApiRef);
  const targetEntityRef = {
    kind: 'component',
    namespace: 'default',
    name: entity.metadata.name,
  };

  const [targetEntity, setTargetEntity] = useState<Entity | undefined>();
  const [stale, setStale] = useState(true);
  const { loading } = useAsync(async () => {
    if (stale) {
      const result = await catalogApi.getEntityByRef(targetEntityRef);
      setStale(false);
      setTargetEntity(result);
    }
  }, [stale]);

  const kratixResourcesRoute = useRouteRef(entityKratixResourcesRouteRef);

  const handleRefreshClick = () => {
    setStale(true);
  };

  if (loading) {
    return (
      <InfoCard title="Creation progress">
        <Progress />
      </InfoCard>
    );
  }

  return (
    <InfoCard
      title="Creation progress"
      action={
        <>
          {!targetEntity && (
            <IconButton
              aria-label="Refresh"
              title="Refresh"
              onClick={handleRefreshClick}
            >
              <CachedIcon />
            </IconButton>
          )}
        </>
      }
    >
      {targetEntity ? (
        <>
          <Typography variant="body2">
            The{' '}
            <Link
              href={entitySourceLocation.target}
              target="_blank"
              rel="noopener noreferrer"
            >
              pull request
            </Link>{' '}
            defining these resources has been merged.
          </Typography>
          <Typography variant="body2" className={classes.paragraphWithMargin}>
            See resource creation details in the{' '}
            <Link component={RouterLink} to={kratixResourcesRoute()}>
              Kratix resources
            </Link>{' '}
            tab.
          </Typography>
          <Typography variant="body2" className={classes.paragraphWithMargin}>
            View the{' '}
            <EntityRefLink entityRef={targetEntity}>
              entity page for {targetEntity.metadata.name}
            </EntityRefLink>{' '}
            to see more details about the component and its deployments.
          </Typography>
        </>
      ) : (
        <>
          <Typography variant="body2">
            For resources to be created,{' '}
            <Link
              href={entitySourceLocation.target}
              target="_blank"
              rel="noopener noreferrer"
            >
              this pull request
            </Link>{' '}
            must be merged. After merging, it can take several minutes for
            resource creation to start.
          </Typography>
          <Typography variant="body2" className={classes.paragraphWithMargin}>
            Once resources get created, you can track creation progress in the{' '}
            <Link component={RouterLink} to={kratixResourcesRoute()}>
              Kratix resources
            </Link>{' '}
            tab.
          </Typography>
        </>
      )}
    </InfoCard>
  );
}
