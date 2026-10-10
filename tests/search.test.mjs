import test from 'node:test';
import assert from 'node:assert/strict';
import { WebError } from '@deepseek-ai/dsh-web';
import { PerplexityRawSearch } from '../lib/search/perplexity.js';
import { DoubaoSearch } from '../lib/search/doubao.js';
import { SearchRouter } from '../lib/search/router.js';
import { source, canonicalURL, mergeSources } from '../lib/search/normalize.js';
import { postJSON } from '../lib/search/http.js';

const fake = (id, run) => ({ id, available: () => true, search: run });
const outcome = (url, provider) => ({ sources: [source({ url, title: 'Evidence' }, provider)], truncated: false });

test('raw search protocols, rotated credentials, Custom Summary and Global text snippets', async () => {
  const original = globalThis.fetch, calls = []; let key = 'initial';
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(options.redirect, 'error'); assert.ok(options.signal);
      assert.equal(options.headers.Authorization, `Bearer ${key}`);
      const body = JSON.parse(options.body); calls.push({url, body});
      if (url.endsWith('/search')) return Response.json({results: [{url:'https://example.com/a?utm_campaign=x',title:'Page',snippet:'raw evidence',date:'2026-10-09',last_updated:'2026-10-10'}]});
      if (url.endsWith('/global_search')) return Response.json({ResponseMetadata:{RequestId:'fixture'},Result:{ErrorCode:0,Documents:[{Url:'https://example.org/b',Title:'Global',Snippet:[{Type:'image',Image:{ImageUrl:'https://ignored.example/img'}},{Type:'text',Text:'Global evidence'}],DocumentInfo:{PublishTime:'2026-10-08T12:00:00+08:00'},HostInfo:{Hostname:'Example'}}]}});
      return Response.json({ResponseMetadata:{RequestId:'fixture'},Result:{WebResults:[{Url:'https://example.cn/c',Title:'Custom',Snippet:'short display text',Summary:'Evidence summary',Content:'FULL BODY SHOULD NEVER REACH MODEL',SiteName:'Publisher',PublishTime:'2026-10-08T12:00:00+08:00'}]}});
    };
    const p = new PerplexityRawSearch(async () => key);
    const raw = await p.search({query:' API ',maxResults:3});
    assert.equal(raw.content,undefined); assert.equal(raw.sources[0].url,'https://example.com/a');
    assert.equal(raw.sources[0].publishedAt,'2026-10-09');
    assert.equal(calls[0].body.query,'API'); assert.equal(calls[0].body.max_results,3); assert.equal(calls[0].body.model,undefined);
    key = 'rotated'; await p.search({query:'rotation'});
    const custom = await new DoubaoSearch(async () => key).search({query:'中文搜索',maxResults:4});
    assert.equal(custom.sources[0].snippet,'Evidence summary'); assert.equal(custom.sources[0].source,'Publisher');
    assert.equal(JSON.stringify(custom).includes('FULL BODY'),false);
    assert.deepEqual(calls[2].body,{Query:'中文搜索',SearchType:'web',Count:4,Filter:{NeedContent:false,NeedUrl:true}});
    const global = await new DoubaoSearch(async () => key,'global').search({query:'global'});
    assert.equal(global.sources[0].snippet,'Global evidence'); assert.equal(global.sources[0].publishedAt,'2026-10-08T12:00:00+08:00');
    assert.equal(calls[3].body.Count,undefined); assert.equal(calls[3].body.DocCount,8);
    await assert.rejects(new DoubaoSearch(async () => key).search({query:'字'.repeat(101)}),e=>e.code==='WEB_SEARCH_QUERY_TOO_LONG');
    assert.equal(calls.length,4);
  } finally { globalThis.fetch = original; }
});

test('canonical dedupe preserves semantic parameters, dates, both indexes and host diversity', () => {
  assert.equal(canonicalURL('https://EXAMPLE.com:443/a?utm_source=x&b=2&a=1#heading'),'https://example.com/a?a=1&b=2');
  assert.equal(canonicalURL('https://example.com/a?ref=article&id=2'),'https://example.com/a?id=2&ref=article');
  const credentialURL = new URL('https://example.com'); credentialURL.username = 'user'; credentialURL.password = 'password';
  for (const url of ['javascript:alert(1)','file:///etc/passwd',credentialURL.href]) assert.equal(canonicalURL(url),undefined);
  const p = 'perplexity-search-raw', d = 'doubao-search';
  const rows = [source({url:'https://a.example/shared?utm_source=p',title:'Title',snippet:'x'.repeat(5000),publishedAt:'2026-10-09'},p),...Array.from({length:6},(_,i)=>source({url:`https://a.example/${i}`},p))];
  const merged = mergeSources([rows,[source({url:'https://a.example/shared#ref',snippet:'other',publishedAt:'2026-10-08'},d),source({url:'https://b.example/independent'},d)]],4);
  assert.equal(merged.sources.length,4); assert.equal(merged.truncated,true);
  assert.deepEqual(merged.sources[0].metadata.providers,[p,d]); assert.equal(merged.sources[0].publishedAt,'2026-10-09');
  assert.equal(merged.sources[0].snippet.length,800); assert.equal(merged.sources[1].url,'https://b.example/independent');
});

