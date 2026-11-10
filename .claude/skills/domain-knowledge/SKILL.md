---
name: domain-knowledge
description: Domain guides for common business functions — how companies in that line of work actually operate, distilled from real customer builds on Blocks. Each guide gives the lifecycle, the rules that held across at least 3 independent companies, and the questions where companies differ. Load it whenever the app you are planning, building or changing runs a company's business process, such as buying, selling, operations or finance; its index says which functions have a guide.
user-invocable: false
---

# Domain knowledge

Each guide here describes one business function as companies really run it. They were distilled from
the domain files of real apps built on Blocks for different companies, and a rule is in a guide only
if it held in at least 3 of them, independently. No guide names a customer.

**Read only the guide the work needs.**

| Guide                                                         | Read it when the app…                                                                                                  |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [Procurement and expediting](./procurement-and-expediting.md) | buys from suppliers and follows orders to the dock: requisitions, quotes, POs, expediting, receiving, invoice matching |
| [Order intake and quoting](./order-intake-and-quoting.md)     | turns customer orders and quote requests (email, PDF, phone, portal) into quotes or orders                             |

## How to use a guide

- **Use it to see further, not to ask less.** A guide shows what the industry handles routinely, so
  the plan covers cases the customer may not mention. It never replaces discovery: the customer's
  own answers still decide the app.
- **The rules are a baseline, not this customer's answer.** When the customer does something
  differently, follow the customer and note the difference in `memories/STORY.md`.
- **"Ask the customer" lines are questions, never defaults.** Companies differ on each one. Ask the
  ones the request leaves open; never assume an answer.
- **Read it whenever the work touches the function**: planning a new app, designing a table, an
  agent or a workflow, or changing an existing app in that function.
- **Keep writing the app's own `memories/USECASE.md`.** Don't copy a guide into it. USECASE.md holds
  what this app's discovery taught about its domain; the guide is shared and stays here.
