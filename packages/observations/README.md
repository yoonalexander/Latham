# @latham/observations

Phase 0 fixture observation validation and capture normalization. Secure values
and hidden controls are omitted; target IDs are capture-bound and contexts carry
document identity plus permission/executor epochs.

The fixture adapter reads only its root document. Denied iframe contents are not
included. Raw values needed to verify allowed local edits remain transient in
the controller; the renderer receives target labels/roles, not those values.

Real Chrome document/frame binding and broader sensitive-content policy are
Phase 2 work. Windows UIA is Phase 3.
