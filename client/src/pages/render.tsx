import { useSearchParams } from "react-router-dom";
import { UUID } from "crypto";
import { useGetRenderJobQuery } from "../api";
import { CardPreview } from "@agot/card-preview";
import { IRenderCard } from "common/models/cards";
import { JSX } from "react";
import type { BatchRenderJob, SingleRenderJob } from "server/types";

const Render = () => {
    const [searchParams] = useSearchParams();
    const id = searchParams.get("id") as UUID;

    const { data: job, isLoading, isError, error } = useGetRenderJobQuery({ id });

    if (isError) {
        return <div id="render-error">{JSON.stringify(error)}</div>;
    }
    if (isLoading || job?.data.length === 0) {
        return <div/>;
    }

    const generateSingleSheet = (job: SingleRenderJob) => {
        const orientation = job.options?.orientation;
        const rounded = job.options?.rounded;
        return job.data.map(({ id, card }) =>
            <div key={id} data-card-id={id} className="w-[240px] h-[333px]">
                <CardPreview card={card} rounded={rounded ?? false} orientation={orientation}/>
            </div>
        );
    };

    const generateBatchSheet = (job: BatchRenderJob) => {
        const pages: JSX.Element[] = [];
        const copies = job.options?.copies ?? 1;
        const perPage = job.options?.perPage ?? 9;

        let pageNo = 1;
        let completed = 0;
        const allData = job.data.flatMap(i => Array.from({ length: copies }).fill(i) as { id: UUID, card: IRenderCard }[]);
        do {
            const pageData = allData.slice((pageNo - 1) * perPage, pageNo * perPage);
            const sheet = Array.from({ length: perPage }).map((_, index) => {
                const data = pageData[index];
                return (
                    <div key={data?.id ?? index} data-card-id={data?.id} className="w-[240px] h-[333px] m-[0.5px]">
                        {data?.card !== undefined && <CardPreview card={data.card} rounded={false} orientation="vertical"/>}
                    </div>
                );
            });
            const page = (
                <div className="w-[794px] h-[1124px]">
                    <div className="h-full flex flex-row flex-wrap justify-center content-center">
                        {sheet}
                    </div>
                </div>
            );
            pages.push(page);
            pageNo++;
            completed += pageData.length;
        } while (completed < allData.length);

        return pages;
    };

    const generateContent = () => {
        switch (job?.type) {
            case "single":
                return generateSingleSheet(job);
            case "batch":
                return generateBatchSheet(job);
        }
    };
    return <div className="renderContainer bg-white w-fit h-fit">{generateContent()}</div>;
};

export default Render;