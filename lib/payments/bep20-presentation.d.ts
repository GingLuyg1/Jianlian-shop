export type Bep20TimingInput = {
  chainStatus?: string | null;
  paymentAction?: string | null;
  submittedTxHash?: string | null;
  orderStatus?: string | null;
  paymentStatus?: string | null;
};

export type Bep20TimingVisibility = {
  showCountdown: boolean;
  showConfirmationProgress: boolean;
  hasSubmittedTxHash: boolean;
  manualReview: boolean;
  terminal: boolean;
};

export function getBep20TimingVisibility(input: Bep20TimingInput): Bep20TimingVisibility;
