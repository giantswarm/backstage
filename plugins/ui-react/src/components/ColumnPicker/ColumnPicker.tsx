import {
  ButtonIcon,
  MenuListBox,
  MenuListBoxItem,
  MenuTrigger,
  type Selection,
} from '@backstage/ui';
import ViewColumnIcon from '@material-ui/icons/ViewColumn';
import { MENU_WIDTH } from '../../utils/menuWidth';

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
 * opens the list's columns, each checked while it shows. A fixed column (the
 * name) is listed checked and cannot be hidden. What is picked is the list's
 * to keep, usually per person in the browser (`useTableColumns`).
 */
export function ColumnPicker({
  options,
  visible,
  onChange,
}: ColumnPickerProps) {
  const fixed = options.filter(option => option.isFixed).map(o => o.id);
  const selected = new Set([...fixed, ...visible]);
  return (
    <MenuTrigger>
      <ButtonIcon
        icon={<ViewColumnIcon />}
        aria-label="Columns"
        variant="secondary"
        size="small"
      />
      <MenuListBox
        aria-label="Columns"
        selectionMode="multiple"
        selectedKeys={selected}
        disabledKeys={fixed}
        maxWidth={MENU_WIDTH}
        onSelectionChange={(keys: Selection) => {
          const picked =
            keys === 'all'
              ? options.map(option => option.id)
              : [...keys].map(String);
          onChange(picked.filter(id => !fixed.includes(id)));
        }}
      >
        {options.map(option => (
          <MenuListBoxItem key={option.id} id={option.id}>
            {option.label}
          </MenuListBoxItem>
        ))}
      </MenuListBox>
    </MenuTrigger>
  );
}
