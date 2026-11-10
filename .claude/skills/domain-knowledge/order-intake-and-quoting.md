# Order intake and quoting

For apps that turn customer orders and quote requests (email, PDF, phone, portal) into quotes or orders in the seller's system.

Every line below held in at least 3 independent builds.

## Lifecycle

Inbound message → classify → identify customer and delivery point → match lines to products → price → check credit → quote or order → confirm. Anything unclear goes to a person.

## Rules

- Requests arrive on several channels at once. Design intake for all of them, not just email.
- First classify each inbound item: firm order, request for a quote or availability, or not an order. Each takes a different path. A quote request treated as an order creates false demand.
- Requests are routinely incomplete. Customer, delivery point, quantity, date or spec are often missing. Decide the required fields per request type up front.
- When unsure, route to a person with the reason. Never guess a value, and never drop a request.
- Detect duplicates (re-sends, double entries) before anything is filed twice.
- Customers use their own part numbers, trade names and free text. Intake means translating them to the seller's products, including the unit of measure.
- Resolve every request to a known customer account and a specific delivery point. An unknown sender goes to a person.
- Price from the customer's current agreed terms, never copied from a past order. Expired or missing pricing is an exception.
- Discounts, price exceptions and credit holds are decided by named people. The app prepares and routes. It does not decide.
- Check the account's credit or hold status before committing an order or a special price.
- Capture the customer's required date. It is usually set by the customer's own deadline and can't move.
- Give every request an explicit status and a readable reason, so anyone can see where it stands.

## Ask the customer (companies differ)

- What should intake produce: an order in the ERP, a quote, or a task for a person?
- What identifies a duplicate: PO number, customer + job, something else?
- When information is missing: ask the customer back, or quote with stated assumptions?
- When may an order be created without a person reviewing it?
- Who owns quoting, pricing exceptions and approvals?
- Where do prices come from: contract, price list, special agreements?
- How detailed is a delivery point: site, branch, department, person?
- Are there order cut-offs or lead-time calendars that set the promised date?
- Which order types exist besides standard orders (for example bid-only, consignment, counter sale)?
