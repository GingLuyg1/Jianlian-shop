export type CallbackObservation = {
  requestId: string;
  provider: string | null;
  channel: string | null;
  sessionNo: string | null;
  receivedAt: string;
  signatureResult: string;
  processResult: string;
  httpStatus: number;
};

export function getCallbackRequestId(headers: Pick<Headers, "get">): string;
export function createCallbackObservation(input: {
  headers: Pick<Headers, "get">;
  channel?: string | null;
  receivedAt?: string;
}): CallbackObservation;
export function callbackObservationRecord(
  observation: CallbackObservation,
  update?: Partial<CallbackObservation>,
): CallbackObservation;
