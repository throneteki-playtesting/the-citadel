import { DeepPartial } from "common/types";

export abstract class DataSerializer<Model> {
    public abstract richTextColumns: number[];
    public abstract matches(values: string[], index: number, filter: DeepPartial<Model>): boolean
    public abstract filter(values: string[], index: number, filter?: DeepPartial<Model>): boolean;
    public abstract deserialize(values: string[], index: number): Model;
    public abstract serialize(model: Model): string[]

    protected extractLinkText<T>(value: string, mappingFunc: (link: string, text: string) => T) {
        if (!value) {
            return null;
        }

        const regex = /<a\s+href="(.+)">([^<]*)<\/a>/gm;
        const groups = regex.exec(value);
        if (groups === null) {
            throw Error(`Failed to extract link/text from "${value}"`);
        }
        return mappingFunc(groups[1], groups[2]);
    }
}