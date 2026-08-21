/* eslint-disable @typescript-eslint/no-explicit-any */
import React, {
    Children,
    cloneElement,
    FormEvent,
    HTMLAttributes,
    ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";
import classNames from "classnames";
import { Badge, Button, ButtonProps, Form } from "@heroui/react";
import Joi from "joi";
import { DeepPartial } from "common/types";
import { flatten, unflatten } from "flat";
import { isEqual, merge } from "lodash-es";
import { BaseElementProps } from "../../types";
import SlidingPages from "../slidingPages";
import { showApiErrorToast, toNormalizedError } from "../../api/errors";
import {
    countErrorsInDirection,
    titleizeFieldName,
    useWizard,
    WizardContext,
    WizardContextProps,
    WizardFieldError,
    WizardFieldMeta
} from "./context";

export { default as ValidationSummary } from "./components/validationSummary";

export function Wizard<T>({
    schema,
    data: initial,
    page: initialPage = 1,
    onSubmit = () => undefined,
    onValidationError = () => true,
    children
}: WizardProps<T>) {
    const [internalData, setInternalData] = useState(initial ?? ({} as DeepPartial<T>));
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [fieldErrors, setFieldErrors] = useState<Record<string, WizardFieldError>>({});
    const [totalPages, setTotalPages] = useState(0);
    const [fieldMeta, setFieldMeta] = useState<Record<string, WizardFieldMeta>>({});

    const validationErrors = useMemo(
        () => Object.fromEntries(Object.entries(fieldErrors).map(([path, error]) => [path, error.message])),
        [fieldErrors]
    );

    const isFirstPage = useMemo(() => currentPage <= 1, [currentPage]);
    const isLastPage = useMemo(() => currentPage >= totalPages, [currentPage, totalPages]);

    useEffect(() => {
        setInternalData(initial ?? ({} as DeepPartial<T>));
    }, [initial]);

    useEffect(() => {
        setCurrentPage(initialPage);
    }, [initialPage]);

    const setError = useCallback((path: string, message: string) => {
        setFieldErrors((prev) => ({ ...prev, [path]: { message, source: "external" } }));
    }, []);

    const clearError = useCallback((path: string) => {
        setFieldErrors((prev) => {
            if (prev[path]?.source !== "external") {
                return prev;
            }
            const next = { ...prev };
            delete next[path];
            return next;
        });
    }, []);

    const setServerErrors = useCallback((fields: { path: string; message: string }[]) => {
        setFieldErrors((prev) => {
            const next = { ...prev };
            fields.forEach(({ path, message }) => {
                next[path] = { message, source: "server" };
            });
            return next;
        });
    }, []);

    const isValidationError = useCallback(
        (err: unknown): boolean => {
            const normalized = toNormalizedError(err);
            if (normalized.kind === "validation" && normalized.fields) {
                setServerErrors(normalized.fields);
                return true;
            }
            return false;
        },
        [setServerErrors]
    );

    const validate = useCallback(
        (data: Record<string, any>, partial = false) => {
            const { error } = schema.validate(data, {
                allowUnknown: true,
                abortEarly: false,
                errors: { label: false }
            });

            const inputErrors: Record<string, string> = {};
            if (error) {
                error.details.forEach((detail) => {
                    if (partial && !(detail.path[0] in data)) {
                        return;
                    }
                    const inputId = detail.path.join(".");
                    const message = detail.message.replace(/^\w/, (c) => c.toUpperCase());
                    inputErrors[inputId] = message;
                });
            }

            const touchedPaths = Object.keys(flatten(data as object));
            setFieldErrors((prev) => {
                const next = { ...prev };
                touchedPaths.forEach((path) => {
                    if (next[path]?.source !== "external") {
                        delete next[path];
                    }
                });
                Object.entries(inputErrors).forEach(([path, message]) => {
                    next[path] = { message, source: "schema" };
                });
                return next;
            });

            if (Object.keys(inputErrors).length > 0) {
                console.error("Validation Error Details:", inputErrors);
                onValidationError(inputErrors, partial);
                return false;
            }
            return true;
        },
        [onValidationError, schema]
    );

    const onPageSubmit = useCallback(
        async (data: Record<string, any>) => {
            const pageData = data ?? {};

            if (validate(pageData, true)) {
                const submitData = merge({}, internalData, pageData);
                setInternalData(submitData);
                if (isLastPage) {
                    if (validate(submitData as Record<string, any>)) {
                        try {
                            await onSubmit(submitData as T, isValidationError);
                        } catch (err) {
                            if (!isValidationError(err)) {
                                showApiErrorToast(err);
                            }
                        }
                    }
                } else {
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
                }
            }
        },
        [validate, isLastPage, internalData, onSubmit, totalPages, isValidationError]
    );

    const onPageBack = useCallback(() => {
        setCurrentPage((prev) => Math.max(prev - 1, 0));
    }, [setCurrentPage]);

    const contextValue = useMemo<WizardContextProps<T>>(
        () => ({
            id: crypto?.randomUUID ? crypto.randomUUID() : (Math.floor(Math.random() * 100) + 1).toString(),
            currentPage,
            totalPages,
            setTotalPages,
            data: internalData,
            setData: setInternalData,
            isFirstPage,
            isLastPage,
            validationErrors,
            fieldErrors,
            setError,
            clearError,
            isValidationError,
            fieldMeta,
            setFieldMeta,
            onPageSubmit,
            onPageBack
        }),
        [
            currentPage,
            totalPages,
            internalData,
            isFirstPage,
            isLastPage,
            validationErrors,
            fieldErrors,
            setError,
            clearError,
            isValidationError,
            fieldMeta,
            onPageSubmit,
            onPageBack
        ]
    );

    return <WizardContext.Provider value={contextValue}>{children}</WizardContext.Provider>;
}

type WizardProps<T> = {
    schema: Joi.Schema;
    data?: DeepPartial<T>;
    onSubmit?: (data: T, isValidationError: (err: unknown) => boolean) => void | Promise<void>;
    page?: number;
    onValidationError?: (errors: Record<string, string>, partial: boolean) => void;
    children: ReactNode | ReactNode[];
};

function resolveFieldLabel(el: Element, name: string): string {
    return (
        el.getAttribute("aria-label") ||
        el.getAttribute("data-label") ||
        el.getAttribute("placeholder") ||
        titleizeFieldName(name)
    );
}

export function WizardPages({ className, style, children: pages }: WizardPagesProps) {
    const { currentPage, totalPages, setTotalPages, setFieldMeta } = useWizard();

    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const pagesArr = Children.toArray(pages);
        setTotalPages(pagesArr.filter((page) => React.isValidElement(page)).length);
    }, [pages, setTotalPages]);

    // Keeps watching the DOM rather than scanning once - pages can render inputs asynchronously
    // (eg. CardEditor resolves field visibility via effects after mount), which a single scan would miss.
    useEffect(() => {
        if (!totalPages || !containerRef.current) {
            return;
        }
        const container = containerRef.current;

        const scan = () => {
            const meta: Record<string, WizardFieldMeta> = {};
            container.querySelectorAll("[data-wizard-page]").forEach((pageEl) => {
                const onPage = Number(pageEl.getAttribute("data-wizard-page"));
                pageEl.querySelectorAll("[name]").forEach((el) => {
                    const name = el.getAttribute("name");
                    if (name && !(name in meta)) {
                        meta[name] = { onPage, label: resolveFieldLabel(el, name) };
                    }
                });
            });

            // Preserve the old reference on an unchanged scan, or a re-render here can retrigger the observer.
            setFieldMeta((prev) => (isEqual(prev, meta) ? prev : meta));
        };

        scan();

        // A rich text editor rewrites its own DOM on every keystroke, and none of that can add or rename a
        // field. Rescanning the whole page for each character is what made typing inside a wizard stutter
        const isEditorContent = (node: Node) => {
            const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
            return !!element?.closest("[contenteditable='true']");
        };

        const observer = new MutationObserver((records) => {
            if (records.every((record) => isEditorContent(record.target))) {
                return;
            }
            scan();
        });
        observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["name"] });

        return () => observer.disconnect();
    }, [totalPages, setFieldMeta]);

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

    // The sliding itself is generic; only the page marker the field scan reads above is wizard-specific
    return (
        <SlidingPages
            ref={containerRef}
            currentPage={currentPage}
            className={className}
            style={style}
            pageProps={(pageNo) => ({ "data-wizard-page": pageNo }) as HTMLAttributes<HTMLDivElement>}
        >
            {pageElements}
        </SlidingPages>
    );
}

