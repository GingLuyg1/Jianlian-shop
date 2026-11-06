// Account-product selection evidence collector. Read-only, purchase-disabled.
// Daju Apple ID first; KuajingZy fallback only if verified Daju stock isn't suitable.
// For other brands query KuajingZy only, one documented search per brand.
// Never write raw upstream responses or credentials to stdout / public CI.
import { createDajuHttpClient } from '../lib/providers/daju/client-core.mjs';
import { createKuajingZyReadonlyClient } from '../lib/providers/kuajingzy/readonly-client.mjs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const FAMILIES = Object.freeze([
  { key:'apple-id', query:'Apple ID', pattern:/apple[\s_-]*id|苹果[\s_-]*(?:id|账号|帐号)|icloud/i },
  { key:'telegram', query:'Telegram', pattern:/telegram|电报|tg(?:账号|账户|成品|号)/i },
  { key:'threads', query:'Threads', pattern:/threads/i },
  { key:'instagram', query:'Instagram', pattern:/instagram|ins(?:账号|账户|成品|号)/i },
  { key:'outlook', query:'Outlook', pattern:/outlook|hotmail/i },
  { key:'google', query:'Gmail', pattern:/gmail|google[\s_-]*(?:mail|account)|谷歌(?:邮箱|账号|账户)/i },
  { key:'facebook', query:'Facebook', pattern:/facebook|脸书|fb(?:账号|账户|成品|号)/i },
  { key:'steam', query:'Steam', pattern:/steam/i },
]);
const giftCard = /礼品卡|充值卡|点卡|gift[\s_-]*card|充值码|钱包码|wallet[\s_-]*code/i;
const safeId = v => typeof v==='string' && /^[a-zA-Z0-9_-]{1,180}$/.test(v) ? v :
  Number.isSafeInteger(v) && v >= 0 ? String(v) : null;
const nonnegative = v => Number.isSafeInteger(v) && v >= 0 ? v : null;
const amount = v => {
  const s=typeof v==='number'&&Number.isFinite(v)?String(v):v;
  return typeof s==='string'&&/^(0|[1-9][0-9]{0,11})(?:\.[0-9]{1,4})?$/.test(s)?s:null;
};
const sanitizeTitle = v => {
  if(typeof v!=='string')return null;
  const s=v.replace(/https?:\/\/\S+/gi,'[URL]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[EMAIL]')
    .replace(/[\x00-\x1f\x7f-\x9f<>]/g,' ')
    .replace(/\s+/g,' ').trim();
  return s && s.length<=180 ? s : null;
};
const group = (family,title) => {
  if(family!=='google')return 'default';
  if(/教育|edu|学校|校园|enterprise|企业|域名|workspace/i.test(title))return 'google-edu-enterprise';
  return 'google-mail';
};
const ageHint = title => /老号|老帐号|老账号|aged|old[\s_-]*account/i.test(title)?'old_candidate':
  /新号|新帐号|新账号|new[\s_-]*account/i.test(title)?'new_candidate':'unverified';
const matchFamily = (family,title) => family.pattern.test(title) && !giftCard.test(title);
function projectDaju(row,family) {
  const title=sanitizeTitle(row.title), id=safeId(row.id);
  if(!title||!id||!matchFamily(family,title))return null;
  return Object.freeze({
    selectionId:'daju:'+id,provider:'daju',family:family.key,supplierProductId:id,
    title,groupKey:group(family.key,title),ageHint:ageHint(title),
    supplierSkuIds:[],skuDetailVerified:false,
    displayPriceCny:amount(row.price),finalFeeInclusiveDebitVerified:false,
    stockSnapshot:nonnegative(row.stock),stockAuthoritative:false,
    autoDeliveryObserved:typeof row.isAuto==='boolean'?row.isAuto:null,
    fulfillmentContractVerified:false,saleEnabled:false,
  });
}
function projectKuajing(row,family) {
  const title=sanitizeTitle(row.name),id=safeId(row.id);
  if(!title||!id||!matchFamily(family,title))return null;
  const variants=Array.isArray(row.variants)?row.variants:[];
  // Variant IDs are supplier catalogue identifiers, NOT tested order outcomes.
  const skuIds=variants.slice(0,20).map(v=>safeId(v?.id)).filter(Boolean);
  const prices=row.prices&&typeof row.prices==='object'&&!Array.isArray(row.prices)?row.prices:{};
  const stock=nonnegative(row.stock);
  return Object.freeze({
    selectionId:'kuajingzy:'+id,provider:'kuajingzy',family:family.key,supplierProductId:id,
    title,groupKey:group(family.key,title),ageHint:ageHint(title),
    supplierSkuIds:skuIds,skuDetailVerified:false,
    displayPriceCny:amount(prices.CNY)??amount(row.unitPrice),
    finalFeeInclusiveDebitVerified:false,
    stockSnapshot:stock,stockAuthoritative:false,
    autoDeliveryObserved:null,fulfillmentContractVerified:false,
    saleEnabled:false,
  });
}
const statusError = e => /^KUAJINGZY_[A-Z_0-9]+$|^DAJU_[A-Z_0-9]+$|^UPSTREAM_[A-Z_0-9]+$/.test(e?.code??'')?e.code:'SAFE_READ_FAILED';

