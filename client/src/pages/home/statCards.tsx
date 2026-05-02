import classNames from "classnames";

export default function StatCards() {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4">
            <StatCard
                label="Card Changes · 7 days"
                value={19}
                footer={<>5 updated · 9 reworked · 5 replaced</>}
            />
            <StatCard
                label="Active Playtesters"
                value={5}
                accent="secondary"
                footer={<>in the last 14 days</>}
            />
            <StatCard
                label="Cards in testing"
                value={120}
                accent="warning"
                footer={<>across 1 project</>}
            />
            <StatCard
                label="Reviews"
                value={67}
                accent="danger"
                footer={<>across 14 playtesters</>}
            />
        </div>
    );
}

function StatCard({ label, value, footer, accent = "primary" }: StatCardProps) {
    return (
        <div className={classNames("bg-content2 px-5 py-5 border-t-2", accentBorder[accent])}>
            <p className="font-display text-[7.5px] tracking-[2.5px] uppercase text-foreground/50">
                {label}
            </p>
            <p className="text-5xl font-light text-foreground mt-2 leading-none">
                {value}
            </p>
            {footer && (
                <p className="text-sm italic text-foreground/50 mt-2">
                    {footer}
                </p>
            )}
        </div>
    );
}

const accentBorder = {
    primary:   "border-primary",
    success:   "border-success",
    danger:    "border-danger",
    warning:   "border-warning",
    secondary: "border-secondary"
} as const;

export type StatCardAccent = keyof typeof accentBorder;

export type StatCardProps = {
  label: string;
  value: number | string;
  footer?: React.ReactNode;
  accent?: StatCardAccent;
};