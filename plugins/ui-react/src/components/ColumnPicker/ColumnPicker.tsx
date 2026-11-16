import {
  ButtonIcon,
  Checkbox,
  CheckboxGroup,
  DialogTrigger,
  Popover,
} from '@backstage/ui';
import ViewColumnIcon from '@material-ui/icons/ViewColumn';

/** One column a list can show or hide. */
export type ColumnPickerOption = {
  id: string;
  label: string;
  /** Always shown, listed checked and not changeable: the row's name. */
  isFixed?: boolean;
};

export type ColumnPickerProps = {
  options: readonly ColumnPickerOption[];
  /** The ids of the columns shown, fixed ones included or not. */
  visible: readonly string[];
  onChange: (visible: string[]) => void;
};

/**
 * The column picker at the end of a list's filter bar: an icon button that
 * opens the list's columns as checkboxes, each checked while it shows. A
 * fixed column (the name) is listed checked and cannot be hidden. Escape
 * closes it and keeps the choice. What is picked is the list's to keep,
 * usually per person in the browser (`useTableColumns`).
 *
 * A checkbox group in a popover, not a selectable menu list: react-aria's
 * list box clears its selection on Escape, which hid every chosen column.
 */
export function ColumnPicker({
  options,
  visible,
  onChange,
}: ColumnPickerProps) {
  const fixed = options.filter(option => option.isFixed).map(o => o.id);
  const checked = options
    .map(option => option.id)
    .filter(id => fixed.includes(id) || visible.includes(id));
  return (
    <DialogTrigger>
      <ButtonIcon
        icon={<ViewColumnIcon />}
        aria-label="Columns"
        variant="secondary"
        size="small"
      />
      <Popover placement="bottom end">
        <div style={{ minWidth: 200, maxHeight: 420, overflowY: 'auto' }}>
          <CheckboxGroup
            label="Columns"
            value={checked}
            onChange={values =>
              onChange(values.filter(id => !fixed.includes(id)))
            }
          >
            {options.map(option => (
              <Checkbox
                key={option.id}
                value={option.id}
                isDisabled={option.isFixed}
              >
                {option.label}
              </Checkbox>
            ))}
          </CheckboxGroup>
        </div>
      </Popover>
    </DialogTrigger>
  );
}
