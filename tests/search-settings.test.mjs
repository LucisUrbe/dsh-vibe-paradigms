import test from 'node:test';import assert from 'node:assert/strict';
import {Context,symbols} from '@deepseek-ai/cordis';import{Loader}from'@deepseek-ai/cordis-plugin-loader';import{WebRuntime}from'@deepseek-ai/dsh-web';
import{createOfficialSearch}from'../lib/search/official.js';

test('live Loader settings update existing root and isolated routers without remount; restored official options remain shared',async()=>{
 const ctx=new Context(),fetch=globalThis.fetch,requests=[];let released=0;
 try{
  ctx.baseUrl=new URL('../',import.meta.url).href;await ctx.plugin(Loader,{baseUrl:ctx.baseUrl});
  let official={ns:'web-search-deepseek',value:{baseURL:'https://example.com/anthropic/v1',model:'fixture-model',maxUses:2,maxTokens:512,apiKeyEnv:'FIXTURE_OFFICIAL'}};
  ctx.provide('settings',{configure:()=>()=>released++,describe:()=>[official]});
  ctx.provide('credentials',{resolve:async ref=>({value:'fixture-'+ref})});
  let accounts=0;ctx.provide('deepseekAccount',{resolveToken:async()=>{accounts++;return'fixture-account';}});
  const id=await ctx.loader.create({id:'vibe-search-settings',name:'dsh-vibe-paradigms/search-settings'});await ctx.loader.await();
  await ctx.plugin(WebRuntime,{searchProvider:'vibe-paradigms-search'});await ctx.loader.create({name:'dsh-vibe-paradigms/search'});await ctx.loader.await();
  const child=ctx.isolate('web');await child.plugin(WebRuntime,{searchProvider:'vibe-paradigms-search'});
  const search=await import('../lib/search/index.js');await child.plugin(search,{policy:'auto',doubaoEdition:'custom',allowOfficialFallback:false});
  const rootWeb=ctx.web,childWeb=child.web,ownerUid=ctx.loader.resolve(id).fiber.uid;
  assert.notEqual(rootWeb[symbols.original],childWeb[symbols.original]);
  globalThis.fetch=async(url,options)=>{
   requests.push({url,body:JSON.parse(options.body)});
   if(url.includes('perplexity'))return Response.json({results:[{url:'https://example.com/english',snippet:'English'}]});
   if(url.endsWith('global_search'))return Response.json({ResponseMetadata:{},Result:{Documents:[{Url:'https://example.org/global',Snippet:[{Type:'text',Text:'Global'}]}]}});
   return Response.json({ResponseMetadata:{},Result:{WebResults:[{Url:'https://example.org/custom',Summary:'Custom'}]}});
  };
  await rootWeb.search({query:'ordinary documentation'});assert.equal(requests.length,1);assert.match(requests[0].url,/perplexity/);
  await ctx.loader.update(id,{config:{policy:'cross-check',doubaoEdition:'global'}});await ctx.loader.await();
  assert.equal(ctx.loader.resolve(id).fiber.uid,ownerUid,'volatile update must preserve the owning fiber');assert.equal(ctx.vibeSearchSettings.options().policy,'cross-check');assert.ok(ctx.web[symbols.original] === rootWeb[symbols.original],'root web identity');assert.ok(child.web[symbols.original] === childWeb[symbols.original],'child web identity');
  const result=await childWeb.search({query:'ordinary documentation'});assert.equal(result.sources.length,2);assert.match(result.content,/Search policy: cross-check/);assert.ok(requests.some(r=>r.url.endsWith('global_search')));
  await rootWeb.search({query:'ordinary documentation'});assert.equal(requests.length,5);
  await ctx.loader.update(id,{config:{policy:'auto',doubaoEdition:'custom'}});await ctx.loader.await();
  const before=requests.length;await childWeb.search({query:'ordinary documentation'});assert.equal(requests.length,before+1);assert.equal(accounts,0);
  const provider=createOfficialSearch(child);globalThis.fetch=async(url,options)=>{assert.equal(url,'https://example.com/anthropic/v1/messages');assert.equal(options.headers['x-api-key'],'fixture-FIXTURE_OFFICIAL');const body=JSON.parse(options.body);assert.equal(body.model,'fixture-model');assert.equal(body.max_tokens,512);return Response.json({content:[{type:'web_search_tool_result',content:[{type:'web_search_result',url:'https://example.com/official'}]}]});};
  await provider.search({query:'explicit official'});assert.equal(accounts,0,'account token must not go to a custom endpoint');
  await ctx.loader.remove(id);await ctx.loader.await();assert.equal(released,1);assert.equal(ctx.get('vibeSearchSettings'),undefined);
 }finally{globalThis.fetch=fetch;await ctx.fiber.dispose();}
});
