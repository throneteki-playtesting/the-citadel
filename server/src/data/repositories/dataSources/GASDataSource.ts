import GasClient from "@/google/gasClient";
import { DeepPartial, SingleOrArray } from "common/types";

abstract class GASDataSource<T> {
    protected client: GasClient;
    constructor() {
        this.client = new GasClient();
    }
    abstract create(creating: SingleOrArray<T>, options?: object): Promise<T[]>;
    abstract read(reading?: SingleOrArray<DeepPartial<T>>, options?: object): Promise<T[]>;
    abstract update(updating: SingleOrArray<T>, options?: object): Promise<T[]>;
    abstract destroy(deleting: SingleOrArray<DeepPartial<T>>, options?: object): Promise<number>;
}

export default GASDataSource;
