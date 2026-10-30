# Decision index

The [technical design](../Latham_Design_Document.md) is the source of current
decisions. This index does not introduce new architecture decisions.

| Topic | Current direction | Design location |
|---|---|---|
| Independent project and references | Original Latham implementation; no reference-app fork/import | Section 1.2 |
| First scope | Chrome on Windows; desktop apps next | Sections 1.1 and 10 |
| AI access | User-supplied cloud keys or validated local speech/decisions | Sections 6.1 and 6.5 |
| Website consent | Remember approved sites; current grants and active session still required | Section 9.3 |
| Consequential/unknown effects | Block in P0; later dedicated integrations require separate review | Section 8.1 |
| Cancellation | Controller receipt, executor fence, acknowledgement and in-flight effects | Section 5.8 |
| Product delivery | Follow milestone gates, not assumed completion | roadmap.md |

Exact local models, minimum hardware, initial speech languages, the final first
site list, visual identity, distribution/contribution terms and release mechanics
remain open. Record subsequent decisions with rationale and validation evidence
when implementation makes them concrete.
