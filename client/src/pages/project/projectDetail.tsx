import { useGetProjectQuery } from "../../api";
import { BaseElementProps } from "../../types";
import { addToast, Tab, Tabs } from "@heroui/react";
import { ReactNode, useLayoutEffect, useMemo, useState } from "react";
import { PageActiveContext } from "../../hooks/useIsPageActive";
import EditProjectModal from "./editProjectModal";
import { useNavigate, useNavigationType, useSearchParams } from "react-router-dom";
import DeleteProjectModal from "./deleteProjectModal";
import ProjectHeader from "./projectHeader";
import ProjectPageSkeleton from "./projectPageSkeleton";
import ProjectDevelopment from "./projectDevelopment";
import ProjectDrafting from "./draft/projectDrafting";
import { DraftPoolHostProvider } from "./draft/draftPoolHost";
import ProjectReleases from "./releases/projectReleases";
import ProjectArtworks from "./artworks/projectArtworks";
import ProjectRefinements from "./refinements/projectRefinements";
import classNames from "classnames";
import { dismoji, highlightTarget } from "../../constants";
import Error from "../../components/error";
import usePageTitle from "../../hooks/usePageTitle";
import Permission from "common/models/permissions";
import { usePermission } from "../../hooks/usePermission";
import useConsumableParams from "../../hooks/useConsumableParams";
import { useSearchParamsScope } from "../../hooks/useSearchParamsScope";
import { scrollableTabs, useSelectedTabInView } from "../../hooks/useSelectedTabInView";
import ScopedSearchParamsProvider from "../../components/scopedSearchParamsProvider";
import Watermark from "../../components/watermark";
import Reveal from "../../components/reveal";
import { IProject } from "common/models/projects";

// "tab" is durable, shareable state kept in sync via its own search-param scope, not consumed here
const PROJECT_PARAMS = ["release", "slot"] as const;
type ProjectTab = "development" | "artworks" | "refinements" | "releases";

// A release code implies the releases tab even without one named, so it wins over an absent tab param
function entryProjectTab(tab?: string, release?: string): ProjectTab {
    if (tab === "releases" || release) {
        return "releases";
    }
    return tab === "artworks" || tab === "refinements" ? tab : "development";
}

