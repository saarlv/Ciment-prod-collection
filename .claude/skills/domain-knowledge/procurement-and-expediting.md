# Procurement and expediting

For apps that buy from suppliers and follow orders to the dock: requisitions, quotes, POs, expediting, receiving, invoice matching.

Every line below held in at least 3 independent builds.

## Lifecycle

Need → requisition → quotes → award → PO → supplier acknowledgement → expediting → receipt → three-way match → payment.

## Buying

- Check stock before buying: available = on hand + on order − committed. Often the answer is "take it from stock".
- Quotes are only comparable after normalizing: same unit of measure, landed cost (freight, duties, currency), lead time.
- The cheapest quote is often the wrong award. Lead time, reliability and quality count too.
- Quotes expire. Keep a validity date on each one.
- Keep unit of measure, price unit and pack or minimum-order rounding on every line. A price per 100 is not a price change.
- A person approves every commitment, in tiers by value. The tier follows the amount, never the urgency.

## Acknowledgement and expediting

- A PO is not a commitment until the supplier acknowledges it. Track acknowledgement as its own state and chase it.
- Record the supplier's confirmed price and date as stated. Compare them with the PO and show each gap to the buyer.
- Measure lateness against the date the goods are needed, not the supplier's promise. Show what is at risk downstream.
- Watch for moved dates and silent suppliers. A shipment with no dispatch confirmation is not cover.
- A late-order alert says who is affected and the options (expedite, split, other source) with their cost.
- Import orders add a forwarder, shipping documents and customs. Local orders don't. Customs is a delay risk of its own.
- Suppliers answer on different channels. Chase each one where it actually replies.

## Receiving and invoices

- Book receipts against what physically arrived. Short, damaged, wrong or extra goods become supplier discrepancies, never silently accepted.
- Match PO, receipt and invoice within a tolerance before paying.
- Match exceptions have stable types (price, quantity, missing receipt, no PO, duplicate), and each type has a different owner.
- An invoice that arrives before its goods is waiting, not wrong. It is not paid before the receipt.
- On a short or disputed invoice, the undisputed part can move forward. Hold only the difference.
- Flag duplicate invoices before anything is paid.
- A changed supplier bank detail stops payment until a person confirms it through a known contact.
- Keep a supplier scorecard from real history: on-time delivery, fill rate, price against benchmark, response time.

## Ask the customer (companies differ)

- What tolerances apply to price, quantity and dates? Is price held stricter than quantity?
- How many approval tiers, who approves each, and is approving separate from releasing payment?
- Who owns each exception type?
- How many suppliers get a quote request, and when is it skipped?
- What decides an award: price, on-time record, total cost?
- Are partial shipments allowed?
- Do goods need certificates or quality documents before they count as received?
- What is a PO charged to: job, project, cost center?
- Which system is the source of truth for POs, and how clean are its open lines?
