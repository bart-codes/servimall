// DRAFT. Replace the [placeholders], have a Kenyan advocate review it, then publish.
// The longer version is in the workspace doc (section 5).
const SECTIONS: { title: string; body: string[] }[] = [
  { title: 'About these terms', body: ['These terms govern your use of [Platform Name] (the Platform), operated by [Your legal name or company name], [town], Kenya. By creating an account or using the Platform you agree to them.'] },
  { title: 'Who can use the Platform', body: ['You must be 18 or older, or have a parent or guardian book for you. Give accurate information and keep your login private. You are responsible for activity on your account.'] },
  { title: 'What the Platform is', body: ['The Platform is a marketplace that connects customers with independent businesses (Shops). We are not the provider of the services or goods listed. Each booking is a contract between you and the Shop. At launch the Platform covers [local area] only.'] },
  { title: 'Bookings, prices and payment', body: ['A booking is confirmed when you receive a confirmation and any required deposit is paid. Your slot and stock are held for 10 minutes while you pay. Prices are in Kenyan shillings and are paid by M-Pesa. We never see your M-Pesa PIN. Goods are paid in full at checkout; services may need a deposit that counts toward the price.'] },
  { title: 'Cancellations and refunds', body: ['Each Shop sets a cancellation policy shown on its page. Unless the Shop says otherwise: more than [48] hours before, a full refund of the deposit; [24 to 48] hours before, [50%]; less than [24] hours before or no-show, no refund. Refunds go to the M-Pesa number used to pay, usually within [5 to 10] working days.', 'Goods and deliveries: check your order on delivery and report damaged, missing or spoiled items within [24] hours with a photo. Because goods are perishable, items delivered in good condition cannot be returned. Be reachable at the delivery address in your chosen window; a redelivery fee of [amount] may apply if you are not.'] },
  { title: 'Shop obligations', body: ['Shops must describe their offers accurately, hold the licences and permits they need (for example health and food handling certificates, waste handling licences), follow hygiene and safety rules, honour confirmed bookings and use customer data only to deliver the booked service. Tattoo Shops must not tattoo anyone under 18 or visibly intoxicated.'] },
  { title: 'Acceptable use', body: ['Do not use the Platform for anything illegal, fraudulent or abusive, post false reviews, bypass payments to avoid commission, or try to hack or overload it.'] },
  { title: 'Privacy and personal data', body: ['We handle personal data under the Kenya Data Protection Act, 2019. We collect your name, phone number, addresses for bookings, booking history, payment references and usage data to run bookings and payments, send confirmations, prevent fraud and meet legal duties. The Shop you book sees what it needs to deliver the service. We do not sell your data. You can ask to access, correct or delete your data at [privacy email], and you may complain to the Office of the Data Protection Commissioner.'] },
  { title: 'Liability', body: ['The Platform is provided as is. We are not responsible for the quality, safety or legality of Shop services beyond what the law requires. Our liability to you is limited to the amount you paid for the booking in question, to the extent the law allows. Nothing here limits your rights under the Consumer Protection Act, 2012.'] },
  { title: 'Disputes and governing law', body: ['Contact [support email / phone] first and we will try to resolve it within [14] days. Then mediation before court. These terms are governed by the laws of Kenya.'] },
  { title: 'Changes and contact', body: ['We may update these terms and will tell you about material changes. Contact: [Your name or company], [address], [phone], [email].'] },
];

export default function Terms() {
  return (
    <article className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-3xl font-extrabold">Terms of use</h1>
      <p className="rounded-md border border-sun bg-sun-soft px-3 py-2 text-sm">Draft v1.0. Not yet reviewed by a lawyer. Replace the placeholders in square brackets before launch.</p>
      {SECTIONS.map((s) => (
        <section key={s.title} className="space-y-2">
          <h2 className="text-xl font-bold">{s.title}</h2>
          {s.body.map((p) => <p key={p.slice(0, 24)} className="leading-relaxed">{p}</p>)}
        </section>
      ))}
    </article>
  );
}
