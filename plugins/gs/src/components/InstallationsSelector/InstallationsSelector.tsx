import React from 'react';
import {
  Checkbox,
  FormControl,
  Input,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  Typography,
  makeStyles,
} from '@material-ui/core';
import classnames from 'classnames';
import { InstallationStatus } from '../hooks';

const useStyles = makeStyles(theme => ({
  formControl: {
    margin: theme.spacing(1),
    minWidth: 300,
    maxWidth: 600,
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
  },
  chip: {
    margin: 2,
  },
  noLabel: {
    marginTop: theme.spacing(3),
  },
  '@keyframes pulsateSlightly': {
    '0%': { opacity: '0.6' },
    '100%': { opacity: '0.8' },
  },
  isLoading: {
    opacity: 0.6,
    animation: '1s ease-in-out 0s infinite alternate $pulsateSlightly',
  },
  isError: {
    opacity: 0.6,
  },
}));

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
  PaperProps: {
    style: {
      maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
      width: 250,
    },
  },
};

type MultipleSelectCheckmarksProps = {
  items: string[];
  selectedItems: string[];
  renderValue: (value: unknown) => React.ReactNode;
  onChange: (selectedItems: string[]) => void;
};

const MultipleSelectCheckmarks = ({
  items,
  selectedItems,
  renderValue,
  onChange,
}: MultipleSelectCheckmarksProps) => {
  const classes = useStyles();
  const [localSelectedItems, setLocalSelectedItems] =
    React.useState<string[]>(selectedItems);

  const handleChange = (
    event: React.ChangeEvent<{ name?: string; value: unknown }>,
  ) => {
    setLocalSelectedItems(event.target.value as string[]);
  };

  const handleClose = () => {
    if (onChange) {
      onChange(localSelectedItems);
    }
  };

  return (
    <FormControl className={classes.formControl}>
      <InputLabel id="demo-mutiple-checkbox-label">Installations</InputLabel>
      <Select
        labelId="demo-mutiple-checkbox-label"
        id="demo-mutiple-checkbox"
        multiple
        value={localSelectedItems}
        onChange={handleChange}
        onClose={handleClose}
        input={<Input />}
        renderValue={renderValue}
        MenuProps={MenuProps}
      >
        {items.map(item => (
          <MenuItem key={item} value={item}>
            <Checkbox checked={localSelectedItems.indexOf(item) > -1} />
            <ListItemText primary={item} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

type InstallationPreviewProps = {
  installationName: string;
  installationsStatuses?: InstallationStatus[];
  isLastItem?: boolean;
};

const InstallationPreview = ({
  installationName,
  installationsStatuses,
  isLastItem,
}: InstallationPreviewProps) => {
  const classes = useStyles();

  const installationStatus = installationsStatuses?.find(
    status => status.installationName === installationName,
  );

  return (
    <Typography
      component="span"
      className={classnames({
        [classes.isLoading]: installationStatus?.isLoading,
        [classes.isError]: installationStatus?.isError,
      })}
    >
      {installationName}
      {isLastItem ? null : ', '}
    </Typography>
  );
};

type InstallationsSelectorProps = {
  installations: string[];
  selectedInstallations: string[];
  installationsStatuses: InstallationStatus[];
  onChange?: (selectedInstallations: string[]) => void;
};

export const InstallationsSelector = ({
  installations,
  selectedInstallations,
  installationsStatuses,
  onChange,
}: InstallationsSelectorProps) => {
  const handleChange = (selectedItems: string[]) => {
    if (
      onChange &&
      JSON.stringify(selectedItems.sort()) !==
        JSON.stringify(selectedInstallations.sort())
    ) {
      onChange(selectedItems);
    }
  };

  return (
    <MultipleSelectCheckmarks
      items={installations}
      selectedItems={selectedInstallations}
      renderValue={() =>
        selectedInstallations.map((item, idx) => (
          <InstallationPreview
            key={item}
            installationName={item}
            installationsStatuses={installationsStatuses}
            isLastItem={idx === selectedInstallations.length - 1}
          />
        ))
      }
      onChange={handleChange}
    />
  );
};
