import { IPack } from "common/models/pack";
import { IProject } from "common/models/projects";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import dismoji from "../../emojis";
import { Chip, Progress } from "@heroui/react";
import { useGetProjectsQuery } from "../../api";

export const ProjectsSummary = () => {
    const { data, isLoading } = useGetProjectsQuery({ filter: [{ active: true }] });

    return (
        <div className="flex flex-col gap-2">
            {data?.items.map((project) => <ProjectCard key={project.number} project={project} />)}
        </div>
    );
};

function ProjectCard({ project }: ProjectCardProps) {
    const navigate = useNavigate();
    const progress = deriveProgress(project);

    return (
        <div
            onClick={() => navigate(`/project/${project.number}`)}
            className="bg-content1 border border-content3 cursor-pointer hover:border-content4 transition-colors"
        >
            <ProjectHeader project={project} progress={progress} />
            <ProjectStats project={project} />
        </div>
    );
}
type ProjectCardProps = {
  project: IProject;
};

function ProjectHeader({ project, progress }: { project: IProject; progress: number }) {
    return (
        <div className="relative overflow-hidden">
            <div className="absolute left-0 flex items-center justify-center pointer-events-none select-none">
                <span className="ml-16 text-9xl opacity-20">{project.emoji && dismoji[project.emoji]}</span>
            </div>
            <div className="flex flex-col sm:flex-row px-6 py-5 border-b border-content3 bg-content2">
                <div className="flex-1">
                    <div className="text-xxs tracking-widest uppercase text-foreground/40">
                        #{project.number} · <span className="uppercase">{project.type}</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-semibold text-foreground">{project.name}</h2>
                    <p className="text-sm italic text-foreground/50 mt-1">{project.description}</p>
                </div>
                <div className="flex items-center sm:flex-col sm:items-end gap-3 pt-1 min-w-64">
                    <StatusChip project={project} />
                    <Progress color="primary" label="Progress" value={progress} maxValue={100} size="sm" formatOptions={{ style: "percent" }} showValueLabel />
                </div>
            </div>
        </div>
    );
}

function ProjectStats({ project }: { project: IProject }) {
    // TODO: Implement packs as individual data entries, either as part of project or separate
    return (
        <div className="grid grid-cols-4 divide-x divide-content3">
            <StatColumn label="Reviews this cycle" value={67} sub={`from ${12} playtesters`} />
            <StatColumn label="Changes · 7 days" value={5} sub={`last: ${"The Red Viper"}`} />
            <StatColumn label="Active decks" value={24} sub={"Test123"} />
            <PackStrip packs={[]} />
        </div>
    );
}

function StatColumn({ label, value, sub }: { label: string; value: number; sub: string }) {
    return (
        <div className="px-6 py-4">
            <p className="font-display text-[7.5px] tracking-[2.5px] uppercase text-foreground/40 mb-2">
                {label}
            </p>
            <p className="text-3xl font-light text-foreground leading-none">{value}</p>
            <p className="text-xs italic text-foreground/40 mt-1.5">{sub}</p>
        </div>
    );
}

function StatusChip({ project }: { project: IProject }) {
    if (!project.active) {
        return <Chip radius="sm" color="success" variant="bordered">Complete</Chip>;
    }
    if (project.draft) {
        return <Chip radius="sm" color="secondary" variant="bordered">Draft</Chip>;
    }
    return <Chip radius="sm" color="success" variant="bordered">Active</Chip>;
}

function PackStrip({ packs }: { packs: IPack[] }) {
    const getStatus = useCallback((pack: IPack, previous?: IPack) => {
        if (pack.releaseDate) {
            return "released";
        }
        if (previous?.releaseDate) {
            return "current";
        }
        return "upcoming";
    }, []);
    return (
        <div className="px-6 py-4">
            <p className="font-display text-[7.5px] tracking-[2.5px] uppercase text-foreground/40 mb-3">
                Packs
            </p>
            <div className="flex flex-wrap gap-1.5">
                <span className="italic">Coming Soon</span>
                {/* {packs.map((pack) => {
                    const status = getStatus(pack);
                    return (
                        <span
                            key={pack.code}
                            title={pack.name}
                            className={classNames("font-display text-[8px] tracking-[1px] uppercase px-2 py-1 border", packClasses[status])}
                        >
                            {pack.code}{pack.releaseDate ? " ◆" : ""}
                        </span>
                    );})} */}
            </div>
        </div>
    );
}

function deriveProgress(project: IProject): number {
    // const weights: Record<keyof CardProgress, number> = {
    //     total: 100,
    //     mechanics: 25,
    //     wording:   25,
    //     fileCreated: 25,
    //     released:  25
    // };
    // const total = Object.entries(weights).reduce((sum, [key, weight]) => {
    //     const k = key as keyof CardProgress;
    //     return sum + (cardProgress[k] / cardProgress.total) * weight;
    // }, 0);
    // return Math.round(total);

    // TODO: Implement (currently returning fake number)
    return 12;
}

// const statusClasses: Record<"active" | "draft" | "complete", string> = {
//     active:        "text-success-700 border-success-300 bg-success-100",
//     draft:         "text-foreground/50 border-content3 bg-content2",
//     complete:      "text-foreground/40 border-content3 bg-content2"
// };

// const packClasses: Record<"released" | "current" | "upcoming", string> = {
//     released: "bg-primary-100 border-primary-300 text-primary-700",
//     current:  "bg-background border-primary text-primary",
//     upcoming: "bg-content2 border-content3 text-foreground/40"
// };

// type CardProgress = {
//   total: number;
//   mechanics: number;
//   wording: number;
//   fileCreated: number;
//   released: number;
// };