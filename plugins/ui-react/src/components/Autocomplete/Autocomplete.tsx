import { useMemo, ReactNode, useCallback } from 'react';
import { AutocompleteOption } from './AutocompleteOption';

import Box from '@material-ui/core/Box';
import Typography, { TypographyProps } from '@material-ui/core/Typography';
import Paper, { PaperProps } from '@material-ui/core/Paper';
import Popper, { PopperProps } from '@material-ui/core/Popper';
import TextField, { OutlinedTextFieldProps } from '@material-ui/core/TextField';
import Grow from '@material-ui/core/Grow';
import {
  createStyles,
  makeStyles,
  Theme,
  withStyles,
} from '@material-ui/core/styles';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import AutocompleteComponent, {
  AutocompleteProps as AutocompleteComponentProps,
  AutocompleteRenderInputParams,
} from '@material-ui/lab/Autocomplete';
import { merge } from 'lodash';
import classNames from 'classnames';
import { Chip } from '@material-ui/core';

const useStyles = makeStyles(
  theme => ({
    root: {},
    label: {
      position: 'relative',
      fontWeight: 'bold',
      fontSize: theme.typography.body2.fontSize,
      fontFamily: theme.typography.fontFamily,
      color: theme.palette.text.primary,
      '& > span': {
        top: 0,
        left: 0,
        position: 'absolute',
      },
    },
  }),
  { name: 'BackstageAutocomplete' },
);

const BootstrapAutocomplete = withStyles(
  (theme: Theme) =>
    createStyles({
      root: {},
      paper: {
        margin: 0,
      },
      hasClearIcon: {},
      hasPopupIcon: {},
      focused: {},
      inputRoot: {
        marginTop: 24,
        backgroundColor: theme.palette.background.paper,
        '$root$hasClearIcon$hasPopupIcon &': {
          paddingBlock: theme.spacing(0.75),
          paddingInlineStart: theme.spacing(0.75),
        },
        '$root$focused &': {
          outline: 'none',
        },
        '$root &:hover > fieldset': {
          borderColor: '#ced4da',
        },
        '$root$focused & > fieldset': {
          borderWidth: 1,
          borderColor: theme.palette.primary.main,
        },
      },
      popupIndicator: {
        padding: 0,
        margin: 0,
        color: '#616161',
        '&:hover': {
          backgroundColor: 'unset',
        },
        '& [class*="MuiTouchRipple-root"]': {
          display: 'none',
        },
      },
      endAdornment: {
        '$root$hasClearIcon$hasPopupIcon &': {
          right: 4,
        },
      },
      input: {
        '$root$hasClearIcon$hasPopupIcon &': {
          fontSize: theme.typography.body1.fontSize,
          paddingBlock: theme.spacing(0.8125),
        },
      },
    }),
  { name: 'BackstageAutocompleteBase' },
)(AutocompleteComponent) as typeof AutocompleteComponent;

const PopperComponent = (props: PopperProps) => (
  <Popper
    {...props}
    transition
    placement="bottom-start"
    style={{ minWidth: '220px', width: 'fit-content' }}
  >
    {({ TransitionProps }) => (
      <Grow {...TransitionProps} style={{ transformOrigin: '0 0 0' }}>
        <Box>{props.children as ReactNode}</Box>
      </Grow>
    )}
  </Popper>
);

const PaperComponent = (props: PaperProps) => (
  <Paper {...props} elevation={8} />
);

export type CustomAutocompleteProps<
  T,
  Multiple extends boolean | undefined = undefined,
  DisableClearable extends boolean | undefined = undefined,
  FreeSolo extends boolean | undefined = undefined,
> = Omit<
  AutocompleteComponentProps<T, Multiple, DisableClearable, FreeSolo>,
  'PopperComponent' | 'PaperComponent' | 'popupIcon' | 'renderInput'
> & {
  name: string;
  label?: string;
  LabelProps?: TypographyProps<'label'>;
  TextFieldProps?: Omit<OutlinedTextFieldProps, 'variant'>;
  renderInput?: AutocompleteComponentProps<
    T,
    Multiple,
    DisableClearable,
    FreeSolo
  >['renderInput'];
};

