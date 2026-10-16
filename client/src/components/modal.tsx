import { Modal as HeroModal, type ModalProps } from "@heroui/react";
import classNames from "classnames";
import { modalInsideBaseClasses } from "../constants";

// Centred, and scrolling inside its body so the header and close button stay put however long it runs
export default function Modal({
    placement = "center",
    scrollBehavior = "inside",
    classNames: slots,
    ...props
}: ModalProps) {
    return (
        <HeroModal
            placement={placement}
            scrollBehavior={scrollBehavior}
            classNames={{
                ...slots,
                base: classNames({ [modalInsideBaseClasses]: scrollBehavior === "inside" }, slots?.base)
            }}
            {...props}
        />
    );
}
