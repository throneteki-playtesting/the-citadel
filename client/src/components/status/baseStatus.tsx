import { Button, Alert, Spinner } from "@heroui/react";
import classNames from "classnames";
import { ReactNode } from "react";
import { BaseElementProps, UIColor } from "../../types";
import { TouchTooltip } from "../touchTooltip";

export function BaseStatus({ isLoading = false, data, isIconOnly = false, className, style }: BaseStatusProps) {
    const interactiveClass = "font-sans hover:brightness-125 transition duration-300 ease-in-out";

    if (!data) {
        return null;
    }

    if (isIconOnly) {
        return (
            <TouchTooltip content={
                <div className="flex flex-col">
                    <div className="font-bold">{data.title}</div>
                    <div>{data.description}</div>
                </div>
            }>
                <Button
                    isLoading={isLoading}
                    isIconOnly
                    color={data.color}
                    style={style}
                    onPress={data.onPress}
                    as={data.href ? "a" : undefined}
                    href={data.href}
                    target={data.href ? "_blank" : undefined}
                    rel={data.href ? "noreferrer" : undefined}
                    disableAnimation={!data.onPress && !data.href}
                    className={classNames({ [interactiveClass]: !!(data.onPress || data.href) }, className)}
                >
                    {data.icon}
                </Button>
            </TouchTooltip>
        );
    }

    const alert = (
        <Alert
            icon={isLoading ? <Spinner /> : data.icon}
            color={data.color}
            title={data.title}
            className="h-full opacity-75"
            hideIconWrapper
            description={isLoading ? "Loading..." : data.description}
        />
    );

    if (data.onPress) {
        return (
            <a className={classNames("cursor-pointer", interactiveClass, className)} style={style} onClick={data.onPress}>
                {alert}
            </a>
        );
    }

    if (data.href) {
        return (
            <a className={classNames(interactiveClass, className)} style={style} href={data.href} target="_blank" rel="noreferrer">
                {alert}
            </a>
        );
    }

    return <div className={className} style={style}>{alert}</div>;
}

type BaseStatusProps = Omit<BaseElementProps, "children"> & {
    isLoading?: boolean;
    data?: StatusData | null;
    isIconOnly?: boolean;
};

export type StatusData = {
  icon?: ReactNode;
  title?: string;
  description?: string;
  color: UIColor;
  onPress?: () => void;
  href?: string;
};