import { Children, cloneElement, forwardRef, isValidElement } from 'react';
import ReactSelect, { components, MultiValue, SingleValue, StylesConfig } from 'react-select';
import styles from '../styles/mui-stubs.module.css';

type ClassValue = string | false | null | undefined;
const cx = (...values: ClassValue[]) => values.filter(Boolean).join(' ');

type CommonControlProps = {
  fullWidth?: boolean;
  helperText?: string;
  error?: boolean;
};

type FormControlProps = React.HTMLAttributes<HTMLDivElement> & CommonControlProps;
export const FormControl: React.FC<FormControlProps> = ({ fullWidth, className, children, ...rest }) => (
  <div className={cx(styles.formControl, fullWidth && styles.fullWidth, className)} {...rest}>
    {children}
  </div>
);

interface InputLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}
export const InputLabel: React.FC<InputLabelProps> = ({ className, children, ...rest }) => (
  <label className={cx(styles.label, className)} {...rest}>
    {children}
  </label>
);

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement>, CommonControlProps {}
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ fullWidth, className, helperText, error, children, ...rest }, ref) => (
    <div className={cx(styles.formControl, fullWidth && styles.fullWidth, error && styles.error)}>
      <select ref={ref} className={cx(styles.select, className)} {...rest}>
        {children}
      </select>
      {helperText ? (
        <span className={cx(styles.helperText, error && styles.errorText)}>{helperText}</span>
      ) : null}
    </div>
  ),
);

Select.displayName = 'Select';

interface MenuItemProps extends React.OptionHTMLAttributes<HTMLOptionElement> {}
export const MenuItem: React.FC<MenuItemProps> = ({ children, ...rest }) => <option {...rest}>{children}</option>;

interface TextFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    CommonControlProps {
  label?: string;
  size?: 'small' | 'medium';
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, fullWidth, helperText, error, className, type = 'text', size, ...rest }, ref) => (
    <label className={cx(styles.formControl, fullWidth && styles.fullWidth, error && styles.error, className)}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <input ref={ref} className={styles.textInput} type={type} {...rest} />
      {helperText ? (
        <span className={cx(styles.helperText, error && styles.errorText)}>{helperText}</span>
      ) : null}
    </label>
  ),
);
TextField.displayName = 'TextField';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {}
export const Checkbox: React.FC<CheckboxProps> = ({ className, ...rest }) => (
  <input type="checkbox" className={cx(styles.checkboxInput, className)} {...rest} />
);

interface FormControlLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  control: React.ReactElement;
  label: React.ReactNode;
}

export const FormControlLabel: React.FC<FormControlLabelProps> = ({ control, label, className, ...rest }) => (
  <label className={cx(styles.checkboxRow, className)} {...rest}>
    {control}
    <span className={styles.inlineLabel}>{label}</span>
  </label>
);

interface ToggleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  value: any;
}

export const ToggleButton: React.FC<ToggleButtonProps> = ({ selected, className, children, ...rest }) => (
  <button type="button" className={cx(styles.toggleButton, selected && 'selected', className)} {...rest}>
    {children}
  </button>
);

