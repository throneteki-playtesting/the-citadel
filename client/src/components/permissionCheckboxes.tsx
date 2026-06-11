import { Checkbox } from "@heroui/react";
import { permissionGroups } from "../constants";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExclamationCircle } from "@fortawesome/free-solid-svg-icons";

const allPermissionValues = permissionGroups.flatMap((g) => g.permissions.map((p) => p.value));

export default function PermissionCheckboxes({ selectedPermissions, roleGrantedPermissions, onChange }: PermissionCheckboxesProps) {
    const isChecked = (v: string) => selectedPermissions.has(v) || (roleGrantedPermissions?.has(v) ?? false);
    const isDisabled = (v: string) => roleGrantedPermissions?.has(v) ?? false;

    const toggle = (value: string, checked: boolean) => {
        const next = new Set(selectedPermissions);
        if (checked) next.add(value);
        else next.delete(value);
        onChange(next);
    };

    const allChecked = allPermissionValues.every(isChecked);
    const someChecked = !allChecked && allPermissionValues.some(isChecked);

    const toggleAll = (checked: boolean) => {
        onChange(checked ? new Set(allPermissionValues) : new Set());
    };

    const hasRoleGranted = (roleGrantedPermissions?.size ?? 0) > 0;
    const allRoleGranted = hasRoleGranted && allPermissionValues.every(isDisabled);

    return (
        <div className="space-y-2">
            {hasRoleGranted && (
                <div className="text-sm p-2 border border-default rounded-md animate-pulse">
                    <FontAwesomeIcon icon={faExclamationCircle}/> Some permissions are being granted via roles, and cannot be removed here.
                </div>
            )}
            <div>
                <Checkbox
                    size="sm"
                    isSelected={allChecked}
                    isIndeterminate={someChecked}
                    isDisabled={allRoleGranted}
                    onValueChange={toggleAll}
                >
                Select All
                </Checkbox>
            </div>
            {permissionGroups.map((group) => (
                <div key={group.label} className="border border-content2 rounded-md p-2">
                    <div className="text-base font-semibold text-default-600 mb-1">{group.label}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                        {group.permissions.map((perm) => (
                            <Checkbox
                                key={perm.value}
                                size="sm"
                                isSelected={isChecked(perm.value)}
                                isDisabled={isDisabled(perm.value)}
                                onValueChange={(checked) => toggle(perm.value, checked)}
                            >
                                {perm.label}
                            </Checkbox>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};
type PermissionCheckboxesProps = {
    selectedPermissions: Set<string>;
    roleGrantedPermissions?: Set<string>;
    onChange: (permissions: Set<string>) => void;
};