/** Purely read-only orchestration. Stop immediately on the first supplier failure. */
export async function collectAccountShortlist({daju,kuajingzy}) {
  const out={operation:'READONLY_ACCOUNT_CANDIDATES',complete:false,blocked:null,requests:0,
    providers:{daju:'NOT_QUERIED',kuajingzy:'NOT_QUERIED'},
    families:Object.fromEntries(FAMILIES.map(f=>[f.key,{status:'NOT_QUERIED',count:0}])),
    candidates:[],purchaseEnabled:false,productionChanged:false};
  const push=(items,family) => {
    if(items.length>150 || out.candidates.length+items.length>500) throw Object.assign(new Error('bounded'),{code:'CATALOG_RESULT_LIMIT'});
    const dedup=new Set(out.candidates.map(x=>x.selectionId));
    for(const item of items){if(item&&!dedup.has(item.selectionId)){out.candidates.push(item);dedup.add(item.selectionId)}}
    out.families[family].count=out.candidates.filter(x=>x.family===family).length;
  };
  const apple=FAMILIES[0];
  try {
    out.requests++;
    const rows=await daju.getProducts('苹果');
    out.providers.daju='READ_PASS';
    if(!Array.isArray(rows))throw Object.assign(new Error('schema'),{code:'DAJU_CATALOG_SCHEMA_INVALID'});
    push(rows.map(row=>projectDaju(row,apple)).filter(Boolean),apple.key);
    const usableApple=out.candidates.some(p=>p.provider==='daju'&&p.family===apple.key
      &&p.stockSnapshot!==null&&p.stockSnapshot>0&&p.autoDeliveryObserved===true);
    out.families[apple.key].status=usableApple?'DAJU_AVAILABLE':'KUAIJINGZY_FALLBACK_PENDING';
    // Apple fallback is a candidate discovery only, never an automatic supplier switch.
    const queryFamilies=usableApple?FAMILIES.slice(1):FAMILIES;
    for(const family of queryFamilies){
      out.requests++;
      const response=await kuajingzy.readMallCatalogFiltered({search:family.query});
      out.providers.kuajingzy='READ_PASS';
      if(!response||response.data?.domain!=='mall'||!Array.isArray(response.data.items))
        throw Object.assign(new Error('schema'),{code:'KUAJINGZY_CATALOG_SCHEMA_UNVERIFIED'});
      push(response.data.items.map(row=>projectKuajing(row,family)).filter(Boolean),family.key);
      out.families[family.key].status='READ_PASS_PARTIAL_FILTER';
    }
    if(usableApple)out.families[apple.key].status='DAJU_AVAILABLE';
    out.complete=true;
  }catch(error){out.blocked=statusError(error);out.complete=false;}
  return out;
}

/** CLI never logs raw responses. Output file must be a new protected location. */
async function run() {
  const outputPath=process.env.JIANLIAN_SHORTLIST_OUTPUT;
  const dajuKey=process.env.DAJU_API_KEY, kuajingKey=process.env.KUAJINGZY_API_KEY;
  if(!outputPath||!dajuKey||!kuajingKey)throw Error('CREDENTIALS_OR_OUTPUT_UNAVAILABLE');
  const daju=createDajuHttpClient({
    baseUrl:process.env.DAJU_API_BASE_URL||'https://ai.hanfolk.xyz/content/plugins/seller_api/api.php',
    apiKey:dajuKey,timeoutMs:10000,
  });
  const kuajingzy=createKuajingZyReadonlyClient({apiKey:kuajingKey,fetchImpl:fetch,timeoutMs:12000});
  const result=await collectAccountShortlist({daju,kuajingzy});
  await writeFile(outputPath,JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
  process.stdout.write(JSON.stringify({operation:result.operation,complete:result.complete,
    blocked:result.blocked,requests:result.requests,candidates:result.candidates.length,
    resultStored:true,purchaseExecuted:false,productionChanged:false})+'\n');
  if(!result.complete)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  run().catch(()=>{process.stderr.write('SHORTLIST_PRECONDITION_FAILED\n');process.exitCode=1;});
}
