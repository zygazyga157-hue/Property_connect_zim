import { PaymentReturnContent } from "@/components/payment-return-content";

type Props = { searchParams: Promise<{ reference?: string }> };

export default async function PaymentSuccessPage({ searchParams }: Props) {
  const { reference } = await searchParams;
  return <PaymentReturnContent reference={reference} />;
}
