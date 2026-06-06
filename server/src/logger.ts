import winston from "winston";

export default class LoggerService {
    private static serialize = (error: Error, isCause: boolean = false) => `${isCause ? "Caused by " : ""}${error.stack}\n${"cause" in error && !!error.cause ? this.serialize(error.cause as Error, true) : ""}`;

    private static formatError = winston.format((info) => {
        if (info instanceof Error) {
            return {
                ...info,
                message: LoggerService.serialize(info)
            };
        }

        return info;
    });

    public static initialise() {
        const baseFormat = [
            winston.format.timestamp({ format: "YYYY-MM-DD hh:mm:ss" }),
            this.formatError(),
            winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
        ];
        return winston.createLogger({
            format: winston.format.combine(...baseFormat),
            transports: [
                new winston.transports.Console({
                    forceConsole: true,
                    format: winston.format.combine(...(process.env.NODE_ENV === "production" ? [] : [winston.format.colorize({ level: true })]), ...baseFormat),
                    level: process.env.VERBOSE?.toLowerCase() === "true" ? "verbose" : "info"
                }),
                ...(process.env.NODE_ENV === "production" ? [
                    new winston.transports.File({ filename: "logs\\error.log", level: "error", handleExceptions: true }),
                    new winston.transports.File({ filename: "logs\\combined.log" })
                ] : [])
            ],
            exitOnError: false
        });
    }
}