import type {KuajingZyOrderResult,KuajingZyBinding,KuajingZyFrozenRequest,KuajingZyExpectedOrder} from "./types";
export const KUAJINGZY_DURABLE_SUBMIT:unique symbol;
export class KuajingZyPurchaseError extends Error {
  readonly classification:string;readonly code:string;readonly httpStatus:number|null;
}
export function createKuajingZyPurchaseClient(input:{
  apiKey:string|undefined;fetchImpl:typeof fetch;timeoutMs?:number;environment?:NodeJS.ProcessEnv;releaseGate?:boolean;
}):Readonly<{
  purchase(frozen:KuajingZyFrozenRequest,authority:typeof KUAJINGZY_DURABLE_SUBMIT,binding:KuajingZyBinding):Promise<KuajingZyOrderResult>;
  getOrder(id:string,expected:KuajingZyExpectedOrder):Promise<KuajingZyOrderResult>;
}>;
export function classifyKuajingZyOrder(result:KuajingZyOrderResult):string;
export function commitKuajingZyPrivateDelivery(result:KuajingZyOrderResult,commit:(content:string)=>Promise<unknown>|unknown):Promise<void>;
