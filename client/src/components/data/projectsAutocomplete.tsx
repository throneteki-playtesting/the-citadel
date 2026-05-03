import { Autocomplete, AutocompleteItem, AutocompleteProps } from "@heroui/react";
import { Filterable, Sort } from "common/types";
import { Key, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useGetProjectsQuery } from "../../api";
import { useFilter } from "../../api/hooks";
import { fuzzyMatch } from "common/utils";
import { IProject } from "common/models/projects";

const ProjectsAutocomplete = ({ filter: initialFilter, orderBy, children = (project) => (<div>{project.name}</div>), isLoading: isForcedLoading = false, selectedKey, onSelectionChange = () => true, ...autocompleteProps }: ProjectsAutocompleteProps) => {
    const filter = useFilter(initialFilter);
    const { data, isLoading } = useGetProjectsQuery({ filter, orderBy });
    const [selected, setSelected] = useState<IProject | undefined>();
    const [input, setInput] = useState<string>("");

    const handleSelect = useCallback((key: Key | null) => {
        const selectedProject = key ? data?.items.find((project) => key === project.number) : undefined;
        setSelected(selectedProject);
        setInput(selectedProject?.name ?? "");
        onSelectionChange(selectedProject);
    }, [data?.items, onSelectionChange]);

    useEffect(() => {
        handleSelect(selectedKey ?? null);
    }, [handleSelect, selectedKey]);

    const items = useMemo(() => {
        const projects = data?.items ?? [];
        if (input.length === 0) {
            return projects;
        }

        return projects.filter((project) => fuzzyMatch(input, project.name, project.code));
    }, [data?.items, input]);

    return (
        <Autocomplete
            aria-label="Card"
            isLoading={isLoading || isForcedLoading}
            items={items}
            onInputChange={setInput}
            selectedKey={selected?.number}
            inputValue={input}
            onSelectionChange={handleSelect}
            {...autocompleteProps}
        >
            {(project) => (
                <AutocompleteItem key={project.number} textValue={project.name}>
                    {children(project)}
                </AutocompleteItem>
            )}
        </Autocomplete>
    );
};

type ProjectsAutocompleteProps = Omit<AutocompleteProps<IProject>, "isLoading" | "children" | "selectedKey" | "onSelectionChange"> & { filter?: Filterable<IProject>, orderBy?: Sort<IProject>, children?: (project: IProject) => ReactNode, isLoading?: boolean, selectedKey?: Key, onSelectionChange?: (project?: IProject) => void };

export default ProjectsAutocomplete;