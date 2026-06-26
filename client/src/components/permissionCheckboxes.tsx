import { Checkbox } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExclamationCircle } from "@fortawesome/free-solid-svg-icons";
import { permissionMeta, permissionGroups } from "common/models/permissions";
import { TouchTooltip } from "./touchTooltip";

function PermissionTooltipList({ label, items }: { label: string; items: string[] }) {
    return (
        <div className="text-xs">
            <div className="font-semibold mb-0.5">{label}</div>
            <ul className="space-y-0.5">
                {items.map(item => <li key={item}>• {item}</li>)}
            </ul>
        </div>
    );
}

const allPermissionValues = permissionGroups.flatMap((g) => g.permissions.map((p) => p.value));

const permissionFullLabel = new Map<string, string>(
    Object.entries(permissionMeta).map(([value, { label, group }]) => [value, `${group} > ${label}`])
);

// Map from permission -> all permissions that declare it as a dependency
const reverseDependencyMap = new Map<string, string[]>();
for (const [permission, { dependencies }] of Object.entries(permissionMeta)) {
    if (!dependencies) continue;
    const normalized = Array.isArray(dependencies) ? dependencies : [dependencies];
    for (const dep of normalized) {
        if (!reverseDependencyMap.has(dep)) reverseDependencyMap.set(dep, []);
        reverseDependencyMap.get(dep)!.push(permission);
    }
}

export default function PermissionCheckboxes({ selectedPermissions, roleGrantedPermissions, onChange }: PermissionCheckboxesProps) {
    const isChecked = (v: string) => selectedPermissions.has(v) || (roleGrantedPermissions?.has(v) ?? false);
    const isRoleDisabled = (v: string) => roleGrantedPermissions?.has(v) ?? false;

    // Permissions that are checked and depend on `value` — prevents unchecking
    const getBlockingDependents = (value: string): string[] => {
        const dependents = reverseDependencyMap.get(value) ?? [];
        return dependents.filter(dep => isChecked(dep) && !isRoleDisabled(dep));
    };

    // Dependencies of `value` that are not yet checked — prevents checking
    const getMissingDependencies = (value: string): string[] => {
        const deps = permissionMeta[value as keyof typeof permissionMeta]?.dependencies;
        if (!deps) return [];
        const normalized = Array.isArray(deps) ? deps : [deps];
        return normalized.filter(dep => !isChecked(dep));
    };

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
    const allRoleGranted = hasRoleGranted && allPermissionValues.every(isRoleDisabled);

    const renderCheckbox = (perm: { value: string; label: string }) => {
        const roleDisabled = isRoleDisabled(perm.value);
        const checked = isChecked(perm.value);
        const blocking = (!roleDisabled && checked) ? getBlockingDependents(perm.value) : [];
        const missing = (!roleDisabled && !checked) ? getMissingDependencies(perm.value) : [];

        const checkbox = (
            <Checkbox
                size="sm"
                isSelected={checked}
                isDisabled={roleDisabled || blocking.length > 0 || missing.length > 0}
                onValueChange={(v) => toggle(perm.value, v)}
            >
                {perm.label}
            </Checkbox>
        );

        if (blocking.length > 0) {
            return (
                <TouchTooltip
                    key={perm.value}
                    color="danger"
                    placement="top"
                    content={<PermissionTooltipList label="Required by" items={blocking.map(d => permissionFullLabel.get(d) ?? d)} />}
                >
                    <div className="inline-flex">{checkbox}</div>
                </TouchTooltip>
            );
        }

        if (missing.length > 0) {
            return (
                <TouchTooltip
                    key={perm.value}
                    placement="top"
                    content={<PermissionTooltipList label="Requires" items={missing.map(d => permissionFullLabel.get(d) ?? d)} />}
                >
                    <div className="inline-flex">{checkbox}</div>
                </TouchTooltip>
            );
        }

        return <span key={perm.value}>{checkbox}</span>;
    };

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
                        {group.permissions.map((perm) => renderCheckbox(perm))}
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
