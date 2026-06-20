export type PaymentRecord = {
  id: string;
  payment_no: string;
  order_id: string;
  user_id: string;
  payment_method: string;
  amount: number;
  currency: string;
  status: string;
  transaction_reference: string | null;
  proof_url: string | null;
  proof_urls: string[];
  user_note: string | null;
  admin_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  orders?: {
    order_no?: string | null;
    total_amount?: number | string | null;
    payment_status?: string | null;
    status?: string | null;
    customer_email?: string | null;
  } | null;
};
