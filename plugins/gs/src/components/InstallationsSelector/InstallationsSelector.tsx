import React from 'react';
import {
  Box,
  Checkbox,
  FormControl,
  Input,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  makeStyles,
} from "@material-ui/core";
import { configApiRef, useApi } from '@backstage/core-plugin-api';

const useStyles = makeStyles((theme) => ({
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
  onChange: (selectedItems: string[]) => void;
}

const MultipleSelectCheckmarks = ({ items, onChange }: MultipleSelectCheckmarksProps) => {
  const classes = useStyles();
  const [selectedItems, setSelectedItems] = React.useState<string[]>([]);

  const handleChange = (event: React.ChangeEvent<{name?: string, value: unknown}>) => {
    setSelectedItems(event.target.value as string[]);
  };

  const handleClose = () => {
    if (onChange) {
      onChange(selectedItems);
    }
  }

  return (
    <div>
      <FormControl className={classes.formControl}>
        <InputLabel id="demo-mutiple-checkbox-label">Installations</InputLabel>
        <Select
          labelId="demo-mutiple-checkbox-label"
          id="demo-mutiple-checkbox"
          multiple
          value={selectedItems}
          onChange={handleChange}
          onClose={handleClose}
          input={<Input />}
          renderValue={(selected) => (selected as string[]).join(', ')}
          MenuProps={MenuProps}
        >
          {items.map((item) => (
            <MenuItem key={item} value={item}>
              <Checkbox checked={selectedItems.indexOf(item) > -1} />
              <ListItemText primary={item} />
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </div>
  );
}

type InstallationsSelectorProps = {
  onChange: (selectedInstallations: string[]) => void;
}

export const InstallationsSelector = ({ onChange }: InstallationsSelectorProps) => {
  const configApi = useApi(configApiRef);
  const installationsConfig = configApi.getConfig('gs.installations');
  const installationsNames = installationsConfig?.keys() || [];

  const handleChange = (selectedItems: string[]) => {
    onChange(selectedItems);
  };

  return (
    <Box>
      <MultipleSelectCheckmarks items={installationsNames} onChange={handleChange} />
    </Box>
  );
};