type WizardPageComponent = React.ReactElement<React.ComponentProps<typeof WizardPage>> | false;
type WizardPagesProps = Omit<BaseElementProps, "children"> & {
    children: WizardPageComponent | WizardPageComponent[];
};

export function WizardPage({ className, style, children, controlledData, pageNo }: WizardPageProps) {
    const { id, validationErrors, onPageSubmit } = useWizard();

    const onSubmit = useCallback(
        (e: FormEvent<HTMLFormElement>) => {
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

            if (import.meta.env.DEV) {
                // Warn if nothing was collected by either path — likely a misconfigured page
                const formDataEmpty = Object.keys(pageData).length === 0;
                if (formDataEmpty) {
                    console.warn(
                        `WizardPage ${pageNo}: No FormData collected and no controlledData provided. Check that inputs have name props, or pass controlledData for controlled inputs.`
                    );
                }
            }

            // Unflatten data before sending through (eg. "inner.data": "value" -> "inner" : { "data": "value" })
            onPageSubmit(unflatten(pageData));
        },
        [controlledData, onPageSubmit, pageNo]
    );

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
}

type WizardPageProps = BaseElementProps & {
    controlledData?: Record<string, any>;
    ignoreFormData?: boolean;
    pageNo?: number;
};

export function WizardNext({
    children,
    nextContent = "Next",
    submitContent = "Submit",
    ...buttonProps
}: WizardNextButtonProps) {
    const { id, currentPage, isLastPage, fieldErrors, fieldMeta } = useWizard();

    const errorCount = useMemo(
        () => countErrorsInDirection(fieldErrors, fieldMeta, currentPage, "next"),
        [fieldErrors, fieldMeta, currentPage]
    );

    const button = (
        <Button type="submit" className="font-sans" form={`${id}_page_${currentPage}`} {...buttonProps}>
            {children || (isLastPage ? submitContent : nextContent)}
        </Button>
    );

    return errorCount > 0 ? (
        <Badge color="danger" content={errorCount} size="lg" placement="top-right">
            {button}
        </Badge>
    ) : (
        button
    );
}