export function CustomAutocomplete<
  T,
  Multiple extends boolean | undefined = undefined,
  DisableClearable extends boolean | undefined = undefined,
  FreeSolo extends boolean | undefined = undefined,
>(props: CustomAutocompleteProps<T, Multiple, DisableClearable, FreeSolo>) {
  const { label, name, LabelProps, TextFieldProps, ...rest } = props;
  const classes = useStyles();
  const renderInput = useCallback(
    (params: AutocompleteRenderInputParams) => (
      <TextField {...merge(params, TextFieldProps)} variant="outlined" />
    ),
    [TextFieldProps],
  );
  const autocomplete = (
    <BootstrapAutocomplete
      size="small"
      {...rest}
      renderInput={rest.renderInput ?? renderInput}
      popupIcon={<ExpandMoreIcon data-testid={`${name}-expand`} />}
      PaperComponent={PaperComponent}
      PopperComponent={PopperComponent}
    />
  );

  return (
    <Box className={classes.root}>
      {label ? (
        <Typography
          {...LabelProps}
          className={classNames(classes.label, LabelProps?.className)}
          component="label"
        >
          <Box component="span">{label}</Box>
          {autocomplete}
        </Typography>
      ) : (
        autocomplete
      )}
    </Box>
  );
}

type AutocompleteItem = {
  label: string;
  value: string;
  count?: number;
};

type BaseAutocompleteProps = {
  label: string;
  items: AutocompleteItem[];
  disabledItems?: string[];
  renderLabel?: (option: AutocompleteItem) => ReactNode;
  disabled?: boolean;
};

type SingleAutocompleteProps = BaseAutocompleteProps & {
  multiple?: false;
  selectedValue?: string | null;
  onChange?: (selected: string | null) => void;
};

type MultipleAutocompleteProps = BaseAutocompleteProps & {
  multiple: true;
  selectedValue?: string[];
  onChange?: (selected: string[]) => void;
};

type AutocompleteProps = SingleAutocompleteProps | MultipleAutocompleteProps;

const defaultRenderLabel = (option: AutocompleteItem) => {
  return typeof option.count === 'number'
    ? `${option.label} (${option.count})`
    : option.label;
};

export const Autocomplete = ({
  items,
  label,
  selectedValue,
  disabledItems,
  onChange,
  renderLabel,
  disabled = false,
  multiple,
}: AutocompleteProps) => {
  const value = useMemo(() => {
    if (!selectedValue) {
      return null;
    }

    if (Array.isArray(selectedValue)) {
      return items.filter(item => selectedValue.includes(item.value));
    }

    return items.find(item => item.value === selectedValue);
  }, [items, selectedValue]);

  return (
    <CustomAutocomplete<AutocompleteItem, typeof multiple>
      multiple={multiple}
      disableCloseOnSelect={multiple}
      label={label}
      name={`${label.toLowerCase().replace(/\s/g, '-')}-autocomplete`}
      options={items}
      getOptionLabel={option => option.label}
      getOptionDisabled={option =>
        disabledItems?.includes(option.value) ?? false
      }
      value={value}
      disabled={disabled}
      onChange={(_event, selected) => {
        if (!onChange) {
          return;
        }

        if (multiple) {
          const selectedItems = selected as AutocompleteItem[];
          const newValues = selectedItems.map(
            selectedItem => selectedItem.value,
          );
          onChange(newValues);
        } else {
          const selectedItem = selected as AutocompleteItem | null;
          onChange(selectedItem ? selectedItem.value : null);
        }
      }}
      renderOption={(option, { selected }) => (
        <AutocompleteOption
          selected={selected}
          label={renderLabel ? renderLabel(option) : defaultRenderLabel(option)}
          value={option.value}
          multiple={multiple}
        />
      )}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => (
          <Chip
            label={option.label}
            size="small"
            {...getTagProps({ index })}
            disabled={disabledItems?.includes(option.value) ?? false}
          />
        ))
      }
    />
  );
};
