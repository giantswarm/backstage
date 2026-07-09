import { Alert, FieldLabel, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import RadioButtonUncheckedIcon from '@material-ui/icons/RadioButtonUnchecked';

import { useNewAgentForm } from '../NewAgentFormProvider';
import { useModelConfigs } from '../ModelConfigsProvider';

const useStyles = makeStyles(theme => ({
  grid: {
    display: 'grid',
    gap: theme.spacing(1.5),
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  },
  // A real full-area button so the whole card is the click target (bui's
  // Card button variant renders a collapsed 1px overlay trigger in this
  // version, which isn't reliably clickable).
  card: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
    padding: theme.spacing(1.5),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.background.paper,
    color: theme.palette.text.primary,
    font: 'inherit',
    '&:hover': {
      borderColor: theme.palette.text.secondary,
    },
    '&:focus-visible': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: 1,
    },
  },
  selected: {
    borderColor: theme.palette.primary.main,
    outline: `1px solid ${theme.palette.primary.main}`,
  },
  code: {
    fontFamily: 'monospace',
  },
  indicator: {
    flexShrink: 0,
  },
  indicatorUnselected: {
    color: theme.palette.text.secondary,
    opacity: 0.5,
  },
  indicatorSelected: {
    color: theme.palette.primary.main,
  },
}));

export function ModelConfigPicker() {
  const classes = useStyles();
  const { state, selectModelConfig } = useNewAgentForm();
  const { isLoading, modelConfigsFor, unreachableInstallations } =
    useModelConfigs();
  const installation = state.installation;

  const label = (
    <FieldLabel
      label="Model"
      secondaryLabel="admin-provisioned"
      description="Pick from the ModelConfigs an admin has provisioned on this installation."
    />
  );

  if (!installation) {
    return (
      <Flex direction="column" gap="2">
        {label}
        <Alert
          status="info"
          title="Select an installation first"
          description="Models are provisioned per installation. Choose one above to load its ModelConfigs."
        />
      </Flex>
    );
  }

  const modelConfigs = modelConfigsFor(installation);
  const hasError = unreachableInstallations.includes(installation);

  return (
    <Flex direction="column" gap="2">
      {label}

      {/* isLoading is fleet-wide, so only treat it as "loading" here while this
          installation has no models yet — otherwise the label lingers next to
          already-loaded models. */}
      {isLoading && modelConfigs.length === 0 && (
        <Text color="secondary">Loading models…</Text>
      )}

      {!isLoading && modelConfigs.length === 0 && hasError && (
        <Alert
          status="warning"
          title="Couldn't read models"
          description={`The kagent resources on ${installation} couldn't be read. It may be unreachable, or you may not have permission to list ModelConfigs there.`}
        />
      )}

      {!isLoading && modelConfigs.length === 0 && !hasError && (
        <Alert
          status="info"
          title="No models found"
          description={`No ModelConfigs are provisioned on ${installation}. A platform admin needs to add one before you can create an agent here.`}
        />
      )}

      {modelConfigs.length > 0 && (
        <div className={classes.grid} role="radiogroup" aria-label="Model">
          {modelConfigs.map(mc => {
            const name = mc.getName();
            const namespace = mc.getNamespace() ?? '';
            const isSelected =
              state.modelConfigName === name &&
              state.modelConfigNamespace === namespace;
            const provider = mc.getProvider();

            return (
              <button
                key={`${namespace}/${name}`}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`Select model ${mc.getDisplayName()}`}
                onClick={() => selectModelConfig(name, namespace)}
                className={`${classes.card} ${
                  isSelected ? classes.selected : ''
                }`}
              >
                <Flex align="start" justify="between" gap="2">
                  <Flex direction="column" gap="1">
                    <Text weight="bold">{mc.getDisplayName()}</Text>
                    <Text variant="body-small" color="secondary">
                      <span className={classes.code}>{mc.getModel()}</span>
                      {provider ? ` · ${provider}` : ''}
                    </Text>
                    <Text variant="body-x-small" color="secondary">
                      ModelConfig{' '}
                      <span className={classes.code}>
                        {namespace}/{name}
                      </span>
                    </Text>
                  </Flex>
                  {isSelected ? (
                    <CheckCircleIcon
                      fontSize="small"
                      aria-hidden
                      className={`${classes.indicator} ${classes.indicatorSelected}`}
                    />
                  ) : (
                    <RadioButtonUncheckedIcon
                      fontSize="small"
                      aria-hidden
                      className={`${classes.indicator} ${classes.indicatorUnselected}`}
                    />
                  )}
                </Flex>
              </button>
            );
          })}
        </div>
      )}
    </Flex>
  );
}