type WizardNextButtonProps = Omit<ButtonProps, "onPress"> & {
    nextContent?: ReactNode;
    submitContent?: ReactNode;
};

export function WizardBack({
    children,
    backContent = "Back",
    cancelContent = "Cancel",
    onCancel,
    ...buttonProps
}: WizardBackButtonProps) {
    const { onPageBack, isFirstPage, currentPage, fieldErrors, fieldMeta } = useWizard();

    const onPress = useCallback(() => {
        onPageBack();
        if (isFirstPage && onCancel) {
            onCancel();
        }
    }, [onPageBack, isFirstPage, onCancel]);

    const errorCount = useMemo(
        () => countErrorsInDirection(fieldErrors, fieldMeta, currentPage, "back"),
        [fieldErrors, fieldMeta, currentPage]
    );

    if (isFirstPage && !onCancel) {
        return null;
    }

    const button = (
        <Button className="font-sans" onPress={onPress} {...buttonProps}>
            {children || (isFirstPage ? cancelContent : backContent)}
        </Button>
    );

    return errorCount > 0 ? (
        <Badge color="danger" content={errorCount} size="lg" placement="top-left">
            {button}
        </Badge>
    ) : (
        button
    );
}

type WizardBackButtonProps = Omit<ButtonProps, "onPress"> & {
    backContent?: ReactNode;
    cancelContent?: ReactNode;
    onCancel?: () => void;
};
