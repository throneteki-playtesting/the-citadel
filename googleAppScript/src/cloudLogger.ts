export class Log {
    static supress = false;

    static information(message: string) {
        if (!Log.supress) {
            this.write("[Info]: " + message);
        }
    }

    static error(message: string) {
        if (!Log.supress) {
            this.write("[Error]: " + message);
        }
    }

    static write(message: string) {
        if (typeof Logger !== "undefined" && Logger.log) {
            Logger.log(message);
        } else {
            console.log(message);
        }
    }
}