type ToggleButtonGroupProps<T> = {
  value: T[];
  onChange?: (event: React.MouseEvent<HTMLElement>, value: T[]) => void;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'>;

export const ToggleButtonGroup = <T,>({ value, onChange, children, className, ...rest }: ToggleButtonGroupProps<T>) => (
  <div className={cx(styles.toggleGroup, className)} {...rest}>
    {Children.map(children, (child) => {
      if (!isValidElement(child)) return child;
      const childValue = child.props.value as T;
      const selected = value.some((v) => v === childValue);
      const handleClick = (event: React.MouseEvent<HTMLElement>) => {
        const hasValue = value.some((v) => v === childValue);
        const nextValue = hasValue ? value.filter((v) => v !== childValue) : [...value, childValue];
        onChange?.(event, nextValue);
        if (typeof child.props.onClick === 'function') {
          child.props.onClick(event);
        }
      };
      return cloneElement(child, { selected, onClick: handleClick });
    })}
  </div>
);

interface TypographyProps extends React.HTMLAttributes<HTMLParagraphElement> {
  variant?: 'body2' | 'caption';
}

export const Typography: React.FC<TypographyProps> = ({ variant = 'body2', className, children, ...rest }) => (
  <p className={cx(variant === 'caption' ? styles.caption : styles.inlineLabel, className)} {...rest}>
    {children}
  </p>
);

interface BoxProps extends React.HTMLAttributes<HTMLDivElement> {}
export const Box: React.FC<BoxProps> = ({ className, children, ...rest }) => (
  <div className={cx(styles.stack, className)} {...rest}>
    {children}
  </div>
);

interface AutocompleteProps<T> {
  multiple?: boolean;
  id?: string;
  options: T[];
  getOptionLabel: (option: T) => string;
  value: T | T[] | null;
  onChange: (event: React.SyntheticEvent, value: T | T[] | null) => void;
  renderInput: (params: any) => React.ReactNode;
  disableCloseOnSelect?: boolean;
}

export const Autocomplete = <T,>({
  multiple,
  options,
  getOptionLabel,
  value,
  onChange,
  renderInput,
  disableCloseOnSelect,
  id,
  ...rest
}: AutocompleteProps<T>) => {
  const selectOptions = options.map((option, index) => ({
    value: index,
    label: getOptionLabel(option),
    data: option,
  }));

  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];
  const selectValue = multiple
    ? selectOptions.filter((opt) => selectedValues.includes(opt.data))
    : selectOptions.find((opt) => opt.data === value) || null;

  const handleChange = (
    newValue: MultiValue<{ value: number; label: string; data: T }> | SingleValue<{ value: number; label: string; data: T }>
  ) => {
    if (multiple && Array.isArray(newValue)) {
      const values = newValue.map((item) => item.data);
      onChange({} as any, values);
    } else if (!multiple && newValue && 'data' in newValue) {
      onChange({} as any, newValue.data);
    } else {
      onChange({} as any, null);
    }
  };

  const customStyles: StylesConfig<{ value: number; label: string; data: T }, boolean> = {
    control: (provided, state) => ({
      ...provided,
      minHeight: '40px',
      borderColor: state.isFocused ? '#2563eb' : '#d1d5db',
      boxShadow: state.isFocused ? '0 0 0 3px rgba(37, 99, 235, 0.1)' : 'none',
      '&:hover': {
        borderColor: '#2563eb',
      },
    }),
    multiValue: (provided) => ({
      ...provided,
      backgroundColor: '#e0e7ff',
      borderRadius: '4px',
    }),
    multiValueLabel: (provided) => ({
      ...provided,
      color: '#3730a3',
      fontSize: '14px',
    }),
    multiValueRemove: (provided) => ({
      ...provided,
      color: '#6366f1',
      '&:hover': {
        backgroundColor: '#c7d2fe',
        color: '#4338ca',
      },
    }),
    menu: (provided) => ({
      ...provided,
      zIndex: 9999,
    }),
    option: (provided, state) => ({
      ...provided,
      backgroundColor: state.isSelected
        ? '#4f46e5'
        : state.isFocused
          ? '#e0e7ff'
          : 'white',
      color: state.isSelected ? 'white' : '#1f2937',
      '&:active': {
        backgroundColor: '#6366f1',
      },
    }),
  };

  return (
    <div className={styles.formControl}>
      <ReactSelect
        id={id}
        isMulti={multiple}
        options={selectOptions}
        value={selectValue}
        onChange={handleChange}
        closeMenuOnSelect={!disableCloseOnSelect}
        styles={customStyles}
        placeholder="Выберите..."
        noOptionsMessage={() => 'Нет доступных вариантов'}
        {...rest}
      />
    </div>
  );
};

export default {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Checkbox,
  FormControlLabel,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Box,
  Autocomplete,
};