test('routing uses query language, cross-checks both indexes and never defaults to official', async () => {
  const calls=[], traces=[];
  const ids=['perplexity-search-raw','doubao-search','deepseek-official'];
  const providers=new Map(ids.map(id=>[id,fake(id,async()=>{calls.push(id);return outcome(`https://${id}.example/evidence`,id);})]));
  const router=new SearchRouter(providers,'auto',false,trace=>traces.push(trace));
  await router.search({query:'TypeScript release'}); assert.deepEqual(calls,['perplexity-search-raw']); calls.length=0;
  await router.search({query:'北京 天气'}); assert.deepEqual(calls,['doubao-search']); calls.length=0;
  const result=await router.search({query:'事实核查：今天的重大新闻',maxResults:2});
  assert.deepEqual(calls,['doubao-search','perplexity-search-raw']); assert.equal(result.sources.length,2);
  assert.match(result.content,/Cross-check requires independent publishers/); assert.equal(traces.at(-1).policy,'cross-check');
  assert.equal(calls.includes('deepseek-official'),false);
  await new SearchRouter(providers,'deepseek-official').search({query:'explicit'}); assert.equal(calls.at(-1),'deepseek-official');
});

test('partial index failure is disclosed; empty/error failover stays bounded; official fallback requires opt-in', async () => {
  const calls=[];
  const providers=new Map([
    ['perplexity-search-raw',fake('perplexity-search-raw',async()=>{calls.push('p');throw new WebError('private vendor payload','WEB_SEARCH_HTTP_429');})],
    ['doubao-search',fake('doubao-search',async()=>{calls.push('d');return outcome('https://evidence.example/', 'doubao-search');})],
    ['deepseek-official',fake('deepseek-official',async()=>{calls.push('o');return outcome('https://official.example/','deepseek-official');})],
  ]);
  const partial=await new SearchRouter(providers,'cross-check').search({query:'fact check'});
  assert.equal(partial.sources.length,1); assert.match(partial.content,/WEB_SEARCH_HTTP_429/); assert.equal(partial.content.includes('private vendor payload'),false);
  assert.deepEqual(calls,['p','d']); calls.length=0;
  providers.set('doubao-search',fake('doubao-search',async()=>{calls.push('d');throw new Error('fixture-secret');}));
  await assert.rejects(new SearchRouter(providers).search({query:'query'}),e=>e.code==='WEB_SEARCH_ALL_FAILED'&&!e.message.includes('fixture-secret'));
  assert.deepEqual(calls,['p','d']); calls.length=0;
  const optIn=await new SearchRouter(providers,'auto',true).search({query:'query'});
  assert.deepEqual(calls,['p','d','o']); assert.equal(optIn.sources[0].url,'https://official.example/'); calls.length=0;
  providers.set('perplexity-search-raw',fake('perplexity-search-raw',async()=>{calls.push('p');return {sources:[],truncated:false};}));
  providers.set('doubao-search',fake('doubao-search',async()=>{calls.push('d');return {sources:[],truncated:false};}));
  const empty=await new SearchRouter(providers).search({query:'query'}); assert.equal(empty.sources.length,0); assert.deepEqual(calls,['p','d']);
});

test('cancellation prevents fallback and aborts all concurrent index work', async () => {
  const controller=new AbortController(),calls=[];
  const ids=['perplexity-search-raw','doubao-search','deepseek-official'];
  const providers=new Map(ids.map(id=>[id,fake(id,async(_request,signal)=>{
    calls.push(id);
    await new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  })]));
  const search=new SearchRouter(providers,'cross-check',true).search({query:'query'},controller.signal);
  controller.abort(new Error('stop'));
  await assert.rejects(search,e=>e.code==='WEB_ABORTED');
  assert.deepEqual(calls,['perplexity-search-raw','doubao-search']);
});

test('vendor errors, oversized and malformed bodies are bounded and cannot leak credentials', async () => {
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response('private-key-in-error',{status:401});
    await assert.rejects(new PerplexityRawSearch(async()=> 'secret').search({query:'q'}),e=>e.code==='WEB_SEARCH_HTTP_401'&&!e.message.includes('private-key'));
    globalThis.fetch=async()=>Response.json({ResponseMetadata:{Error:{Code:'secret',Message:'private'}},Result:null});
    await assert.rejects(new DoubaoSearch(async()=> 'secret').search({query:'q'}),e=>e.code==='WEB_SEARCH_API_ERROR'&&!e.message.includes('private'));
    globalThis.fetch=async()=>Response.json({ResponseMetadata:{},Result:{ErrorCode:700901,ErrorMsg:'secret',Documents:[]}});
    await assert.rejects(new DoubaoSearch(async()=> 'secret','global').search({query:'q'}),e=>e.code==='WEB_SEARCH_API_ERROR');
    globalThis.fetch=async()=>new Response('x'.repeat(2*1024*1024+1));
    await assert.rejects(postJSON('test','https://example.com',async()=> 'secret',{}),e=>e.code==='WEB_SEARCH_RESPONSE_TOO_LARGE');
    globalThis.fetch=async()=>new Response('not JSON');
    await assert.rejects(postJSON('test','https://example.com',async()=> 'secret',{}),e=>e.code==='WEB_SEARCH_INVALID_RESPONSE');
    let network=0;globalThis.fetch=async()=>{network++;};
    await assert.rejects(new PerplexityRawSearch(async()=>undefined).search({query:'q'}),e=>e.code==='WEB_PROVIDER_CREDENTIAL_MISSING');
    await assert.rejects(new PerplexityRawSearch(async()=>{throw new Error('secret');}).search({query:'q'}),e=>e.code==='WEB_PROVIDER_CREDENTIAL_ERROR'&&!e.message.includes('secret'));
    assert.equal(network,0);
  } finally {globalThis.fetch=original;}
});
