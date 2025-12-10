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
  const inputNode = renderInput({} as any);
  const inputProps = isValidElement(inputNode) ? inputNode.props || {} : {};
  const { label, placeholder, helperText, error, fullWidth } = inputProps as any;

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
      minHeight: '44px',
      borderColor: state.isFocused ? '#2563eb' : '#e2e8f0',
      backgroundColor: '#fff',
      borderRadius: '12px',
      boxShadow: state.isFocused ? '0 0 0 3px rgba(37, 99, 235, 0.12)' : 'none',
      '&:hover': {
        borderColor: state.isFocused ? '#2563eb' : '#cbd5e1',
      },
    }),
    valueContainer: (provided) => ({
      ...provided,
      padding: '2px 8px',
      gap: '6px',
      color: '#0f172a',
      fontSize: '14px',
    }),
    input: (provided) => ({
      ...provided,
      color: '#0f172a',
    }),
    placeholder: (provided) => ({
      ...provided,
      color: '#94a3b8',
      fontSize: '14px',
    }),
    multiValue: (provided) => ({
      ...provided,
      backgroundColor: '#e0ebff',
      borderRadius: '8px',
      padding: '2px 4px',
    }),
    multiValueLabel: (provided) => ({
      ...provided,
      color: '#1d4ed8',
      fontSize: '13px',
      fontWeight: 600,
    }),
    multiValueRemove: (provided) => ({
      ...provided,
      color: '#1d4ed8',
      borderRadius: '6px',
      '&:hover': {
        backgroundColor: '#bfdbfe',
        color: '#1e40af',
      },
    }),
    indicatorsContainer: (provided) => ({
      ...provided,
      paddingRight: '8px',
      color: '#64748b',
    }),
    dropdownIndicator: (provided, state) => ({
      ...provided,
      color: state.isFocused ? '#2563eb' : '#94a3b8',
      padding: '6px',
      '&:hover': {
        color: '#2563eb',
      },
    }),
    clearIndicator: (provided) => ({
      ...provided,
      color: '#94a3b8',
      padding: '6px',
      '&:hover': {
        color: '#dc2626',
      },
    }),
    menu: (provided) => ({
      ...provided,
      zIndex: 20,
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      boxShadow: '0 10px 30px rgba(15, 23, 42, 0.16)',
      overflow: 'hidden',
      marginTop: '8px',
    }),
    option: (provided, state) => ({
      ...provided,
      backgroundColor: state.isSelected
        ? '#2563eb'
        : state.isFocused
          ? '#e0ebff'
          : '#fff',
      color: state.isSelected ? '#fff' : '#0f172a',
      paddingTop: '10px',
      paddingBottom: '10px',
      fontSize: '14px',
      fontWeight: state.isSelected ? 700 : 500,
      '&:active': {
        backgroundColor: '#1d4ed8',
        color: '#fff',
      },
    }),
  };

  return (
    <div className={cx(styles.formControl, fullWidth && styles.fullWidth, error && styles.error)}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <ReactSelect
        id={id}
        isMulti={multiple}
        options={selectOptions}
        value={selectValue}
        onChange={handleChange}
        closeMenuOnSelect={!disableCloseOnSelect}
        styles={customStyles}
        placeholder={placeholder || 'Выберите...'}
        noOptionsMessage={() => 'Нет доступных вариантов'}
        {...rest}
      />
      {helperText ? (
        <span className={cx(styles.helperText, error && styles.errorText)}>{helperText}</span>
      ) : null}
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
