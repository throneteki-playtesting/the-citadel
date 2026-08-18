import { Button, Chip, ChipProps, Select, SelectItem } from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BaseElementProps } from "../types";
import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";

const ComboBox = ({
    name,
    className,
    style,
    classNames: classGroups,
    label,
    placeholder,
    chip,
    values: initialValues,
    onChange = () => true,
    isDisabled,
    addKeys = ["Enter"],
    allowDuplicates = false
}: ComboBoxProps) => {
    const [values, setValues] = useState<string[]>(initialValues ?? []);
    const [inputValue, setInputValue] = useState("");
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => setValues(initialValues ?? []), [initialValues]);

    const addItem = useCallback(
        (item: string) => {
            const value = item.trim();
            if (value) {
                setInputValue("");
                if (allowDuplicates || !values.includes(value)) {
                    const newValues = [...values, value];
                    setValues(newValues);
                    onChange(newValues);
                }
                inputRef.current?.focus();
            }
        },
        [allowDuplicates, onChange, values]
    );

    const removeItem = useCallback(
        (index: number) => {
            const newValues = values.filter((_, i) => i !== index);
            setValues(newValues);
            if (onChange) {
                onChange(newValues);
            }
        },
        [onChange, values]
    );

    const onKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            // Fixing a bug with adding space within renderValue input
            if (e.key === " " && inputValue.trim() !== "") {
                e.preventDefault();
                setInputValue((prev) => prev + " ");
            } else if (addKeys.includes(e.key) && inputValue.trim() !== "") {
                e.preventDefault();
                addItem(inputValue);
            } else if (e.key === "Backspace" && inputValue === "" && values.length > 0) {
                e.preventDefault();
                removeItem(values.length - 1);
            } else if (e.key === "Tab" && inputValue.trim() !== "") {
                // Commit pending text before tabbing away without stealing focus back
                const value = inputValue.trim();
                setInputValue("");
                if (allowDuplicates || !values.includes(value)) {
                    const newValues = [...values, value];
                    setValues(newValues);
                    onChange(newValues);
                }
            }
        },
        [addItem, addKeys, allowDuplicates, inputValue, onChange, removeItem, values]
    );

    const renderInput = useCallback(() => {
        return (
            <div className="flex flex-wrap items-center gap-1 w-full cursor-text">
                {values.length > 0 &&
                    values.map((item, index) => (
                        <Chip key={index} onClose={() => removeItem(index)} className={classGroups?.chip} {...chip}>
                            {item}
                        </Chip>
                    ))}
                <input
                    aria-label="Combobox Input"
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={values.length === 0 ? placeholder : undefined}
                    className={classNames(
                        "flex-1 min-w-[80px] bg-transparent outline-none text-foreground mx-1",
                        classGroups?.input
                    )}
                />
            </div>
        );
    }, [chip, classGroups?.chip, classGroups?.input, inputValue, onKeyDown, placeholder, removeItem, values]);

    // Since select will not renderValue when there are 0 items,
    // one must be faked to ensure the inner input renders (and ignore it)
    const renderedItems = useMemo(() => {
        if (values.length === 0) {
            return ["No Items"];
        }
        return values;
    }, [values]);

    return (
        <>
            <Select
                name={name}
                label={label}
                aria-label="Combobox"
                selectionMode="multiple"
                isMultiline
                selectedKeys="all"
                isOpen={false}
                selectorIcon={<div />}
                disallowEmptySelection={false}
                renderValue={renderInput}
                className={classGroups?.wrapper ?? className}
                classNames={{
                    trigger: "pr-1",
                    selectorIcon: "hidden",
                    endContent: "mb-0",
                    innerWrapper: "w-full my-auto"
                }}
                style={style}
                isDisabled={isDisabled}
                tabIndex={-1}
                onClick={() => inputRef.current?.focus()}
                endContent={
                    <Button as="div" isIconOnly variant="ghost" tabIndex={-1} onPress={() => addItem(inputValue)}>
                        <FontAwesomeIcon icon={faPlus} />
                    </Button>
                }
            >
                {renderedItems.map((item) => (
                    <SelectItem key={item} textValue={item}>
                        {item}
                    </SelectItem>
                ))}
            </Select>
        </>
    );
};

type ComboBoxProps = Omit<BaseElementProps, "children"> & {
    name?: string;
    label?: React.ReactNode;
    placeholder?: string;
    chip?: ChipProps;
    values?: string[];
    onChange?: (items: string[]) => void;
    classNames?: { wrapper?: string; input?: string; chip?: string };
    isDisabled?: boolean;
    addKeys?: string[];
    allowDuplicates?: boolean;
};

export default ComboBox;
