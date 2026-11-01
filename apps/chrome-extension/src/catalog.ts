import { sites, siteForPage, navigationMatches, searchDestination, filterDestination, reviewedResult } from "../../../packages/contracts/src/sites";
import { workflowLimits } from "../../../packages/contracts/src/workflow";
import { nativeProtocol } from "../../../packages/contracts/src/compatibility";
Object.assign(globalThis, { lathamCatalog: { nativeProtocol, sites, siteForPage, navigationMatches, searchDestination, filterDestination, reviewedResult, workflowLimits } });
