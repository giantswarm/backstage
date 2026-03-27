/**
 * Custom entity page header that mirrors the upstream EntityHeader
 * from @backstage/plugin-catalog, with the addition of an entity icon
 * rendered from the GS icon URL annotation.
 *
 * This exists because EntityHeaderBlueprint replaces the entire header,
 * so we must reproduce the full upstream behavior. The implementation
 * follows the upstream code at:
 *   @backstage/plugin-catalog/dist/alpha/components/EntityHeader/EntityHeader.esm.js
 *   @backstage/plugin-catalog/dist/alpha/components/EntityLabels/EntityLabels.esm.js
 *   @backstage/plugin-catalog/dist/components/EntityContextMenu/EntityContextMenu.esm.js
 */
import { useState, useCallback, useEffect, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import useAsync from 'react-use/esm/useAsync';
import useCopyToClipboard from 'react-use/esm/useCopyToClipboard';
import { makeStyles } from '@material-ui/core/styles';
import Box from '@material-ui/core/Box';
import IconButton from '@material-ui/core/IconButton';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import MenuItem from '@material-ui/core/MenuItem';
import MenuList from '@material-ui/core/MenuList';
import Popover from '@material-ui/core/Popover';
import Tooltip from '@material-ui/core/Tooltip';
import BugReportIcon from '@material-ui/icons/BugReport';
import FileCopyTwoToneIcon from '@material-ui/icons/FileCopyTwoTone';
import MoreVert from '@material-ui/icons/MoreVert';
import { Header, HeaderLabel, Breadcrumbs } from '@backstage/core-components';
import {
  useRouteRefParams,
  useApi,
  alertApiRef,
} from '@backstage/core-plugin-api';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { DEFAULT_NAMESPACE, RELATION_OWNED_BY } from '@backstage/catalog-model';
import {
  useAsyncEntity,
  entityRouteRef,
  catalogApiRef,
  EntityDisplayName,
  EntityRefLink,
  EntityRefLinks,
  FavoriteEntity,
  InspectEntityDialog,
  getEntityRelations,
} from '@backstage/plugin-catalog-react';
import { catalogTranslationRef } from '@backstage/plugin-catalog/alpha';
import type { Entity } from '@backstage/catalog-model';
import { getIconUrlFromEntity } from '../../utils/entity';
import { injectHeaderIcon, removeHeaderIcon } from '../EntityHeaderIcon';

// ---------------------------------------------------------------------------
// Helpers (mirrored from upstream EntityHeader)
// ---------------------------------------------------------------------------

function headerProps(
  paramKind: string,
  paramNamespace: string,
  paramName: string,
  entity: Entity | undefined,
) {
  const kind = paramKind ?? entity?.kind ?? '';
  const namespace = paramNamespace ?? entity?.metadata.namespace ?? '';
  const name =
    entity?.metadata.title ?? paramName ?? entity?.metadata.name ?? '';
  return {
    headerTitle: `${name}${namespace && namespace !== DEFAULT_NAMESPACE ? ` in ${namespace}` : ''}`,
    headerType: (() => {
      let t = kind.toLocaleLowerCase('en-US');
      if (entity?.spec && 'type' in entity.spec) {
        t += ' \u2014 ';
        t += (entity.spec.type as string).toLocaleLowerCase('en-US');
      }
      return t;
    })(),
  };
}

function findParentRelation(
  entityRelations: Entity['relations'],
  relationTypes: string[],
) {
  for (const type of relationTypes) {
    const found = (entityRelations ?? []).find(r => r.type === type);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const useBreadcrumbStyles = makeStyles(theme => ({
  breadcrumbs: {
    color: theme.page.fontColor,
    fontSize: theme.typography.caption.fontSize,
    textTransform: 'uppercase',
    marginTop: theme.spacing(1),
    opacity: 0.8,
    '& span ': {
      color: theme.page.fontColor,
      textDecoration: 'underline',
      textUnderlineOffset: '3px',
    },
  },
}));

function EntityHeaderTitle() {
  const { entity } = useAsyncEntity();
  const { kind, namespace, name } = useRouteRefParams(entityRouteRef);
  const { headerTitle: title } = headerProps(kind, namespace, name, entity);
  return (
    <Box display="inline-flex" alignItems="center" height="1em" maxWidth="100%">
      <Box
        component="span"
        textOverflow="ellipsis"
        whiteSpace="nowrap"
        overflow="hidden"
      >
        {entity ? <EntityDisplayName entityRef={entity} hideIcon /> : title}
      </Box>
      {entity && <FavoriteEntity entity={entity} />}
    </Box>
  );
}

function EntityHeaderSubtitle(props: { parentEntityRelations?: string[] }) {
  const { parentEntityRelations } = props;
  const classes = useBreadcrumbStyles();
  const { entity } = useAsyncEntity();
  const { name } = useRouteRefParams(entityRouteRef);
  const parentEntity = findParentRelation(
    entity?.relations ?? [],
    parentEntityRelations ?? [],
  );
  const catalogApi = useApi(catalogApiRef);
  const { value: ancestorEntity } = useAsync(async () => {
    if (parentEntity) {
      return findParentRelation(
        (await catalogApi.getEntityByRef(parentEntity.targetRef))?.relations,
        parentEntityRelations ?? [],
      );
    }
    return null;
  }, [parentEntity, catalogApi]);

  if (!parentEntity) return null;

  return (
    <Breadcrumbs separator=">" className={classes.breadcrumbs}>
      {ancestorEntity && (
        <EntityRefLink entityRef={ancestorEntity.targetRef} disableTooltip />
      )}
      <EntityRefLink entityRef={parentEntity.targetRef} disableTooltip />
      {name}
    </Breadcrumbs>
  );
}

function EntityLabels({ entity }: { entity: Entity }) {
  const ownedByRelations = getEntityRelations(entity, RELATION_OWNED_BY);
  const { t } = useTranslationRef(catalogTranslationRef);
  return (
    <Fragment>
      {ownedByRelations.length > 0 && (
        <HeaderLabel
          label={t('entityLabels.ownerLabel')}
          contentTypograpyRootComponent="p"
          value={
            <EntityRefLinks
              entityRefs={ownedByRelations}
              defaultKind="Group"
              color="inherit"
            />
          }
        />
      )}
      {entity.spec?.lifecycle && (
        <HeaderLabel
          label={t('entityLabels.lifecycleLabel')}
          value={entity.spec.lifecycle?.toString()}
        />
      )}
    </Fragment>
  );
}

const useContextMenuStyles = makeStyles(
  theme => ({
    button: { color: theme.page.fontColor },
  }),
  { name: 'PluginCatalogEntityContextMenu' },
);

function EntityContextMenu(props: { onInspectEntity: () => void }) {
  const { onInspectEntity } = props;
  const { t } = useTranslationRef(catalogTranslationRef);
  const [anchorEl, setAnchorEl] = useState<HTMLElement>();
  const classes = useContextMenuStyles();
  const alertApi = useApi(alertApiRef);
  const [copyState, copyToClipboard] = useCopyToClipboard();

  useEffect(() => {
    if (!copyState.error && copyState.value) {
      alertApi.post({
        message: t('entityContextMenu.copiedMessage'),
        severity: 'info',
        display: 'transient',
      });
    }
  }, [copyState, alertApi, t]);

  const onOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const onClose = () => setAnchorEl(undefined);

  return (
    <Fragment>
      <Tooltip title={t('entityContextMenu.moreButtonTitle')} arrow>
        <IconButton
          aria-label={t('entityContextMenu.moreButtonAriaLabel')}
          aria-controls="long-menu"
          aria-haspopup="true"
          aria-expanded={!!anchorEl}
          role="button"
          onClick={onOpen}
          data-testid="menu-button"
          className={classes.button}
          id="long-menu"
        >
          <MoreVert />
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchorEl)}
        onClose={onClose}
        anchorEl={anchorEl}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        aria-labelledby="long-menu"
        PaperProps={{ style: { minWidth: 200 } }}
      >
        <MenuList>
          <MenuItem
            onClick={() => {
              onClose();
              onInspectEntity();
            }}
          >
            <ListItemIcon>
              <BugReportIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={t('entityContextMenu.inspectMenuTitle')} />
          </MenuItem>
          <MenuItem
            onClick={() => {
              onClose();
              copyToClipboard(window.location.toString());
            }}
          >
            <ListItemIcon>
              <FileCopyTwoToneIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={t('entityContextMenu.copyURLMenuTitle')} />
          </MenuItem>
        </MenuList>
      </Popover>
    </Fragment>
  );
}

// ---------------------------------------------------------------------------
// Main header component
// ---------------------------------------------------------------------------

export function CustomEntityHeader() {
  const { entity } = useAsyncEntity();
  const { kind, namespace, name } = useRouteRefParams(entityRouteRef);
  const { headerTitle: entityFallbackText, headerType: type } = headerProps(
    kind,
    namespace,
    name,
    entity,
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedInspectEntityDialogTab = searchParams.get('inspect');
  const setInspectEntityDialogTab = useCallback(
    (newTab: string) => setSearchParams(`inspect=${newTab}`),
    [setSearchParams],
  );
  const openInspectEntityDialog = useCallback(
    () => setSearchParams('inspect'),
    [setSearchParams],
  );
  const closeInspectEntityDialog = useCallback(
    () => setSearchParams(),
    [setSearchParams],
  );
  const inspectDialogOpen = typeof selectedInspectEntityDialogTab === 'string';

  const iconUrl = entity ? getIconUrlFromEntity(entity) : undefined;

  useEffect(() => {
    if (!iconUrl) {
      removeHeaderIcon();
      return undefined;
    }

    injectHeaderIcon(iconUrl);
    const timeoutId = setTimeout(() => injectHeaderIcon(iconUrl), 50);

    return () => {
      clearTimeout(timeoutId);
      removeHeaderIcon();
    };
  }, [iconUrl]);

  return (
    <Header
      pageTitleOverride={entityFallbackText}
      type={type}
      title={<EntityHeaderTitle />}
      subtitle={<EntityHeaderSubtitle />}
    >
      {entity && (
        <Fragment>
          <EntityLabels entity={entity} />
          <EntityContextMenu onInspectEntity={openInspectEntityDialog} />
          <InspectEntityDialog
            entity={entity}
            initialTab={
              (selectedInspectEntityDialogTab as
                | 'overview'
                | 'ancestry'
                | 'colocated'
                | 'json'
                | 'yaml') || undefined
            }
            open={inspectDialogOpen}
            onClose={closeInspectEntityDialog}
            onSelect={setInspectEntityDialogTab}
          />
        </Fragment>
      )}
    </Header>
  );
}
