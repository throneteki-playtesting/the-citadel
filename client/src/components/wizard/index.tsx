/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { Children, cloneElement, FormEvent, ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import { Button, ButtonProps, Form } from "@heroui/react";
import Joi from "joi";
import { DeepPartial } from "common/types";
import { unflatten } from "flat";
import { merge } from "lodash-es";
import { BaseElementProps } from "../../types";
import { useWizard, WizardContext, WizardContextProps } from "./context";

export function Wizard<T>({ schema, data: initial, page: initialPage = 1, onSubmit = () => true, onValidationError = () => true, children }: WizardProps<T>) {
    const [internalData, setInternalData] = useState(initial ?? {} as DeepPartial<T>);
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [totalPages, setTotalPages] = useState(0);

    const isFirstPage = useMemo(() => currentPage <= 1, [currentPage]);
    const isLastPage = useMemo(() => currentPage >= totalPages, [currentPage, totalPages]);

    useEffect(() => {
        setInternalData(initial ?? {} as DeepPartial<T>);
    }, [initial]);

    useEffect(() => {
        setCurrentPage(initialPage);
    }, [initialPage]);

    const setError = useCallback((name: string, errorMessage: string) => setValidationErrors((prev) => {
        const next = { ...prev };
        next[name] = errorMessage;
        return next;
    }), []);

    const validate = useCallback((data: Record<string, any>, partial = false) => {
        const { error } = schema.validate(data, {
            allowUnknown: true,
            abortEarly: false
        });

        if (error) {
            const inputErrors: Record<string, string> = {};
            error.details.forEach((detail) => {
                if (partial) {
                    try {
                        let currentLevel = data;
                        for (const path of detail.path) {
                            if (currentLevel && typeof currentLevel === "object" && path in currentLevel) {
                                currentLevel = currentLevel[path];
                            } else {
                                throw new Error("Path not found!");
                            }
                        }
                    } catch {
                        return;
                    }
                }
                const inputId = detail.path.join(".");
                const message = detail.message.replace(new RegExp(`^"${inputId}"\\s+`), () => "").replace(/^\w/, (c) => c.toUpperCase());
                inputErrors[inputId] = message;
            });

            if (Object.keys(inputErrors).length > 0) {
                console.error("Validation Error Details:", inputErrors);
                setValidationErrors(inputErrors);
                onValidationError(inputErrors, partial);
                return false;
            }
        }

        setValidationErrors({});
        return true;
    }, [onValidationError, schema]);

    const onPageSubmit = useCallback((data: Record<string, any>) => {
        const pageData = data ?? {};

        if (validate(pageData, true)) {
            const submitData = merge({}, internalData, pageData);
            setInternalData(submitData);
            if (isLastPage) {
                if (validate(submitData as Record<string, any>)) {
                    onSubmit(submitData as T);
                }
            } else {
                setCurrentPage((prev) => Math.min(prev + 1, totalPages));
            }
        }
    }, [validate, isLastPage, internalData, onSubmit, totalPages]);

    const onPageBack = useCallback(() => {
        setCurrentPage((prev) => Math.max(prev - 1, 0));
        setValidationErrors({});
    }, [setCurrentPage, setValidationErrors]);

    const contextValue = useMemo<WizardContextProps<T>>(() => ({
        id: crypto?.randomUUID ? crypto.randomUUID() : (Math.floor(Math.random() * 100) + 1).toString(),
        currentPage,
        totalPages,
        setTotalPages,
        data: internalData,
        setData: setInternalData,
        isFirstPage,
        isLastPage,
        validationErrors,
        setError,
        onPageSubmit,
        onPageBack
    }), [
        currentPage,
        totalPages,
        internalData,
        isFirstPage,
        isLastPage,
        validationErrors,
        setError,
        onPageSubmit,
        onPageBack
    ]);

    return (
        <WizardContext.Provider value={contextValue}>
            {children}
        </WizardContext.Provider>
    );
};

type WizardProps<T> = {
    schema: Joi.Schema;
    data?: DeepPartial<T>;
    onSubmit?: (data: T) => void;
    page?: number;
    onValidationError?: (errors: Record<string, string>, partial: boolean) => void;
    children: ReactNode | ReactNode[];
}

export function WizardPages({ className, style, children: pages }: WizardPagesProps) {
    const { currentPage, setTotalPages } = useWizard();

    const containerRef = useRef<HTMLDivElement>(null);
    const activeWrapperRef = useRef<HTMLDivElement>(null);
    const [measuredHeight, setMeasuredHeight] = useState<number>();

    useEffect(() => {
        const pagesArr = Children.toArray(pages);
        setTotalPages(pagesArr.filter((page) => React.isValidElement(page)).length);
    }, [pages, setTotalPages]);

    const pageElements = useMemo(() => {
        let totalPages = 0;
        return Children.map(pages, (page) => {
            if (React.isValidElement(page)) {
                return cloneElement(page, {
                    ...page.props,
                    pageNo: ++totalPages
                });
            }
            return page;
        });
    }, [pages]);

    useLayoutEffect(() => {
        const measure = () => {
            const activePage = activeWrapperRef.current;
            if (activePage) {
                setMeasuredHeight(activePage.offsetHeight);
            } else {
                setMeasuredHeight(undefined);
            }
        };

        measure();

        let observer: ResizeObserver | undefined;
        const activePage = activeWrapperRef.current;
        if (activePage && typeof ResizeObserver !== "undefined") {
            observer = new ResizeObserver(measure);
            observer.observe(activePage);
        }

        return () => {
            if (observer) {
                observer.disconnect();
            }
        };
    }, [currentPage, pageElements]);

    return (
        <div
            ref={containerRef}
            className={classNames("relative w-full overflow-hidden transition-height", className)}
            style={{ ...style, height: measuredHeight ? `${measuredHeight}px` : undefined }}
        >
            <div
                className="flex flex-row items-start transition-transform duration-500 ease-in-out"
                style={{
                    transform: `translateX(-${(currentPage - 1) * 100}%)`
                }}
            >
                {Children.map(pageElements, (page) => {
                    if (!React.isValidElement(page)) {
                        return page;
                    }
                    const props = page.props as WizardPageProps;
                    return (
                        <div
                            key={props.pageNo!}
                            ref={props.pageNo === currentPage ? activeWrapperRef : null}
                            className="flex-shrink-0 w-full"
                        >
                            {page}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

type WizardPageComponent = React.ReactElement<React.ComponentProps<typeof WizardPage>> | false;
type WizardPagesProps = Omit<BaseElementProps, "children"> & {
    children: WizardPageComponent | WizardPageComponent[];
};

export function WizardPage({ className, style, children, controlledData, pageNo }: WizardPageProps) {
    const { id, validationErrors, onPageSubmit } = useWizard();

    const onSubmit = useCallback((e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        // If controlled, simply submit that (ignore form data)
        if (controlledData !== undefined) {
            onPageSubmit(controlledData);
            return;
        }

        // Collect natural (named) inputs via FormData
        const formData = new FormData(e.target as HTMLFormElement);
        const pageData: Record<string, any> = Object.fromEntries(
            // Sanitise empty strings to undefined
            [...formData.entries()].map(([k, v]) => [k, v === "" ? undefined : v])
        );

        if (process.env.NODE_ENV === "development") {
            // Warn if nothing was collected by either path — likely a misconfigured page
            const formDataEmpty = Object.keys(pageData).length === 0;
            if (formDataEmpty) {
                console.warn(`WizardPage ${pageNo}: No FormData collected and no controlledData provided. Check that inputs have name props, or pass controlledData for controlled inputs.`);
            }
        }

        // Unflatten data before sending through (eg. "inner.data": "value" -> "inner" : { "data": "value" })
        onPageSubmit(unflatten(pageData));
    }, [controlledData, onPageSubmit, pageNo]);

    return (
        <Form
            id={`${id}_page_${pageNo ?? 0}`}
            className={classNames("flex-shrink-0 w-full p-1", className)}
            style={style}
            validationErrors={validationErrors}
            onSubmit={onSubmit}
        >
            {children}
        </Form>
    );
};

type WizardPageProps = BaseElementProps & {
    controlledData?: Record<string, any>;
    ignoreFormData?: boolean;
    pageNo?: number;
}

export function WizardNext({ children, nextContent = "Next", submitContent = "Submit", ...buttonProps }: WizardNextButtonProps) {
    const { id, currentPage, isLastPage } = useWizard();

    return (
        <Button type="submit" className="font-sans" form={`${id}_page_${currentPage}`} {...buttonProps}>
            {children || (isLastPage ? submitContent : nextContent)}
        </Button>
    );
};

type WizardNextButtonProps = Omit<ButtonProps, "onPress"> & {
    nextContent?: ReactNode;
    submitContent?: ReactNode;
};

export function WizardBack({ children, backContent = "Back", cancelContent = "Cancel", onCancel, ...buttonProps }: WizardBackButtonProps) {
    const { onPageBack, isFirstPage } = useWizard();

    const onPress = useCallback(() => {
        onPageBack();
        if (isFirstPage && onCancel) {
            onCancel();
        }
    }, [onPageBack, isFirstPage, onCancel]);

    return (
        (!isFirstPage || onCancel) &&
        <Button className="font-sans" onPress={onPress} {...buttonProps}>
            {children || (isFirstPage ? cancelContent : backContent)}
        </Button>
    );
};

type WizardBackButtonProps = Omit<ButtonProps, "onPress"> & {
    backContent?: ReactNode;
    cancelContent?: ReactNode;
    onCancel?: () => void;
};