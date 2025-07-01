export default function generatePaymentLink({
  paymentMethodUrl,
  merchantNumber,
  amount,
  referenceCode,
}: {
  paymentMethodUrl: string;
  merchantNumber: string;
  amount: number;
  referenceCode: string;
}) {
  return paymentMethodUrl
    .replace("{merchant}", merchantNumber)
    .replace("{amount}", amount.toString())
    .replace("{ref}", referenceCode);
}
