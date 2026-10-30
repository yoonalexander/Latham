# Decision index

The [technical design](../Latham_Design_Document.md) defines the product contracts;
the [roadmap](../roadmap.md) defines sequence.

| Topic | Current decision | Location |
|---|---|---|
| Project foundation | Independent Latham code/assets; reference repos remain conceptual | Design 1.2 |
| First scope | Chrome on Windows; desktop applications next | Design 1.1 and roadmap |
| Phase 0 execution | Bundled local fixture only, no live-site/OS adapter | architecture.md |
| UI | Electron/React command desk with tray and always-available Stop | apps/desktop |
| Permissions | Fixture consent persists; every launch stays paused | core and main/storage |
| AI access | Cloud user keys or local ASR/decisions; not connected in Phase 0 | Design 6.5 |
| Cancellation | Local controller fence; preserve in-flight uncertainty and require reset | core |
| Logs | Off-by-default bounded metadata, no command/page values | storage and evaluation |
| Website grants | Remember approved sites in real Chrome; future Phase 1–2 | Design 9.3 |

## Phase 0 provenance and release checkpoint

Direct dependency versions/licenses are recorded in [dependencies.md](dependencies.md).
The application, fixtures, UI and icon were implemented independently. No
reference-app code/assets or models are included. Dependency/runtime downloads
are explicit development setup; generated bundles and test data are not committed.

This checkpoint establishes provenance records, not a new distribution license.
Latham's source license, contributor terms and installer distribution terms
remain unselected. Review them before accepting external contributions,
advertising a licensed public release, distributing a packaged installer, or
adding third-party/model material. The user's requested source commit/push
does not imply a choice of license or completion of a legal review.

Remaining implementation choices include local ASR/text models, tested minimum
hardware/languages, the final first-site set, and later release mechanics.
