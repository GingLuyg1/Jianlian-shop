import assert from 'node:assert/strict';
import test from 'node:test';
import {loadTs, source} from '../helpers/payment-session-guard-harness.mjs';

// Small hook dispatcher to exercise the actual component's request/effect
// lifecycle without a browser, network, credentials or persisted state.
function mount() {
  const slots=[],effects=[],requests=[];let cursor=0,props,unmounted=false,lateWrites=0;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
  const hooks={
    useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,v=>{if(unmounted)lateWrites++;slots[i].value=typeof v==='function'?v(slots[i].value):v}]},
    useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial})},
    useCallback(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps))slots[i]={value:fn,deps};return slots[i].value},
    useEffect(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps)){const old=slots[i];slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn()})}},
  };
  const element=(type,props)=>({type,props});
  const component=loadTs('components/account/orders/SecureOrderDelivery.tsx',{
    react:hooks,'react/jsx-runtime':{jsx:element,jsxs:element},'next/link':{default:'a'},
    'lucide-react':{},sonner:{toast:{success(){},error(){}}},'@/components/ui/button':{Button:'button'},
    '@/lib/orders/delivery-polling.mjs':{pollForPaymentDelivery(){throw Error('POLLING_NOT_IN_THIS_TEST')}},
    '@/lib/orders/order-status':{normalizeOrderStatus:s=>s,normalizePaymentStatus:s=>s},'@/lib/utils':{cn:(...x)=>x.join(' ')},
  },undefined,{fetch:(url,options)=>new Promise(resolve=>requests.push({url,signal:options.signal,resolve})),navigator:{clipboard:{writeText:async()=>{}}}}).SecureOrderDelivery;
  function render(next=props,flush=true){props=next;cursor=0;const tree=component(props);if(flush)while(effects.length)effects.shift()();return tree}
  function stop(){unmounted=true;for(const slot of slots)slot?.cleanup?.()}
  return {render,stop,requests,get lateWrites(){return lateWrites},rows:()=>slots[0].value};
}
const props=no=>({orderNo:no,paymentStatus:'paid',orderStatus:'completed'});
const reply=async(request,no)=>{request.resolve({ok:true,json:async()=>({deliveries:[{id:no,delivery_status:'delivered',content:'SYNTHETIC-'+no}]})});await new Promise(r=>setImmediate(r))};
test('late old-order response cannot overwrite the new order, even if fetch ignores abort',async()=>{
  const h=mount();h.render(props('A'));assert.equal(h.requests.length,1);
  h.render(props('B'));assert.equal(h.requests.length,2);assert.equal(h.requests[0].signal.aborted,true);
  await reply(h.requests[1],'B');await reply(h.requests[0],'A');assert.deepEqual(h.rows(),{orderNo:'B',rows:[{id:'B',delivery_status:'delivered',content:'SYNTHETIC-B'}]});h.stop();
});
test('unmount aborts the pending delivery fetch and suppresses all late state updates',async()=>{
  const h=mount();h.render(props('A'));h.stop();assert.equal(h.requests[0].signal.aborted,true);await reply(h.requests[0],'A');assert.equal(h.lateWrites,0);
});
test('payment becoming unpaid discards pending paid-order response',async()=>{
  const h=mount();h.render(props('A'));h.render({...props('A'),paymentStatus:'unpaid'});assert.equal(h.requests[0].signal.aborted,true);await reply(h.requests[0],'A');assert.deepEqual(h.rows().rows,[]);h.stop();
});
test('refresh clicks share one in-flight private delivery request',()=>{
  const h=mount();const tree=h.render(props('A'));
  function all(n){return !n||typeof n!=='object'?[]:[n,...(Array.isArray(n.props?.children)?n.props.children:[n.props?.children]).flatMap(all)]}
  const button=all(tree).find(n=>n.type==='button'&&n.props.onClick);assert.ok(button);button.props.onClick();button.props.onClick();assert.equal(h.requests.length,1);h.stop();
});
test('product detail keeps required SKU fail-closed and exact support limit message',()=>{
  const text=source('app/products/[id]/page.tsx');assert.match(text,/product\?\.has_skus === true \|\| skus\.length > 0/);assert.match(text,/支付金额大于2000联系人工客服处理/);
});
test('new order hides already-revealed old content before effects have run',async()=>{
  const h=mount();h.render(props('A'));await reply(h.requests[0],'A');
  function all(n){return !n||typeof n!=='object'?[]:[n,...(Array.isArray(n.props?.children)?n.props.children:[n.props?.children]).flatMap(all)]}
  const view=all(h.render()).find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('显示完整内容'));
  assert.ok(view);view.props.onClick();assert.ok(JSON.stringify(h.render()).includes('SYNTHETIC-A'));
  assert.ok(!JSON.stringify(h.render(props('B'),false)).includes('SYNTHETIC-A'));h.stop();
});