export default function ProjectDetail({ className, style, project: number }: ProjectDetailProps) {
    const { data: project, isLoading } = useGetProjectQuery({ number });
    usePageTitle(project ? project.code : undefined);
    const [isEditing, setIsEditing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    // A release code implies the releases tab, so a deep link needs the one param
    const { release: entryRelease } = useConsumableParams(PROJECT_PARAMS, ({ release, slot }) => {
        if (release) {
            return { highlight: highlightTarget.release(number, release) };
        }
        const slotNumber = Number(slot);
        return slotNumber ? { highlight: highlightTarget.slot(number, slotNumber) } : null;
    });

    const navigate = useNavigate();

    // The same skeleton the route shows while this page's code arrives, so the two never swap
    if (isLoading) {
        return <ProjectPageSkeleton />;
    }

    if (!project) {
        return (
            <Error
                label="No such project exists in the Citadel's archives..."
                content="This project could not be found. It may have been removed, or you may have followed an incorrect link."
            />
        );
    }

    return (
        <div className={classNames("relative", className)} style={style}>
            <div className="absolute inset-0 overflow-x-clip pointer-events-none">
                <Watermark
                    position="top-right"
                    className={classNames(
                        "transition-opacity duration-500 ease-in",
                        project ? "opacity-100" : "opacity-0"
                    )}
                    icon={
                        project && (
                            <span className="-mt-12 mr-10 text-[10rem] md:-mt-24 md:mr-24 md:text-[16rem] opacity-20">
                                {project.emoji && dismoji[project.emoji]}
                            </span>
                        )
                    }
                />
            </div>
            <DraftPoolHostProvider>
                <div className="relative space-y-2">
                    <Reveal>
                        <ProjectHeader
                            project={project}
                            onEdit={() => setIsEditing(true)}
                            onDelete={() => setIsDeleting(true)}
                        />
                    </Reveal>
                    {project.draft ? (
                        <ScopedSearchParamsProvider>
                            <ProjectDrafting project={project} />
                        </ScopedSearchParamsProvider>
                    ) : (
                        <ScopedSearchParamsProvider>
                            <ProjectTabsSection project={project} entryRelease={entryRelease} />
                        </ScopedSearchParamsProvider>
                    )}
                </div>
            </DraftPoolHostProvider>
            <EditProjectModal
                isOpen={isEditing}
                project={project}
                onClose={() => setIsEditing(false)}
                onSave={(project) =>
                    addToast({
                        title: "Successfully saved",
                        color: "success",
                        description: `${project.name} has been updated`
                    })
                }
            />
            {project && (
                <DeleteProjectModal
                    isOpen={isDeleting}
                    project={project}
                    onClose={() => setIsDeleting(false)}
                    onDelete={(project) => {
                        navigate("/");
                        addToast({
                            title: "Successfully deleted",
                            color: "success",
                            description: `'${project.name} has been deleted`
                        });
                    }}
                />
            )}
        </div>
    );
}

type ProjectDetailProps = Omit<BaseElementProps, "children"> & {
    project: number;
};

// Split out so its tab state can sit inside the ScopedSearchParamsProvider ProjectDetail renders around it
function ProjectTabsSection({ project, entryRelease }: ProjectTabsSectionProps) {
    const [searchParams] = useSearchParams();
    const [tab, setTab] = useState<ProjectTab>(() =>
        entryProjectTab(searchParams.get("tab") ?? undefined, entryRelease)
    );
    // Lets a link to the artworks/releases tab be copy-pasted; development (the default) leaves no trace
    const tabParams = useMemo(() => ({ tab: tab === "development" ? undefined : tab }), [tab]);
    useSearchParamsScope("tab", true, tabParams);
    const tabsRef = useSelectedTabInView(tab);
    // A tab is only built once it has been opened, then kept - every panel used to mount with the page, so opening
    // a project paid for every tab's queries and lists before any of it could respond
    const [openedTabs, setOpenedTabs] = useState(() => new Set([tab]));
    if (!openedTabs.has(tab)) {
        setOpenedTabs(new Set(openedTabs).add(tab));
    }
    const panel = (key: ProjectTab, content: ReactNode) =>
        openedTabs.has(key) && (
            <PageActiveContext.Provider value={tab === key}>
                <Reveal direction={null}>{content}</Reveal>
            </PageActiveContext.Provider>
        );

    // Every opened tab panel stays mounted, so a link to another tab needs this to notice a url change on its
    // own. Ignores our own REPLACE writes (the scope above) to avoid a state <-> url feedback loop.
    const navigationType = useNavigationType();
    useLayoutEffect(() => {
        if (navigationType === "REPLACE") {
            return;
        }
        const urlTab = searchParams.get("tab");
        if (
            urlTab !== tab &&
            (urlTab === "development" || urlTab === "artworks" || urlTab === "refinements" || urlTab === "releases")
        ) {
            setTab(urlTab);
        }
    }, [searchParams, navigationType, tab]);

    const canViewReleases = usePermission(Permission.READ_RELEASES);
    const canViewArtworks = usePermission(Permission.READ_ARTWORKS);
    const canViewRefinements = usePermission(Permission.READ_REFINEMENT);

    if (!(canViewReleases || canViewArtworks || canViewRefinements)) {
        return <ProjectDevelopment project={project} isActive />;
    }

    return (
        <div ref={tabsRef}>
            <Tabs
                classNames={scrollableTabs}
                selectedKey={tab}
                onSelectionChange={(key) => setTab(key as ProjectTab)}
                aria-label="Project Sections"
                variant="underlined"
                color="primary"
                size="lg"
                destroyInactiveTabPanel={false}
            >
                <Tab key="development" title="Development">
                    {panel("development", <ProjectDevelopment project={project} isActive={tab === "development"} />)}
                </Tab>
                {canViewArtworks ? (
                    <Tab key="artworks" title="Artworks">
                        {panel("artworks", <ProjectArtworks project={project} isActive={tab === "artworks"} />)}
                    </Tab>
                ) : null}
                {canViewRefinements ? (
                    <Tab key="refinements" title="Refinements">
                        {panel(
                            "refinements",
                            <ProjectRefinements project={project} isActive={tab === "refinements"} />
                        )}
                    </Tab>
                ) : null}
                {canViewReleases ? (
                    <Tab key="releases" title="Releases">
                        {panel("releases", <ProjectReleases project={project} isActive={tab === "releases"} />)}
                    </Tab>
                ) : null}
            </Tabs>
        </div>
    );
}
type ProjectTabsSectionProps = {
    project: IProject;
    entryRelease?: string;
};
