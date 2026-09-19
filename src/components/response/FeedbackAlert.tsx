import { Alert } from '@mantine/core';
import { Response } from '../../parser/types';

export function FeedbackAlert({
  response,
  correctAnswer,
  alertConfig,
  attemptsUsed,
  trainingAttempts,
}: {
  response: Response;
  correctAnswer: string | undefined;
  alertConfig: Record<string, { visible: boolean; title: string; message: string; color: string }>;
  attemptsUsed: number;
  trainingAttempts: number;
}) {
  return alertConfig[response.id]?.visible ? (
    <Alert mb="md" title={alertConfig[response.id].title} color={alertConfig[response.id].color}>
      {alertConfig[response.id].message}
      {attemptsUsed >= trainingAttempts && trainingAttempts >= 0 && correctAnswer && (
        <>
          <br />
          <br />
          {`The correct answer was: ${correctAnswer}.`}
        </>
      )}
    </Alert>
  ) : null;
}
