// Browser module using the installed client's public slot and form services.
window.__ModuleLoader__.load({
  id: 'dsh-vibe-paradigms',
  factory: require => {
    const { jsx, jsxs } = require('react/jsx-runtime');
    const { SettingsForm, SettingsFormModel, SettingsSecretField } = require('@deepseek-ai/dsh-client-ui-primitives');
    const namespace = 'vibe-search-settings', dictionary = 'vibe.searchSettings';
    const zh = {
      title: '搜索路由', description: 'Perplexity 与豆包搜索，供 Chat 和标准模式共用。DeepSeek 官方搜索默认不主动调用。',
      policy: '搜索策略', auto: '自动：英文优先 Perplexity，中文优先豆包', check: '交叉查询：同时使用两个索引', official: 'DeepSeek 官方搜索（费用较高）',
      edition: '豆包搜索版本', custom: 'Custom', global: 'Global', fallback: '其他索引失败或无结果时，允许 DeepSeek 官方搜索兜底',
      editionHint: '版本按所选接口调用，请确认已开通对应版本。', policyHint: '自动策略在核查类问题上使用双索引；摘要仍需核对原始来源。',
      officialHint: '官方提供方的密钥、接口地址和搜索预算在“网页搜索”中配置。',
      secretHint: '密钥存储在本地 credentials，留空保留当前密钥。', configured: '已配置密钥。', missing: '尚未配置密钥。',
      save: '保存', saving: '保存中…', saveFailed: '保存未成功，修改已保留供你重试。', readOnly: '当前设置只读。', unavailable: '搜索路由尚未加载。', reset: '恢复默认',
    };
    const en = {
      title: 'Search routing', description: 'Perplexity and Doubao search shared by Chat and Standard. DeepSeek official search is off by default.',
      policy: 'Search policy', auto: 'Auto: Perplexity for English, Doubao for Chinese', check: 'Cross-check: query both indexes', official: 'DeepSeek official search (higher cost)',
      edition: 'Doubao search edition', custom: 'Custom', global: 'Global', fallback: 'Allow DeepSeek official fallback when other indexes fail or return no results',
      editionHint: 'Uses the selected API; ensure this edition is enabled for your account.', policyHint: 'Auto uses both indexes for verification queries. Inspect primary sources to verify snippets.',
      officialHint: 'Configure official credentials, endpoint and search budget in Web search.',
      secretHint: 'Stored in local credentials. Leave blank to retain the current key.', configured: 'A key is configured.', missing: 'No key configured.',
      save: 'Save', saving: 'Saving…', saveFailed: 'Save failed. Your edits are retained for retry.', readOnly: 'Settings are read-only.', unavailable: 'Search routing is not loaded.', reset: 'Reset to default',
    };
    const enumField = (field, values) => ({field, format: value => String(value ?? values[0]), parse: text => values.includes(text) ? {kind:'set',value:text} : undefined});
    const boolField = {field:'allowOfficialFallback',format:value=>String(value ?? false),parse:text=>text==='true'||text==='false'?{kind:'set',value:text==='true'}:undefined};
    class CardController {
      constructor(ctx) {
        this.ctx = ctx; this.closed = false; this.generation = 0; this.credentials = {};
        this.scope = ctx.configForms.get(namespace);
        this.form = new SettingsFormModel(this.scope, [enumField('policy',['auto','cross-check','deepseek-official']), enumField('doubaoEdition',['custom','global']), boolField],
          ['perplexity','doubao'].map(key => ({field:key,write:async value=>{
            const ref=this.refs()[key]; const response=await ctx.remote.credentials.set(ref,value);
            if(!response.ok)return false;
            await this.refresh(); return this.credentials[key]?.configured === true;
          }})));
        this.store=this.form.bind(()=>this.projection());
        this.unsubscribe=this.scope.subscribe(()=>{void this.refresh();});
        void this.refresh();
      }
      refs(){const value=this.scope.getSnapshot().value;return {perplexity:value?.perplexityKeyEnv??'PERPLEXITY_API_KEY',doubao:value?.doubaoKeyEnv??'DOUBAO_SEARCH_API_KEY'};}
      projection(){return {...this.form.shell(),policy:this.form.field('policy'),edition:this.form.field('doubaoEdition'),fallback:this.form.field('allowOfficialFallback'),
        perplexity:this.form.field('perplexity'),doubao:this.form.field('doubao'),credentials:this.credentials};}
      async refresh(){
        const generation=++this.generation,refs=this.refs();
        // Clear old badges before asynchronous reads; no stale key status across refs.
        this.credentials=Object.fromEntries(Object.entries(refs).map(([key,ref])=>[key,this.credentials[key]?.ref===ref?this.credentials[key]:{ref,configured:false,writable:false}]));
        this.store.set(this.projection());
        try {
          const response=await this.ctx.remote.credentials.describe(Object.values(refs));
          if(this.closed||generation!==this.generation)return;
          if(!response.ok){this.credentials=Object.fromEntries(Object.entries(refs).map(([key,ref])=>[key,{ref,configured:false,writable:false}]));}
          else this.credentials=Object.fromEntries(Object.entries(refs).map(([key,ref])=>[key,{ref,configured:response.value[ref]?.configured??false,writable:response.value[ref]?.writable??false}]));
          this.store.set(this.projection());
        } catch {if(!this.closed&&generation===this.generation){this.credentials={};this.store.set(this.projection());}}
      }
      inject(){return {hooks:{vibeSearchCard:this.store},...this.form.actions()};}
      dispose(){this.closed=true;this.generation++;this.unsubscribe();this.form.dispose();}
    }
    function Card(props){
      const state=props.useVibeSearchCard(snapshot=>snapshot),t=props.t;
      if(props.view==='summary')return t('description');
      const disabled=!state.writable||state.saving;
      const select=(id,label,value,items,field,hint)=>jsxs('div',{style:{display:'grid',gap:'8px',marginBottom:'20px'},children:[
        jsx('label',{htmlFor:id,children:label}),jsxs('select',{id,value,disabled,onChange:event=>props.edit(field,event.target.value),style:{font:'inherit',padding:'8px',color:'inherit',background:'transparent',border:'1px solid #888',borderRadius:'6px'},children:items.map(([value,label])=>jsx('option',{value,children:label},value))}),jsx('p',{children:hint})]});
      return jsxs(SettingsForm,{state,labels:{unavailable:t('unavailable'),readOnly:t('readOnly'),saveFailed:t('saveFailed'),save:t('save'),saving:t('saving')},onSave:props.save,onDiscard:props.discard,children:[
        jsx('h3',{children:t('title')}),jsx('p',{children:t('description')}),
        select('vibe-search-policy',t('policy'),state.policy.text,[['auto',t('auto')],['cross-check',t('check')],['deepseek-official',t('official')]],'policy',t('policyHint')),
        select('vibe-search-edition',t('edition'),state.edition.text,[['custom',t('custom')],['global',t('global')]],'doubaoEdition',t('editionHint')),
        jsx('label',{style:{display:'flex',gap:'8px',marginBottom:'20px'},children:jsxs('span',{children:[jsx('input',{type:'checkbox',checked:state.fallback.text==='true',disabled,onChange:event=>props.edit('allowOfficialFallback',String(event.target.checked))}),t('fallback')]})}),
        ...['perplexity','doubao'].map(key=>jsx(SettingsSecretField,{id:'vibe-search-key-'+key,label:(key==='perplexity'?'Perplexity':'豆包 / Doubao')+' API Key',hint:t('secretHint'),disabled:state.saving||!state.credentials[key]?.writable,text:state[key].text,configured:state.credentials[key]?.configured??false,stateLabel:t(state.credentials[key]?.configured?'configured':'missing'),onEdit:text=>props.edit(key,text)},key)),
        jsx('p',{children:t('officialHint')}),jsx('button',{type:'button',disabled,onClick:()=>{for(const field of ['policy','doubaoEdition','allowOfficialFallback'])props.resetField(field);},children:t('reset')})]});
    }
    const inject=['slots','locale','remote','remote.credentials','configForms'];
    function apply(ctx){
      ctx.effect(()=>ctx.locale.register(dictionary,{zh,en}),'vibe-search: locale');
      const controller=new CardController(ctx);
      ctx.effect(()=>()=>controller.dispose(),'vibe-search: form');
      ctx.effect(()=>ctx.remote.$on('credentials/reference-updated',ref=>{if(Object.values(controller.refs()).includes(ref))void controller.refresh();}),'vibe-search: credentials');
      ctx.effect(()=>ctx.configForms.whileServed([namespace],()=>ctx.slots.inject('plugins.bundle.config',()=>ctx.slots.register({name:'plugins.bundle.config',key:'dsh-vibe-paradigms',locale:dictionary,inject:()=>controller.inject()},Card))),'vibe-search: settings card');
    }
    return {inject,apply};
  }
});
