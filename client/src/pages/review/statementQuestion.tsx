import { ButtonGroup, Button } from "@heroui/react";
import { StatementAnswer } from "common/models/reviews";
import StatementAnswerIcon from "../../components/statementAnswerIcon";
import { useWizard } from "../../components/wizard/context";
import { statementOptions } from "../../constants";

export default function StatementQuestion({
    name,
    statement,
    answer,
    onValueChange = () => true
}: StatementQuestionProps) {
    const { validationErrors } = useWizard();

    return (
        <div className="flex flex-col gap-1 max-w-[40rem]">
            <div className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                <span className="text-base md:text-lg font-cinzel">{statement}</span>
                <ButtonGroup size="sm">
                    {statementOptions.map(({ value }) => (
                        <Button
                            key={value}
                            color={answer === value ? "primary" : "default"}
                            variant="bordered"
                            aria-label={value}
                            onPress={() => onValueChange(answer === value ? undefined : value)}
                        >
                            <StatementAnswerIcon answer={value} tooltip={false} />
                        </Button>
                    ))}
                </ButtonGroup>
            </div>
            {name && validationErrors[name] && <div className="text-tiny text-danger">{validationErrors[name]}</div>}
        </div>
    );
}

type StatementQuestionProps = {
    name?: string;
    statement: string;
    answer?: StatementAnswer;
    onValueChange?: (value?: StatementAnswer) => void;
};
