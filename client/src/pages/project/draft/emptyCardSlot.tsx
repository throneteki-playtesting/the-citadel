import { CardBlank } from "@agot/card-preview";
import { thronesColors } from "common/utils";
import { Button, Tooltip } from "@heroui/react";
import { Code, Faction } from "common/models/cards";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAddressCard, faStarOfLife } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import Permission from "common/models/permissions";
import { memo, useState } from "react";
import RadialMenu from "../../../components/radialMenu";
import PermissionGate from "../../../components/permissionGate";

const EmptyCardSlot = memo(({ code, faction, onNew = () => true, onSuggestion = () => true }: EmptyCardSlotProps) => {
    const [isActive, setIsActive] = useState(false);

    return (
        <div key={code} className="relative">
            <CardBlank
                className={classNames({ "transition-all duration-200 ease-in-out hover:brightness-150": !isActive, "brightness-150": isActive })}
                rounded
                classNames={{ inner:"flex flex-col justify-center items-center border-12 bg-default-100 brightness-50" }}
                styles={{ inner: { borderColor: thronesColors[faction] } }}
                onClick={() => !isActive && setIsActive(true)}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <RadialMenu className="size-16 sm:size-20 md:size-28 lg:size-32" isOpen={isActive} onOpenChange={setIsActive} classNames={{ button: "h-10 w-10" }}>
                    <PermissionGate requires={Permission.CREATE_CARDS}>
                        <Tooltip content="Create new card">
                            <Button
                                isIconOnly
                                radius="full"
                                variant="flat"
                                color="primary"
                                size="sm"
                                className="shadow-sm text-tiny size-8 md:text-small md:size-10 lg:text-medium lg:size-12"
                                onPress={onNew}
                            >
                                <FontAwesomeIcon icon={faStarOfLife}/>
                            </Button>
                        </Tooltip>
                    </PermissionGate>
                    <PermissionGate requires={Permission.READ_SUGGESTIONS}>
                        <Tooltip content="Choose suggestion">
                            <Button
                                isIconOnly
                                radius="full"
                                variant="flat"
                                color="primary"
                                size="sm"
                                className="shadow-sm text-tiny size-8 md:text-small md:size-10 lg:text-medium lg:size-12"
                                onPress={onSuggestion}
                            >
                                <FontAwesomeIcon icon={faAddressCard}/>
                            </Button>
                        </Tooltip>
                    </PermissionGate>
                </RadialMenu>
            </div>
        </div>
    );
});

type EmptyCardSlotProps = { code: Code, faction: Faction, onNew?: () => void, onSuggestion?: () => void }

export default EmptyCardSlot;